-- Keep explicitly unfinished drafts private and carry EPUB removal instructions
-- into the translated shared edition. The uploaded original remains unchanged.
create or replace function public.reader_snapshot(value jsonb)
returns jsonb language sql immutable set search_path='' as $$
 with chapters as (
   select c,ordinal from jsonb_array_elements(value->'novel'->'chapters') with ordinality as entries(c,ordinal)
 ), selected as (
   select c from chapters where not coalesce(value->'exportExcluded','[]'::jsonb) ? (c->>'id')
 ), publication as (
   select count(*)>0 and coalesce(bool_and(
     coalesce(btrim(value->'translations'->>(c->>'id')),'')<>''
     and right(coalesce(value->'translations'->>(c->>'id'),''),8)<>'…PARTIAL'
     and coalesce(value->'unfinished'->(c->>'id'),'false'::jsonb)<>'true'::jsonb
   ),false) ready from selected
 )
 select case when value is null then null else jsonb_build_object(
   'novel',jsonb_build_object('chapters',coalesce((select jsonb_agg(jsonb_build_object(
     'id',c->'id','title',c->'title','text',c->'text','jp_char_count',c->'jp_char_count','xhtmlPath',c->'xhtmlPath'
   ) order by ordinal) from chapters),'[]'::jsonb),'projectType',value->'novel'->'projectType',
     '_epubOpfPath',value->'novel'->'_epubOpfPath','_epubOpfDir',value->'novel'->'_epubOpfDir'),
   'translations',case when (select ready from publication) then coalesce((select jsonb_object_agg(c->>'id',value->'translations'->(c->>'id')) from selected),'{}'::jsonb) else '{}'::jsonb end,
   'exportExcluded',value->'exportExcluded','sourceLanguage',value->'sourceLanguage','targetLanguage',value->'targetLanguage',
   'deletedChapters',coalesce((select jsonb_agg(jsonb_build_object('id',c->'id','xhtmlPath',c->'xhtmlPath','removeImages',c->'removeImages')) from jsonb_array_elements(coalesce(value->'deletedChapters','[]'::jsonb)) c),'[]'::jsonb)
 ) end;
$$;
