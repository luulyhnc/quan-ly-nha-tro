-- Supabase schema for the nha tro dashboard.
-- Run this file first in Supabase SQL Editor.
-- It creates tables, helper functions, and triggers. It does not drop tables.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'viewer' check (role in ('owner', 'admin', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

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

create table if not exists public.houses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  address text,
  electric_unit_price numeric not null default 0,
  water_unit_price numeric not null default 0,
  warning_threshold_percent numeric not null default 30,
  electricity_rate numeric default 0,
  water_rate numeric default 0,
  alert_variance_percent numeric default 8,
  sort_order integer default 0,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  room_code text not null default gen_random_uuid()::text,
  room_name text,
  name text,
  floor text,
  occupants integer not null default 0,
  resident_count integer default 0,
  room_price numeric not null default 0,
  monthly_rent numeric default 0,
  service_fee_per_person numeric default 0,
  sort_order integer default 0,
  status text not null default 'occupied',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.room_meter_readings (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  month text not null,
  occupants integer not null default 0,
  electric_old numeric not null default 0,
  electric_new numeric not null default 0,
  water_old numeric not null default 0,
  water_new numeric not null default 0,
  electricity_previous numeric default 0,
  electricity_current numeric default 0,
  water_previous numeric default 0,
  water_current numeric default 0,
  electric_unit_price numeric not null default 0,
  water_unit_price numeric not null default 0,
  room_price numeric not null default 0,
  service_fee numeric not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_meter_readings_room_month_uidx unique (room_id, month)
);

create table if not exists public.state_invoices (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  month text not null,
  state_electric_kwh numeric not null default 0,
  state_electric_amount numeric not null default 0,
  state_water_m3 numeric not null default 0,
  state_water_amount numeric not null default 0,
  other_fee numeric not null default 0,
  electricity_kwh numeric default 0,
  electricity_amount numeric default 0,
  water_m3 numeric default 0,
  water_amount numeric default 0,
  other_amount numeric default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint state_invoices_house_month_uidx unique (house_id, month)
);

-- Keep reruns useful when an older version of the schema already created tables.
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role text not null default 'viewer';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('owner', 'admin', 'viewer'));
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

alter table public.app_settings add column if not exists value text;
alter table public.app_settings add column if not exists updated_at timestamptz not null default now();

insert into public.app_settings (key, value)
values ('app_title', 'Nhà trọ Manager')
on conflict (key) do nothing;

alter table public.houses add column if not exists owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade;
alter table public.houses add column if not exists name text;
alter table public.houses add column if not exists address text;
alter table public.houses add column if not exists electric_unit_price numeric not null default 0;
alter table public.houses add column if not exists water_unit_price numeric not null default 0;
alter table public.houses add column if not exists warning_threshold_percent numeric not null default 30;
alter table public.houses add column if not exists note text;
alter table public.houses add column if not exists is_active boolean not null default true;
alter table public.houses add column if not exists created_at timestamptz not null default now();
alter table public.houses add column if not exists updated_at timestamptz not null default now();

alter table public.rooms add column if not exists house_id uuid references public.houses(id) on delete cascade;
alter table public.rooms add column if not exists room_code text;
alter table public.rooms add column if not exists room_name text;
alter table public.rooms add column if not exists floor text;
alter table public.rooms add column if not exists occupants integer not null default 0;
alter table public.rooms add column if not exists room_price numeric not null default 0;
alter table public.rooms add column if not exists status text not null default 'occupied';
alter table public.rooms add column if not exists note text;
alter table public.rooms add column if not exists created_at timestamptz not null default now();
alter table public.rooms add column if not exists updated_at timestamptz not null default now();
update public.rooms set room_code = coalesce(nullif(room_code, ''), id::text) where room_code is null or room_code = '';
alter table public.rooms alter column room_code set not null;

alter table public.room_meter_readings add column if not exists house_id uuid references public.houses(id) on delete cascade;
alter table public.room_meter_readings add column if not exists room_id uuid references public.rooms(id) on delete cascade;
alter table public.room_meter_readings add column if not exists month text;
alter table public.room_meter_readings add column if not exists occupants integer not null default 0;
alter table public.room_meter_readings add column if not exists electric_old numeric not null default 0;
alter table public.room_meter_readings add column if not exists electric_new numeric not null default 0;
alter table public.room_meter_readings add column if not exists water_old numeric not null default 0;
alter table public.room_meter_readings add column if not exists water_new numeric not null default 0;
alter table public.room_meter_readings add column if not exists electric_unit_price numeric not null default 0;
alter table public.room_meter_readings add column if not exists water_unit_price numeric not null default 0;
alter table public.room_meter_readings add column if not exists room_price numeric not null default 0;
alter table public.room_meter_readings add column if not exists service_fee numeric not null default 0;
alter table public.room_meter_readings add column if not exists note text;
alter table public.room_meter_readings add column if not exists created_at timestamptz not null default now();
alter table public.room_meter_readings add column if not exists updated_at timestamptz not null default now();

alter table public.state_invoices add column if not exists house_id uuid references public.houses(id) on delete cascade;
alter table public.state_invoices add column if not exists month text;
alter table public.state_invoices add column if not exists state_electric_kwh numeric not null default 0;
alter table public.state_invoices add column if not exists state_electric_amount numeric not null default 0;
alter table public.state_invoices add column if not exists state_water_m3 numeric not null default 0;
alter table public.state_invoices add column if not exists state_water_amount numeric not null default 0;
alter table public.state_invoices add column if not exists other_fee numeric not null default 0;
alter table public.state_invoices add column if not exists note text;
alter table public.state_invoices add column if not exists created_at timestamptz not null default now();
alter table public.state_invoices add column if not exists updated_at timestamptz not null default now();

-- Compatibility columns used by the current React frontend.
alter table public.houses add column if not exists electricity_rate numeric;
alter table public.houses add column if not exists water_rate numeric;
alter table public.houses add column if not exists alert_variance_percent numeric;
alter table public.houses add column if not exists sort_order integer;

update public.houses
set electricity_rate = coalesce(electricity_rate, electric_unit_price, 0),
    water_rate = coalesce(water_rate, water_unit_price, 0),
    alert_variance_percent = coalesce(alert_variance_percent, warning_threshold_percent, 8),
    sort_order = coalesce(sort_order, 0)
where electricity_rate is null
   or water_rate is null
   or alert_variance_percent is null
   or sort_order is null;

alter table public.houses alter column electricity_rate set default 0;
alter table public.houses alter column water_rate set default 0;
alter table public.houses alter column alert_variance_percent set default 8;
alter table public.houses alter column sort_order set default 0;

alter table public.rooms add column if not exists name text;
alter table public.rooms add column if not exists resident_count integer;
alter table public.rooms add column if not exists monthly_rent numeric;
alter table public.rooms add column if not exists service_fee_per_person numeric;
alter table public.rooms add column if not exists sort_order integer;
alter table public.rooms alter column room_code set default gen_random_uuid()::text;

update public.rooms
set room_code = coalesce(nullif(room_code, ''), nullif(name, ''), nullif(room_name, ''), id::text)
where room_code is null or room_code = '';

update public.rooms
set name = coalesce(nullif(name, ''), nullif(room_name, ''), nullif(room_code, ''), id::text),
    resident_count = coalesce(resident_count, occupants, 0),
    monthly_rent = coalesce(monthly_rent, room_price, 0),
    service_fee_per_person = coalesce(service_fee_per_person, 0)
where name is null
   or name = ''
   or resident_count is null
   or monthly_rent is null
   or service_fee_per_person is null;

with ranked_rooms as (
  select id, row_number() over (partition by house_id order by created_at, id) as next_sort_order
  from public.rooms
  where sort_order is null
)
update public.rooms r
set sort_order = ranked_rooms.next_sort_order
from ranked_rooms
where r.id = ranked_rooms.id;

alter table public.rooms alter column room_code set not null;
alter table public.rooms alter column resident_count set default 0;
alter table public.rooms alter column monthly_rent set default 0;
alter table public.rooms alter column service_fee_per_person set default 0;
alter table public.rooms alter column sort_order set default 0;

alter table public.room_meter_readings add column if not exists electricity_previous numeric;
alter table public.room_meter_readings add column if not exists electricity_current numeric;
alter table public.room_meter_readings add column if not exists water_previous numeric;
alter table public.room_meter_readings add column if not exists water_current numeric;

update public.room_meter_readings
set electricity_previous = coalesce(electricity_previous, electric_old, 0),
    electricity_current = coalesce(electricity_current, electric_new, 0),
    water_previous = coalesce(water_previous, water_old, 0),
    water_current = coalesce(water_current, water_new, 0)
where electricity_previous is null
   or electricity_current is null
   or water_previous is null
   or water_current is null;

alter table public.room_meter_readings alter column electricity_previous set default 0;
alter table public.room_meter_readings alter column electricity_current set default 0;
alter table public.room_meter_readings alter column water_previous set default 0;
alter table public.room_meter_readings alter column water_current set default 0;

alter table public.state_invoices add column if not exists electricity_kwh numeric;
alter table public.state_invoices add column if not exists electricity_amount numeric;
alter table public.state_invoices add column if not exists water_m3 numeric;
alter table public.state_invoices add column if not exists water_amount numeric;
alter table public.state_invoices add column if not exists other_amount numeric;

update public.state_invoices
set electricity_kwh = coalesce(electricity_kwh, state_electric_kwh, 0),
    electricity_amount = coalesce(electricity_amount, state_electric_amount, 0),
    water_m3 = coalesce(water_m3, state_water_m3, 0),
    water_amount = coalesce(water_amount, state_water_amount, 0),
    other_amount = coalesce(other_amount, other_fee, 0)
where electricity_kwh is null
   or electricity_amount is null
   or water_m3 is null
   or water_amount is null
   or other_amount is null;

alter table public.state_invoices alter column electricity_kwh set default 0;
alter table public.state_invoices alter column electricity_amount set default 0;
alter table public.state_invoices alter column water_m3 set default 0;
alter table public.state_invoices alter column water_amount set default 0;
alter table public.state_invoices alter column other_amount set default 0;
create unique index if not exists room_meter_readings_room_month_uidx on public.room_meter_readings(room_id, month);
create unique index if not exists state_invoices_house_month_uidx on public.state_invoices(house_id, month);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_email_idx on public.profiles(email);
create index if not exists app_settings_updated_at_idx on public.app_settings(updated_at);
create index if not exists market_surveys_owner_id_idx on public.market_surveys(owner_id);
create index if not exists market_surveys_area_idx on public.market_surveys(area);
create index if not exists market_surveys_survey_date_idx on public.market_surveys(survey_date);
create index if not exists houses_owner_id_idx on public.houses(owner_id);
create index if not exists rooms_house_id_idx on public.rooms(house_id);
create index if not exists readings_house_id_idx on public.room_meter_readings(house_id);
create index if not exists readings_room_month_idx on public.room_meter_readings(room_id, month);
create index if not exists invoices_house_month_idx on public.state_invoices(house_id, month);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'viewer'
  )
  on conflict (id) do update
  set email = excluded.email,
      updated_at = now();

  return new;
end;
$$;

create or replace function public.current_user_is_owner()
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'owner'
  );
end;
$$;

create or replace function public.current_user_is_admin()
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
end;
$$;

create or replace function public.current_user_can_edit()
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('owner', 'admin')
  );
end;
$$;

create or replace function public.current_user_can_delete()
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  return public.current_user_is_owner();
end;
$$;

revoke all on function public.current_user_is_owner() from public;
revoke all on function public.current_user_is_admin() from public;
revoke all on function public.current_user_can_edit() from public;
revoke all on function public.current_user_can_delete() from public;
grant execute on function public.current_user_is_owner() to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;
grant execute on function public.current_user_can_edit() to authenticated;
grant execute on function public.current_user_can_delete() to authenticated;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

drop trigger if exists set_market_surveys_updated_at on public.market_surveys;
create trigger set_market_surveys_updated_at
before update on public.market_surveys
for each row execute function public.set_updated_at();

drop trigger if exists set_houses_updated_at on public.houses;
create trigger set_houses_updated_at
before update on public.houses
for each row execute function public.set_updated_at();

drop trigger if exists set_rooms_updated_at on public.rooms;
create trigger set_rooms_updated_at
before update on public.rooms
for each row execute function public.set_updated_at();

drop trigger if exists set_room_meter_readings_updated_at on public.room_meter_readings;
create trigger set_room_meter_readings_updated_at
before update on public.room_meter_readings
for each row execute function public.set_updated_at();

drop trigger if exists set_state_invoices_updated_at on public.state_invoices;
create trigger set_state_invoices_updated_at
before update on public.state_invoices
for each row execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.market_surveys enable row level security;
alter table public.houses enable row level security;
alter table public.rooms enable row level security;
alter table public.room_meter_readings enable row level security;
alter table public.state_invoices enable row level security;
