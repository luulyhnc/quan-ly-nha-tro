-- Migration: editable application settings for the static nha tro dashboard.
-- Run this in Supabase SQL Editor after schema.sql and rls.sql.

create table if not exists public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

alter table public.app_settings add column if not exists value text;
alter table public.app_settings add column if not exists updated_at timestamptz not null default now();

alter table public.app_settings enable row level security;

grant select, insert, update, delete on public.app_settings to authenticated;

drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

drop policy if exists app_settings_select_authenticated on public.app_settings;
drop policy if exists app_settings_insert_owner on public.app_settings;
drop policy if exists app_settings_update_owner on public.app_settings;
drop policy if exists app_settings_delete_owner on public.app_settings;

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

insert into public.app_settings (key, value)
values ('app_title', 'Nhà trọ Manager')
on conflict (key) do nothing;
