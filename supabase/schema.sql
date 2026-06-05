-- Supabase SQL editor: run this once after creating a Free project.
-- The frontend is static; all tenant isolation is enforced by Supabase Auth + RLS.

create extension if not exists pgcrypto;

create table if not exists public.houses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  address text not null default '',
  electricity_rate numeric(12, 2) not null default 3800 check (electricity_rate >= 0),
  water_rate numeric(12, 2) not null default 18000 check (water_rate >= 0),
  alert_variance_percent numeric(5, 2) not null default 8 check (alert_variance_percent between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  house_id uuid not null references public.houses (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  floor text not null default '',
  resident_count integer not null default 0 check (resident_count >= 0 and resident_count <= 20),
  monthly_rent numeric(12, 2) not null default 0 check (monthly_rent >= 0),
  service_fee_per_person numeric(12, 2) not null default 0 check (service_fee_per_person >= 0),
  status text not null default 'occupied' check (status in ('occupied', 'vacant', 'maintenance')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (house_id, name)
);

create table if not exists public.room_meter_readings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  house_id uuid not null references public.houses (id) on delete cascade,
  room_id uuid not null references public.rooms (id) on delete cascade,
  month date not null,
  electricity_previous numeric(12, 2) not null default 0 check (electricity_previous >= 0),
  electricity_current numeric(12, 2) not null default 0 check (electricity_current >= 0),
  water_previous numeric(12, 2) not null default 0 check (water_previous >= 0),
  water_current numeric(12, 2) not null default 0 check (water_current >= 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (date_trunc('month', month)::date = month),
  check (electricity_current >= electricity_previous),
  check (water_current >= water_previous),
  unique (room_id, month)
);

create table if not exists public.state_invoices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  house_id uuid not null references public.houses (id) on delete cascade,
  month date not null,
  electricity_kwh numeric(12, 2) not null default 0 check (electricity_kwh >= 0),
  electricity_amount numeric(12, 2) not null default 0 check (electricity_amount >= 0),
  water_m3 numeric(12, 2) not null default 0 check (water_m3 >= 0),
  water_amount numeric(12, 2) not null default 0 check (water_amount >= 0),
  other_amount numeric(12, 2) not null default 0 check (other_amount >= 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (date_trunc('month', month)::date = month),
  unique (house_id, month)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

create index if not exists houses_owner_id_idx on public.houses (owner_id);
create index if not exists rooms_owner_house_idx on public.rooms (owner_id, house_id);
create index if not exists rooms_house_id_idx on public.rooms (house_id);
create index if not exists readings_owner_house_month_idx on public.room_meter_readings (owner_id, house_id, month);
create index if not exists readings_room_month_idx on public.room_meter_readings (room_id, month);
create index if not exists invoices_owner_house_month_idx on public.state_invoices (owner_id, house_id, month);
create index if not exists invoices_house_month_idx on public.state_invoices (house_id, month);

alter table public.houses enable row level security;
alter table public.rooms enable row level security;
alter table public.room_meter_readings enable row level security;
alter table public.state_invoices enable row level security;

drop policy if exists "owners manage houses" on public.houses;
create policy "owners manage houses"
on public.houses
for all
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "owners manage rooms" on public.rooms;
create policy "owners manage rooms"
on public.rooms
for all
to authenticated
using (owner_id = (select auth.uid()))
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.houses h
    where h.id = rooms.house_id
      and h.owner_id = (select auth.uid())
  )
);

drop policy if exists "owners manage readings" on public.room_meter_readings;
create policy "owners manage readings"
on public.room_meter_readings
for all
to authenticated
using (owner_id = (select auth.uid()))
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.rooms r
    where r.id = room_meter_readings.room_id
      and r.house_id = room_meter_readings.house_id
      and r.owner_id = (select auth.uid())
  )
);

drop policy if exists "owners manage state invoices" on public.state_invoices;
create policy "owners manage state invoices"
on public.state_invoices
for all
to authenticated
using (owner_id = (select auth.uid()))
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1
    from public.houses h
    where h.id = state_invoices.house_id
      and h.owner_id = (select auth.uid())
  )
);
