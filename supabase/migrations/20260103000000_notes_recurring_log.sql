-- Run after the first two migrations. Safe to re-run.

-- Reading notes / highlights per book
create table if not exists book_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  book_id uuid not null references books(id) on delete cascade,
  page int, note text not null, created_at timestamptz not null default now()
);

-- Pages read per day (for the weekly summary)
create table if not exists reading_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  book_id uuid references books(id) on delete cascade,
  entry_date date not null default current_date, pages int not null check (pages > 0)
);

-- Monthly bills that are added automatically
create table if not exists recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount >= 0), category text not null default 'Bills',
  note text, method text, day_of_month int not null default 1 check (day_of_month between 1 and 31),
  active boolean not null default true, last_month text, created_at timestamptz not null default now()
);
alter table expenses add column if not exists recurring_id uuid references recurring_expenses(id) on delete set null;
create unique index if not exists expenses_recurring_once on expenses(recurring_id, spent_on);

do $$
declare t text;
begin
  foreach t in array array['book_notes','reading_log','recurring_expenses'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "%s owner" on %I', t, t);
    execute format('create policy "%s owner" on %I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
  end loop;
end $$;
