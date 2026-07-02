-- Migration: room bills and receivables.
-- Safe to run multiple times. Does not delete data.

create table if not exists public.room_bills (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references public.houses(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  month text not null,
  total_amount numeric not null default 0,
  paid_amount numeric not null default 0,
  status text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid')),
  paid_at date,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_bills_room_month_uidx unique (room_id, month)
);

alter table public.room_bills add column if not exists house_id uuid references public.houses(id) on delete cascade;
alter table public.room_bills add column if not exists room_id uuid references public.rooms(id) on delete cascade;
alter table public.room_bills add column if not exists month text;
alter table public.room_bills add column if not exists total_amount numeric not null default 0;
alter table public.room_bills add column if not exists paid_amount numeric not null default 0;
alter table public.room_bills add column if not exists status text not null default 'unpaid';
alter table public.room_bills add column if not exists paid_at date;
alter table public.room_bills add column if not exists note text;
alter table public.room_bills add column if not exists created_at timestamptz not null default now();
alter table public.room_bills add column if not exists updated_at timestamptz not null default now();

alter table public.room_bills drop constraint if exists room_bills_status_check;
alter table public.room_bills add constraint room_bills_status_check check (status in ('unpaid', 'partial', 'paid'));
create unique index if not exists room_bills_room_month_uidx on public.room_bills(room_id, month);
create index if not exists room_bills_house_month_idx on public.room_bills(house_id, month);
create index if not exists room_bills_status_idx on public.room_bills(status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_room_bills_updated_at on public.room_bills;
create trigger set_room_bills_updated_at
before update on public.room_bills
for each row execute function public.set_updated_at();

alter table public.room_bills enable row level security;
grant select, insert, update, delete on public.room_bills to authenticated;

drop policy if exists room_bills_select_authenticated on public.room_bills;
drop policy if exists room_bills_insert_editors on public.room_bills;
drop policy if exists room_bills_update_editors on public.room_bills;
drop policy if exists room_bills_delete_owner on public.room_bills;

create policy room_bills_select_authenticated
on public.room_bills
for select
to authenticated
using (auth.uid() is not null);

create policy room_bills_insert_editors
on public.room_bills
for insert
to authenticated
with check (public.current_user_can_edit());

create policy room_bills_update_editors
on public.room_bills
for update
to authenticated
using (public.current_user_can_edit())
with check (public.current_user_can_edit());

create policy room_bills_delete_owner
on public.room_bills
for delete
to authenticated
using (public.current_user_can_delete());
