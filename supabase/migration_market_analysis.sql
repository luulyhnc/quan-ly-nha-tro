-- Migration: market survey and business analysis data.
-- Run this in Supabase SQL Editor after schema.sql and rls.sql.

create table if not exists public.market_surveys (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid default auth.uid() references auth.users(id) on delete cascade,
  area text,
  source text,
  room_type text,
  room_size_m2 numeric default 0,
  monthly_rent numeric default 0,
  electric_price numeric default 0,
  water_price numeric default 0,
  service_fee numeric default 0,
  internet_fee numeric default 0,
  note text,
  survey_date date default current_date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.market_surveys add column if not exists owner_id uuid default auth.uid() references auth.users(id) on delete cascade;
alter table public.market_surveys add column if not exists area text;
alter table public.market_surveys add column if not exists source text;
alter table public.market_surveys add column if not exists room_type text;
alter table public.market_surveys add column if not exists room_size_m2 numeric default 0;
alter table public.market_surveys add column if not exists monthly_rent numeric default 0;
alter table public.market_surveys add column if not exists electric_price numeric default 0;
alter table public.market_surveys add column if not exists water_price numeric default 0;
alter table public.market_surveys add column if not exists service_fee numeric default 0;
alter table public.market_surveys add column if not exists internet_fee numeric default 0;
alter table public.market_surveys add column if not exists note text;
alter table public.market_surveys add column if not exists survey_date date default current_date;
alter table public.market_surveys add column if not exists created_at timestamptz default now();
alter table public.market_surveys add column if not exists updated_at timestamptz default now();

create index if not exists market_surveys_owner_id_idx on public.market_surveys(owner_id);
create index if not exists market_surveys_area_idx on public.market_surveys(area);
create index if not exists market_surveys_survey_date_idx on public.market_surveys(survey_date);

drop trigger if exists set_market_surveys_updated_at on public.market_surveys;
create trigger set_market_surveys_updated_at
before update on public.market_surveys
for each row execute function public.set_updated_at();

alter table public.market_surveys enable row level security;

grant select, insert, update, delete on public.market_surveys to authenticated;

drop policy if exists market_surveys_select_authenticated on public.market_surveys;
drop policy if exists market_surveys_insert_owner on public.market_surveys;
drop policy if exists market_surveys_update_owner on public.market_surveys;
drop policy if exists market_surveys_delete_owner on public.market_surveys;

create policy market_surveys_select_authenticated
on public.market_surveys
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('owner', 'admin', 'viewer')
  )
);

create policy market_surveys_insert_owner
on public.market_surveys
for insert
to authenticated
with check (public.current_user_is_owner());

create policy market_surveys_update_owner
on public.market_surveys
for update
to authenticated
using (public.current_user_is_owner())
with check (public.current_user_is_owner());

create policy market_surveys_delete_owner
on public.market_surveys
for delete
to authenticated
using (public.current_user_is_owner());
