-- Migration: monthly room price support.
-- Safe to run multiple times. Does not delete data.
-- This lets each room have a different room price for each month.

alter table public.room_meter_readings add column if not exists room_price numeric not null default 0;

update public.room_meter_readings reading
set room_price = coalesce(nullif(reading.room_price, 0), rooms.monthly_rent, rooms.room_price, 0),
    updated_at = now()
from public.rooms rooms
where reading.room_id = rooms.id
  and coalesce(reading.room_price, 0) = 0
  and coalesce(rooms.monthly_rent, rooms.room_price, 0) <> 0;
