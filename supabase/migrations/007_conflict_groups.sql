-- =====================================================================
-- Hierarchy / conflict groups.
-- An admin groups people who cover for each other (e.g. one core role).
-- Rule (enforced in the app at create/edit/approve time): at least one
-- member of a group must always be available — ANNUAL leave that would
-- leave a group with nobody present on some working day is blocked.
-- Sick leave is never blocked.
-- Run this in the Supabase SQL editor (after 006).
-- =====================================================================

create table public.conflict_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.conflict_group_members (
  group_id uuid not null references public.conflict_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index on public.conflict_group_members (user_id);

-- ---------- Row Level Security ----------
alter table public.conflict_groups enable row level security;
alter table public.conflict_group_members enable row level security;

-- Anyone signed in can read (so the request UI can eventually surface
-- "you share cover with X"); only admins write.
create policy "conflict_groups: authenticated read"
  on public.conflict_groups for select
  using (auth.uid() is not null);

create policy "conflict_groups: admin writes"
  on public.conflict_groups for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "conflict_group_members: authenticated read"
  on public.conflict_group_members for select
  using (auth.uid() is not null);

create policy "conflict_group_members: admin writes"
  on public.conflict_group_members for all
  using (public.is_admin())
  with check (public.is_admin());
