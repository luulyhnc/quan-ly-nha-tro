-- Migration: add missing columns used by the current React/Vite frontend.
-- Safe to run multiple times in Supabase SQL Editor.
-- Does not drop tables and does not delete data.

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
