-- Safe to run on a database that already has Daymark tables: everything is "if not exists".
create extension if not exists pgcrypto;

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null, status text not null default 'todo', priority text not null default 'medium',
  due_date date, position int not null default 0, created_at timestamptz not null default now()
);
create table if not exists daily_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null, daily_target text, completed text, learned text, improve_tomorrow text,
  created_at timestamptz not null default now()
);
create unique index if not exists daily_reflections_user_date on daily_reflections(user_id, entry_date);
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null, start_date date, deadline date, priority text default 'medium',
  status text default 'active', completion_percentage int default 0, created_at timestamptz not null default now()
);
create table if not exists books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null, author text, status text default 'want_to_read', pages_read int default 0,
  created_at timestamptz not null default now()
);
create table if not exists workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null, created_at timestamptz not null default now()
);
create table if not exists meal_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  description text not null, created_at timestamptz not null default now()
);
create table if not exists daily_wellness_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date date not null, template_id uuid not null, kind text, completed boolean not null default false
);
create unique index if not exists daily_wellness_unique on daily_wellness_checks(user_id, entry_date, template_id);

do $$
declare t text;
begin
  foreach t in array array['tasks','daily_reflections','goals','books','workout_templates','meal_templates','daily_wellness_checks'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "%s owner" on %I', t, t);
    execute format('create policy "%s owner" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
  end loop;
end $$;
