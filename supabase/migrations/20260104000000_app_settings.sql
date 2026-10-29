-- Personal preferences (your name, which cards/pages are shown, your wellness list).
-- One row per user. Safe to run more than once.
create table if not exists app_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table app_settings enable row level security;
drop policy if exists "app_settings owner" on app_settings;
create policy "app_settings owner" on app_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
