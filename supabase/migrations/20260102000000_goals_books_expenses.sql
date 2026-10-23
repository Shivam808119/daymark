-- Run after the first migration. Safe to re-run.

-- Daily workout + meals (one row per day and habit)
create table if not exists daily_habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null, kind text not null, completed boolean not null default false, note text
);
create unique index if not exists daily_habits_unique on daily_habits(user_id, entry_date, kind);

-- Goals: category + notes, and checklist steps
alter table goals add column if not exists category text default 'personal';
alter table goals add column if not exists notes text;
create table if not exists goal_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  goal_id uuid not null references goals(id) on delete cascade,
  title text not null, done boolean not null default false, created_at timestamptz not null default now()
);

-- Books: subjects, files, progress
create table if not exists book_subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, color text not null default '#2b6a4b', created_at timestamptz not null default now()
);
alter table books add column if not exists subject_id uuid references book_subjects(id) on delete set null;
alter table books add column if not exists file_path text;
alter table books add column if not exists file_name text;
alter table books add column if not exists file_type text;
alter table books add column if not exists total_pages int;
alter table books add column if not exists notes text;

-- Expenses
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0), category text not null default 'Other',
  note text, spent_on date not null default current_date, method text, created_at timestamptz not null default now()
);
create index if not exists expenses_user_date on expenses(user_id, spent_on);

-- Row level security: each user only sees their own rows
do $$
declare t text;
begin
  foreach t in array array['daily_habits','goal_steps','book_subjects','expenses'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "%s owner" on %I', t, t);
    execute format('create policy "%s owner" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
  end loop;
end $$;

-- Private storage bucket for book files (PDF, text, images, etc.)
insert into storage.buckets (id, name, public, file_size_limit)
values ('books', 'books', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "books files read" on storage.objects;
drop policy if exists "books files write" on storage.objects;
drop policy if exists "books files delete" on storage.objects;
create policy "books files read" on storage.objects for select to authenticated
  using (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "books files write" on storage.objects for insert to authenticated
  with check (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "books files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text);

-- Daily routine: tasks you can add to any day with one click
create table if not exists routine_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null, priority text not null default 'medium', created_at timestamptz not null default now()
);
alter table routine_tasks enable row level security;
drop policy if exists "routine_tasks owner" on routine_tasks;
create policy "routine_tasks owner" on routine_tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
