-- Migration: user role management inside the static nha tro dashboard.
-- Run this in Supabase SQL Editor after schema.sql and rls.sql.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text default 'viewer',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role text default 'viewer';
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles add column if not exists updated_at timestamptz default now();

alter table public.profiles alter column role set default 'viewer';
update public.profiles set role = 'viewer' where role is null or role not in ('owner', 'admin', 'viewer');
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('owner', 'admin', 'viewer'));

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

create or replace function public.prevent_last_owner_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_count integer;
begin
  if tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner' then
    select count(*) into owner_count from public.profiles where role = 'owner';
    if owner_count <= 1 then
      raise exception 'Khong the ha quyen owner cuoi cung';
    end if;
  end if;

  if tg_op = 'DELETE' and old.role = 'owner' then
    select count(*) into owner_count from public.profiles where role = 'owner';
    if owner_count <= 1 then
      raise exception 'Khong the xoa owner cuoi cung';
    end if;
    return old;
  end if;

  return new;
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

insert into public.profiles (id, email, full_name, role)
select id, email, 'Chủ sở hữu', 'owner'
from auth.users
where email = 'lethuhien211094@gmail.com'
on conflict (id) do update
set email = excluded.email,
    role = 'owner',
    full_name = 'Chủ sở hữu',
    updated_at = now();

update public.profiles
set role = 'owner',
    full_name = 'Chủ sở hữu',
    updated_at = now()
where email = 'lethuhien211094@gmail.com';

alter table public.profiles enable row level security;
grant select, update on public.profiles to authenticated;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists prevent_last_owner_role_change on public.profiles;
create trigger prevent_last_owner_role_change
before update or delete on public.profiles
for each row execute function public.prevent_last_owner_role_change();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop policy if exists profiles_select_self on public.profiles;
drop policy if exists profiles_owner_admin_select_all on public.profiles;
drop policy if exists profiles_owner_update_all on public.profiles;
drop policy if exists profiles_owner_select_all on public.profiles;
drop policy if exists profiles_owner_update_roles on public.profiles;

create policy profiles_select_self
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy profiles_owner_select_all
on public.profiles
for select
to authenticated
using (public.current_user_is_owner());

create policy profiles_owner_update_roles
on public.profiles
for update
to authenticated
using (public.current_user_is_owner())
with check (public.current_user_is_owner());
