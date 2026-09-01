-- =====================================================================
-- App settings (admin-managed, key-value).
-- First setting: annual_min_notice_days — employees must request ANNUAL
-- leave at least this many calendar days before it starts (0 = off).
-- Admins are exempt (they can always log/backfill), and sick leave is
-- never restricted. Enforced in the app at create/edit time.
-- Run this in the Supabase SQL editor (after 007).
-- =====================================================================

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.app_settings enable row level security;

-- Anyone signed in can read (the request form can surface the rule);
-- only admins write.
create policy "app_settings: authenticated read"
  on public.app_settings for select
  using (auth.uid() is not null);

create policy "app_settings: admin writes"
  on public.app_settings for all
  using (public.is_admin())
  with check (public.is_admin());
