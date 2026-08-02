-- Run these commands in the Supabase SQL Editor to set up a new client

-- 1. Create a generic Key-Value store for app state
create table public.kv_store (
  key text primary key,
  value jsonb
);

-- 2. Create the proofs metadata table
create table public.proofs (
  id uuid default gen_random_uuid() primary key,
  booking_id text,
  name text,
  file_name text,
  path text,
  url text,
  mime text,
  uploaded_at timestamptz default now(),
  expires_at timestamptz
);

-- 3. Enable Realtime on both tables
alter publication supabase_realtime add table kv_store;
alter publication supabase_realtime add table proofs;

-- 4. Create the storage bucket for image proofs
insert into storage.buckets (id, name, public) values ('proofs', 'proofs', true);

-- 5. Open up storage permissions for anonymous uploads (matching test-mode)
create policy "Allow public uploads" on storage.objects for insert with check ( bucket_id = 'proofs' );
create policy "Allow public read" on storage.objects for select using ( bucket_id = 'proofs' );
create policy "Allow public delete" on storage.objects for delete using ( bucket_id = 'proofs' );

-- Note: In production you'd want to restrict these using RLS.
