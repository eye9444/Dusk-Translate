-- Supabase Storage inserts a rolled-back probe row before accepting the upload
-- body. That probe often has null metadata, and some Storage versions use {}.
-- Capacity checks must run only when a real size is present.
create or replace function public.enforce_cloud_upload() returns trigger
language plpgsql security definer set search_path='' as $$
declare reservation public.cloud_upload_reservations; actual_bytes bigint; previous_bytes bigint:=0;
begin
 if new.bucket_id<>'books' then return new; end if;
 -- Probe / pre-body rows have no size yet.
 if new.metadata is null or new.metadata->>'size' is null then return new; end if;
 select * into reservation from public.cloud_upload_reservations where object_name=new.name;
 if not found or reservation.actor_id is distinct from auth.uid() or reservation.state<>'reserved' or reservation.expires_at<=now()
 then raise exception 'Reserve upload capacity before uploading'; end if;
 perform pg_advisory_xact_lock(hashtextextended(reservation.owner_id::text||':cloud',0));
 actual_bytes:=coalesce((new.metadata->>'size')::bigint,0);
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
begin
 if new.bucket_id='books' and new.metadata is not null and new.metadata->>'size' is not null then
   update public.cloud_upload_reservations set state='uploaded'
   where object_name=new.name and actor_id=auth.uid() and state='reserved';
 end if;
 return new;
end; $$;
