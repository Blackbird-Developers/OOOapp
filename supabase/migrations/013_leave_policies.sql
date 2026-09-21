-- =====================================================================
-- Leave policies: templates of leave rules that people are added to.
--
-- Until now every person had two numbers on their profile, an annual and a
-- sick allowance, and nothing else: no way to say "one more day for every
-- five years worked", no carry-over, and no leave other than annual or sick.
-- Rules like that differ by country and by company, so they become data an
-- admin edits rather than code.
--
-- How it fits together
-- --------------------
--   leave_types          One catalogue of kinds of leave, shared by every
--                        template: annual, sick, maternity, ... plus any an
--                        admin adds. leave_requests.type now points here.
--   leave_policies       A template (e.g. "Kosovo"). Holds the annual-leave
--                        rules that change how many days someone gets:
--                        seniority, first-year leave and carry-over.
--   leave_policy_rules   What a template allows for each leave type: on or
--                        off, a yearly allowance, a cap per request, or no
--                        fixed limit. A type with no row here is off.
--   leave_policy_members Who follows which template. One template each;
--                        anyone not added to one follows the default.
--   employment_details   A start date and previous work experience, which
--                        seniority and first-year leave are worked out from.
--                        Its own table rather than columns on profiles:
--                        since 003 any signed-in user can read every profile
--                        column, and this is only the person's and admins'.
--
-- Nothing moves when this runs. The default template it creates is exactly
-- today's rules (20 annual, 20 sick, nothing else switched on), and anyone
-- whose allowance was changed by hand is put in a template with their own
-- numbers. The other Kosovo leave types are filled in but switched off.
--
-- profiles.annual_allowance / sick_allowance are left in place but no longer
-- read once this has run: the app falls back to them only while this
-- migration is missing, which is what makes deploying the code first safe.
--
-- Run this in the Supabase SQL editor (after 012).
-- =====================================================================

-- ---------- Leave types ----------
create table public.leave_types (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order integer not null default 100,
  created_at timestamptz not null default now()
);

insert into public.leave_types (key, name, sort_order) values
  ('annual',         'Annual leave',         10),
  ('sick',           'Sick leave',           20),
  ('maternity',      'Maternity leave',      30),
  ('paternity',      'Paternity leave',      40),
  ('marriage',       'Marriage leave',       50),
  ('bereavement',    'Bereavement leave',    60),
  ('blood_donation', 'Blood donation leave', 70),
  ('unpaid',         'Unpaid leave',         80);

-- The column was an enum of exactly annual/sick. Existing values are already
-- catalogue keys, so the conversion keeps every row as it is.
alter table public.leave_requests
  alter column type type text using type::text;

alter table public.leave_requests
  add constraint leave_requests_type_fkey
  foreign key (type) references public.leave_types(key) on update cascade;

drop type public.leave_type;

-- ---------- Templates ----------
create table public.leave_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  is_default boolean not null default false,

  -- Seniority: `seniority_extra_days` more annual days for every
  -- `seniority_every_years` years of work experience (Kosovo: 1 per 5).
  seniority_enabled boolean not null default false,
  seniority_every_years integer not null default 5
    check (seniority_every_years between 1 and 50),
  seniority_extra_days numeric(4,1) not null default 1
    check (seniority_extra_days > 0 and seniority_extra_days <= 30),

  -- First-year leave: in the calendar year someone starts, they earn this
  -- many annual days per month worked instead of the full allowance.
  first_year_enabled boolean not null default false,
  first_year_days_per_month numeric(4,2) not null default 1.5
    check (first_year_days_per_month > 0 and first_year_days_per_month <= 31),

  -- Carry-over: unused annual days move into the next year, up to a cap.
  -- `carry_over_expires` is a month-day ('06-30') in that next year after
  -- which carried days that haven't been used lapse; null keeps them all year.
  carry_over_enabled boolean not null default false,
  carry_over_max_days numeric(4,1) not null default 5
    check (carry_over_max_days > 0 and carry_over_max_days <= 366),
  carry_over_expires text
    check (carry_over_expires ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),

  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one default. Switching it goes through set_default_leave_policy(),
-- which clears the old one first so the index never sees two.
create unique index leave_policies_single_default
  on public.leave_policies (is_default) where is_default;

-- ---------- What each template allows, per leave type ----------
create table public.leave_policy_rules (
  policy_id uuid not null references public.leave_policies(id) on delete cascade,
  leave_type text not null
    references public.leave_types(key) on update cascade on delete cascade,
  enabled boolean not null default true,
  -- per_year     an allowance that resets on 1 January (annual, sick)
  -- per_request  up to `days` each time it is taken (marriage: 5)
  -- unlimited    no fixed number; the approval decides (unpaid)
  limit_kind text not null check (limit_kind in ('per_year', 'per_request', 'unlimited')),
  days numeric(5,1) check (days is null or (days >= 0 and days <= 1000)),
  -- working: weekends and public holidays don't count (the default)
  -- calendar: every day counts (maternity runs in months, not working days)
  day_unit text not null default 'working' check (day_unit in ('working', 'calendar')),
  -- Shown to employees when they pick the type, e.g. how it is paid.
  note text check (note is null or char_length(note) <= 400),
  primary key (policy_id, leave_type),
  check (limit_kind = 'unlimited' or days is not null),
  -- Balances, carry-over and seniority all assume annual leave is yearly.
  check (leave_type <> 'annual' or limit_kind = 'per_year')
);

-- ---------- Who follows which template ----------
create table public.leave_policy_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  policy_id uuid not null references public.leave_policies(id) on delete cascade,
  added_at timestamptz not null default now()
);

create index on public.leave_policy_members (policy_id);

-- ---------- What seniority and first-year leave need to know ----------
-- Unused until an admin fills it in: with no start date, nobody gets a
-- seniority bonus or first-year proration, just the template's days.
create table public.employment_details (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  -- First day at the company. Drives first-year leave and, with the
  -- experience below, seniority.
  start_date date,
  -- Work experience from before the company, counted towards seniority.
  prior_experience_months integer not null default 0
    check (prior_experience_months between 0 and 720),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on column public.profiles.annual_allowance is
  'Superseded by leave policies (migration 013). Only read while 013 has not been run.';
comment on column public.profiles.sick_allowance is
  'Superseded by leave policies (migration 013). Only read while 013 has not been run.';

-- ---------- Switching the default ----------
-- Two updates in one function so they commit together: clear the old default,
-- then set the new one. A single UPDATE flipping both rows can trip the unique
-- index, depending on which row Postgres happens to write first.
create or replace function public.set_default_leave_policy(policy uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change the default leave policy';
  end if;
  if not exists (select 1 from public.leave_policies where id = policy) then
    raise exception 'Leave policy not found';
  end if;
  update public.leave_policies set is_default = false where is_default and id <> policy;
  update public.leave_policies set is_default = true, updated_at = now() where id = policy;
end;
$$;

-- ---------- Row Level Security ----------
alter table public.leave_types enable row level security;
alter table public.leave_policies enable row level security;
alter table public.leave_policy_rules enable row level security;
alter table public.leave_policy_members enable row level security;
alter table public.employment_details enable row level security;

-- Anyone signed in reads types, templates and rules: the request form shows
-- your template's rules. Only admins write.
create policy "leave_types: authenticated read"
  on public.leave_types for select
  using (auth.uid() is not null);

create policy "leave_types: admin writes"
  on public.leave_types for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "leave_policies: authenticated read"
  on public.leave_policies for select
  using (auth.uid() is not null);

create policy "leave_policies: admin writes"
  on public.leave_policies for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "leave_policy_rules: authenticated read"
  on public.leave_policy_rules for select
  using (auth.uid() is not null);

create policy "leave_policy_rules: admin writes"
  on public.leave_policy_rules for all
  using (public.is_admin())
  with check (public.is_admin());

-- Which template a colleague is on is their business: you can see your own.
create policy "leave_policy_members: read own, admin reads all"
  on public.leave_policy_members for select
  using (user_id = auth.uid() or public.is_admin());

create policy "leave_policy_members: admin writes"
  on public.leave_policy_members for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "employment_details: read own, admin reads all"
  on public.employment_details for select
  using (user_id = auth.uid() or public.is_admin());

create policy "employment_details: admin writes"
  on public.employment_details for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- Seed: today's rules become the default template ----------
with standard as (
  insert into public.leave_policies (name, is_default)
  values ('Standard', true)
  returning id
)
insert into public.leave_policy_rules (policy_id, leave_type, enabled, limit_kind, days, day_unit)
select standard.id, r.leave_type, r.enabled, r.limit_kind, r.days, r.day_unit
from standard, (values
  ('annual',         true,  'per_year',    20.0,  'working'),
  ('sick',           true,  'per_year',    20.0,  'working'),
  ('maternity',      false, 'per_request', 365.0, 'calendar'),
  ('paternity',      false, 'per_request', 3.0,   'working'),
  ('marriage',       false, 'per_request', 5.0,   'working'),
  ('bereavement',    false, 'per_request', 5.0,   'working'),
  ('blood_donation', false, 'per_request', 1.0,   'working'),
  ('unpaid',         false, 'unlimited',   null,  'working')
) as r(leave_type, enabled, limit_kind, days, day_unit);

-- Anyone whose allowance was changed by hand keeps their numbers: each
-- distinct pair gets a copy of Standard with those numbers, and its people.
do $$
declare
  pair record;
  standard_id uuid;
  copy_id uuid;
begin
  select id into standard_id from public.leave_policies where is_default;

  for pair in
    select annual_allowance, sick_allowance
    from public.profiles
    where annual_allowance <> 20 or sick_allowance <> 20
    group by annual_allowance, sick_allowance
    order by annual_allowance, sick_allowance
  loop
    insert into public.leave_policies (name)
    values (format('Annual %s, sick %s',
                   trim_scale(pair.annual_allowance), trim_scale(pair.sick_allowance)))
    returning id into copy_id;

    insert into public.leave_policy_rules
      (policy_id, leave_type, enabled, limit_kind, days, day_unit, note)
    select copy_id, leave_type, enabled, limit_kind,
           case leave_type
             when 'annual' then pair.annual_allowance
             when 'sick' then pair.sick_allowance
             else days
           end,
           day_unit, note
    from public.leave_policy_rules
    where policy_id = standard_id;

    insert into public.leave_policy_members (user_id, policy_id)
    select id, copy_id
    from public.profiles
    where annual_allowance = pair.annual_allowance
      and sick_allowance = pair.sick_allowance;
  end loop;
end;
$$;
