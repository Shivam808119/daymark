-- Run once in Supabase SQL Editor. Every user has their own editable routines.
-- No shared/default timetable rows are created for new accounts.
create table if not exists public.schedule_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('home', 'college')),
  blocks jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  unique(user_id, mode)
);
alter table public.schedule_templates enable row level security;
drop policy if exists "schedule templates owner" on public.schedule_templates;
create policy "schedule templates owner" on public.schedule_templates
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create index if not exists schedule_templates_user_idx on public.schedule_templates(user_id);
