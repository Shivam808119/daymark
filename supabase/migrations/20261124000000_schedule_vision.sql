-- Run in the Supabase SQL editor for cross-device schedule sync and private vision boards.
create table if not exists public.schedule_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  mode text not null default 'home' check (mode in ('home', 'college')),
  completed text[] not null default '{}',
  targets jsonb not null default '[]'::jsonb,
  board_note text not null default '',
  board_path text,
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);
alter table public.schedule_days enable row level security;
drop policy if exists "schedule days owner" on public.schedule_days;
create policy "schedule days owner" on public.schedule_days
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('vision-boards', 'vision-boards', false, 8388608, array['image/jpeg','image/png','image/webp','image/gif'])
  on conflict (id) do nothing;
drop policy if exists "own vision images read" on storage.objects;
drop policy if exists "own vision images upload" on storage.objects;
drop policy if exists "own vision images delete" on storage.objects;
create policy "own vision images read" on storage.objects
  for select to authenticated using (bucket_id = 'vision-boards' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own vision images upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'vision-boards' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own vision images delete" on storage.objects
  for delete to authenticated using (bucket_id = 'vision-boards' and (storage.foldername(name))[1] = (select auth.uid())::text);
