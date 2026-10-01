-- Supabase Free projects currently allow a global maximum of 50 MB per object.
update storage.buckets
set file_size_limit = 52428800
where id = 'books';
