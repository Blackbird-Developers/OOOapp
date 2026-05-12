-- =====================================================================
-- BBM Leave tracker — initial schema
-- Run this in the Supabase SQL editor (Database → SQL Editor → New query).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Profiles ----------
create type user_role as enum ('admin', 'employee');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role user_role not null default 'employee',
  annual_allowance numeric(4,1) not null default 20,
  sick_allowance numeric(4,1) not null default 20,
  created_at timestamptz not null default now()
);

-- ---------- Leave requests ----------
create type leave_type as enum ('annual', 'sick');
create type leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type half_kind as enum ('full', 'am', 'pm');

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type leave_type not null,
  start_date date not null,
  end_date date not null,
  -- half_start applies to start_date, half_end applies to end_date
  -- 'full' = whole day, 'am' = first half only, 'pm' = second half only
  half_start half_kind not null default 'full',
  half_end half_kind not null default 'full',
  days_count numeric(4,1) not null check (days_count > 0),
  reason text,
  status leave_status not null default 'pending',
  decided_by uuid references public.profiles(id),
  decided_at timestamptz,
  decision_note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index on public.leave_requests (user_id);
create index on public.leave_requests (status);
create index on public.leave_requests (start_date, end_date);

-- ---------- Public holidays (admin-managed) ----------
create table public.public_holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

-- ---------- Invites ----------
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  role user_role not null default 'employee',
  token text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index on public.invites (email);
create index on public.invites (token);

-- =====================================================================
-- Helper: is the current user an admin?
-- =====================================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- =====================================================================
-- Row Level Security
-- =====================================================================

alter table public.profiles enable row level security;
alter table public.leave_requests enable row level security;
alter table public.public_holidays enable row level security;
alter table public.invites enable row level security;

-- profiles
create policy "profiles: read own or admin reads all"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

create policy "profiles: admin updates"
  on public.profiles for update
  using (public.is_admin());

create policy "profiles: admin inserts"
  on public.profiles for insert
  with check (public.is_admin());

-- leave_requests
create policy "leave: user reads own, admin reads all"
  on public.leave_requests for select
  using (user_id = auth.uid() or public.is_admin());

create policy "leave: user inserts own pending"
  on public.leave_requests for insert
  with check (
    (user_id = auth.uid() and created_by = auth.uid() and status = 'pending')
    or public.is_admin()
  );

create policy "leave: admin updates"
  on public.leave_requests for update
  using (public.is_admin());

create policy "leave: admin deletes"
  on public.leave_requests for delete
  using (public.is_admin());

-- public_holidays
create policy "holidays: everyone reads"
  on public.public_holidays for select
  using (auth.uid() is not null);

create policy "holidays: admin writes"
  on public.public_holidays for all
  using (public.is_admin())
  with check (public.is_admin());

-- invites — admin only
create policy "invites: admin all"
  on public.invites for all
  using (public.is_admin())
  with check (public.is_admin());

-- Allow unauthenticated lookup of an invite by token (for signup page)
create policy "invites: public read by token"
  on public.invites for select
  to anon
  using (used_at is null and expires_at > now());

-- =====================================================================
-- Trigger: auto-create profile when an auth user is created via invite
-- The signup flow inserts the profile via service role, but this is a
-- safety net for any users created directly in the dashboard.
-- =====================================================================
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
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'employee')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
