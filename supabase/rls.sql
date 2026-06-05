-- Incremental admin/auth RLS setup for an existing Supabase project.
-- Safe to run after supabase/schema.sql or on a database that already has the house tables.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'viewer' check (role in ('admin', 'viewer')),
  created_at timestamp with time zone not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);

create or replace function public.current_user_is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to authenticated;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do update
    set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user_profile();

insert into public.profiles (id, email, full_name)
select id, email, coalesce(raw_user_meta_data ->> 'full_name', '')
from auth.users
on conflict (id) do update set email = excluded.email;

alter table public.profiles enable row level security;
alter table public.houses enable row level security;
alter table public.rooms enable row level security;
alter table public.room_meter_readings enable row level security;
alter table public.state_invoices enable row level security;

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
on public.profiles
for select
to authenticated
using (id = (select auth.uid()) or public.current_user_is_admin());

drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins manage profiles"
on public.profiles
for all
to authenticated
using (public.current_user_is_admin())
with check (public.current_user_is_admin());

drop policy if exists "owners manage houses" on public.houses;
create policy "owners manage houses"
on public.houses
for all
to authenticated
using (owner_id = (select auth.uid()) and public.current_user_is_admin())
with check (owner_id = (select auth.uid()) and public.current_user_is_admin());

drop policy if exists "owners manage rooms" on public.rooms;
create policy "owners manage rooms"
on public.rooms
for all
to authenticated
using (owner_id = (select auth.uid()) and public.current_user_is_admin())
with check (
  owner_id = (select auth.uid())
  and public.current_user_is_admin()
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
using (owner_id = (select auth.uid()) and public.current_user_is_admin())
with check (
  owner_id = (select auth.uid())
  and public.current_user_is_admin()
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
using (owner_id = (select auth.uid()) and public.current_user_is_admin())
with check (
  owner_id = (select auth.uid())
  and public.current_user_is_admin()
  and exists (
    select 1
    from public.houses h
    where h.id = state_invoices.house_id
      and h.owner_id = (select auth.uid())
  )
);

-- After creating/signing up your admin user, set admin role manually in SQL Editor:
-- update public.profiles set role = 'admin' where email = 'your-admin-email@example.com';
