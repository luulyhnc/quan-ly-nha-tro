-- Supabase RLS policies for owner/admin/viewer roles.
-- Run after supabase/schema.sql.

alter table public.profiles add column if not exists role text not null default 'viewer';
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('owner', 'admin', 'viewer'));

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

alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.market_surveys enable row level security;
alter table public.houses enable row level security;
alter table public.rooms enable row level security;
alter table public.room_meter_readings enable row level security;
alter table public.state_invoices enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.app_settings to authenticated;
grant select, insert, update, delete on public.market_surveys to authenticated;
grant select, insert, update, delete on public.houses to authenticated;
grant select, insert, update, delete on public.rooms to authenticated;
grant select, insert, update, delete on public.room_meter_readings to authenticated;
grant select, insert, update, delete on public.state_invoices to authenticated;

-- Drop old and replacement policies before recreating the role model.
drop policy if exists "users read own profile" on public.profiles;
drop policy if exists "admins manage profiles" on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_admin_select on public.profiles;
drop policy if exists profiles_admin_update on public.profiles;
drop policy if exists profiles_select_self on public.profiles;
drop policy if exists profiles_owner_admin_select_all on public.profiles;
drop policy if exists profiles_owner_update_all on public.profiles;

drop policy if exists app_settings_select_authenticated on public.app_settings;
drop policy if exists app_settings_insert_owner on public.app_settings;
drop policy if exists app_settings_update_owner on public.app_settings;
drop policy if exists app_settings_delete_owner on public.app_settings;

drop policy if exists market_surveys_select_authenticated on public.market_surveys;
drop policy if exists market_surveys_insert_owner on public.market_surveys;
drop policy if exists market_surveys_update_owner on public.market_surveys;
drop policy if exists market_surveys_delete_owner on public.market_surveys;

drop policy if exists "owners manage houses" on public.houses;
drop policy if exists houses_admin_all on public.houses;
drop policy if exists houses_select_owned on public.houses;
drop policy if exists houses_insert_owned on public.houses;
drop policy if exists houses_select_authenticated on public.houses;
drop policy if exists houses_insert_editors on public.houses;
drop policy if exists houses_update_editors on public.houses;
drop policy if exists houses_delete_owner on public.houses;

drop policy if exists "owners manage rooms" on public.rooms;
drop policy if exists rooms_admin_all on public.rooms;
drop policy if exists rooms_select_owned_house on public.rooms;
drop policy if exists rooms_insert_owned_house on public.rooms;
drop policy if exists rooms_update_owned_house on public.rooms;
drop policy if exists rooms_select_authenticated on public.rooms;
drop policy if exists rooms_insert_editors on public.rooms;
drop policy if exists rooms_update_editors on public.rooms;
drop policy if exists rooms_delete_owner on public.rooms;

drop policy if exists "owners manage readings" on public.room_meter_readings;
drop policy if exists readings_admin_all on public.room_meter_readings;
drop policy if exists readings_select_owned_house on public.room_meter_readings;
drop policy if exists readings_insert_owned_house on public.room_meter_readings;
drop policy if exists readings_update_owned_house on public.room_meter_readings;
drop policy if exists readings_select_authenticated on public.room_meter_readings;
drop policy if exists readings_insert_editors on public.room_meter_readings;
drop policy if exists readings_update_editors on public.room_meter_readings;
drop policy if exists readings_delete_owner on public.room_meter_readings;

drop policy if exists "owners manage state invoices" on public.state_invoices;
drop policy if exists invoices_admin_all on public.state_invoices;
drop policy if exists invoices_select_owned_house on public.state_invoices;
drop policy if exists invoices_insert_owned_house on public.state_invoices;
drop policy if exists invoices_update_owned_house on public.state_invoices;
drop policy if exists invoices_select_authenticated on public.state_invoices;
drop policy if exists invoices_insert_editors on public.state_invoices;
drop policy if exists invoices_update_editors on public.state_invoices;
drop policy if exists invoices_delete_owner on public.state_invoices;

-- profiles: users can read themselves; owner/admin can read all; only owner can change roles/profile rows.
create policy profiles_select_self
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy profiles_owner_admin_select_all
on public.profiles
for select
to authenticated
using (public.current_user_is_owner() or public.current_user_is_admin());

create policy profiles_owner_update_all
on public.profiles
for update
to authenticated
using (public.current_user_is_owner())
with check (public.current_user_is_owner());

-- app_settings: all signed-in users can read; only owner can change settings.
create policy app_settings_select_authenticated
on public.app_settings
for select
to authenticated
using (auth.uid() is not null);

create policy app_settings_insert_owner
on public.app_settings
for insert
to authenticated
with check (public.current_user_is_owner());

create policy app_settings_update_owner
on public.app_settings
for update
to authenticated
using (public.current_user_is_owner())
with check (public.current_user_is_owner());

create policy app_settings_delete_owner
on public.app_settings
for delete
to authenticated
using (public.current_user_is_owner());

-- market_surveys: authenticated users can view; only owner can change survey data.
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

-- houses
create policy houses_select_authenticated
on public.houses
for select
to authenticated
using (auth.uid() is not null);

create policy houses_insert_editors
on public.houses
for insert
to authenticated
with check (public.current_user_can_edit());

create policy houses_update_editors
on public.houses
for update
to authenticated
using (public.current_user_can_edit())
with check (public.current_user_can_edit());

create policy houses_delete_owner
on public.houses
for delete
to authenticated
using (public.current_user_can_delete());

-- rooms
create policy rooms_select_authenticated
on public.rooms
for select
to authenticated
using (auth.uid() is not null);

create policy rooms_insert_editors
on public.rooms
for insert
to authenticated
with check (public.current_user_can_edit());

create policy rooms_update_editors
on public.rooms
for update
to authenticated
using (public.current_user_can_edit())
with check (public.current_user_can_edit());

create policy rooms_delete_owner
on public.rooms
for delete
to authenticated
using (public.current_user_can_delete());

-- room_meter_readings
create policy readings_select_authenticated
on public.room_meter_readings
for select
to authenticated
using (auth.uid() is not null);

create policy readings_insert_editors
on public.room_meter_readings
for insert
to authenticated
with check (public.current_user_can_edit());

create policy readings_update_editors
on public.room_meter_readings
for update
to authenticated
using (public.current_user_can_edit())
with check (public.current_user_can_edit());

create policy readings_delete_owner
on public.room_meter_readings
for delete
to authenticated
using (public.current_user_can_delete());

-- state_invoices
create policy invoices_select_authenticated
on public.state_invoices
for select
to authenticated
using (auth.uid() is not null);

create policy invoices_insert_editors
on public.state_invoices
for insert
to authenticated
with check (public.current_user_can_edit());

create policy invoices_update_editors
on public.state_invoices
for update
to authenticated
using (public.current_user_can_edit())
with check (public.current_user_can_edit());

create policy invoices_delete_owner
on public.state_invoices
for delete
to authenticated
using (public.current_user_can_delete());
