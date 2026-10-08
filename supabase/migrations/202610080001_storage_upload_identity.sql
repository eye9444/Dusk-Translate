-- Storage checks permissions as the caller, then finalizes as service_role.
-- Its final row retains the verified uploader in owner_id, not auth.uid().
create or replace function public.enforce_cloud_upload() returns trigger
language plpgsql security definer set search_path='' as $$
declare reservation public.cloud_upload_reservations; actual_bytes bigint; previous_bytes bigint:=0; uploader text;
begin
 if new.bucket_id<>'books' then return new; end if;
 if new.metadata is null or new.metadata->>'size' is null then return new; end if;
 uploader:=auth.uid()::text;
 if session_user='supabase_storage_admin' and current_setting('role',true) in ('service_role','supabase_storage_admin') then
   uploader:=new.owner_id;
 end if;
 select * into reservation from public.cloud_upload_reservations where object_name=new.name;
 if not found then raise exception 'Reserve upload capacity before uploading'; end if;
 perform pg_advisory_xact_lock(hashtextextended(reservation.owner_id::text||':cloud',0));
 select * into reservation from public.cloud_upload_reservations where object_name=new.name for update;
 if not found or uploader is null or reservation.actor_id::text is distinct from uploader
    or reservation.state<>'reserved' or reservation.expires_at<=now()
 then raise exception 'Reserve upload capacity before uploading'; end if;
 actual_bytes:=(new.metadata->>'size')::bigint;
 if actual_bytes<1 or actual_bytes>reservation.bytes then raise exception 'Upload exceeds reserved size'; end if;
 select coalesce((metadata->>'size')::bigint,0) into previous_bytes
 from storage.objects where bucket_id=new.bucket_id and name=new.name;
 previous_bytes:=coalesce(previous_bytes,0);
 if public.account_storage_bytes(reservation.owner_id)+public.reserved_storage_bytes(reservation.owner_id,new.name)+actual_bytes-previous_bytes>
   (public.launch_limits(public.launch_tier(reservation.owner_id))->>'storageBytes')::bigint then raise exception 'Cloud storage limit reached'; end if;
 return new;
end; $$;

create or replace function public.consume_cloud_upload() returns trigger
language plpgsql security definer set search_path='' as $$
declare uploader text;
begin
 if new.bucket_id='books' and new.metadata is not null and new.metadata->>'size' is not null then
   uploader:=auth.uid()::text;
   if session_user='supabase_storage_admin' and current_setting('role',true) in ('service_role','supabase_storage_admin') then
     uploader:=new.owner_id;
   end if;
   update public.cloud_upload_reservations set state='uploaded'
   where object_name=new.name and actor_id::text=uploader and state='reserved';
 end if;
 return new;
end; $$;
