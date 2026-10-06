-- =====================================================================
-- Company registration: new companies sign up, people join them.
--
-- Three ways in, on top of the admin invite that already exists:
--
--   Create a company  /signup. The person who signs up becomes the first
--                     admin of a brand new organization.
--   Join link         /join/<code>. Every company can switch on one
--                     shareable link; anyone who opens it joins as an
--                     employee. Admins can replace it (the old one stops
--                     working) or switch it off.
--   Email domain      Off by default. An admin can let anyone with an
--                     address at their own work domain join as an employee
--                     from /signup, without needing the link.
--
-- Nothing is created until the person proves they own the email address:
-- every route in writes a signup_requests row and emails a link, and only
-- following that link (and setting a password) creates the account, and for
-- a new company the organization. Admin rights are never handed out here
-- beyond the founder of a new company: more admins are promoted from inside.
--
-- Run this in the Supabase SQL editor (after 016).
--
-- No apostrophes in these comments, on purpose. The Supabase SQL editor splits
-- statements client-side and reads a lone apostrophe as opening a string
-- literal, which turns a harmless comment into a syntax error on paste.
-- =====================================================================

-- ---------- How people can join a company ----------
alter table public.organizations
  -- The secret part of the join link. Null means the link is switched off.
  add column join_code text unique
    check (join_code is null or join_code ~ '^[A-Za-z0-9_-]{16,64}$'),
  -- Lower-case domain such as acme.com, taken from the admin who enabled it.
  add column join_domain text
    check (join_domain is null or join_domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  add column domain_join_enabled boolean not null default false,
  add check (not domain_join_enabled or join_domain is not null);

-- One company per domain: otherwise the person signing up would be offered
-- whichever company happened to claim it first.
create unique index organizations_join_domain_key
  on public.organizations (join_domain) where domain_join_enabled;

-- ---------- Pending sign-ups ----------
-- One row per "check your inbox". Only the service role touches it.
create table public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  -- create: a new company named company_name, with this person as its admin.
  -- join:   an employee of organization_id.
  kind text not null check (kind in ('create', 'join')),
  email text not null check (email = lower(email)),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  company_name text check (company_name is null or char_length(btrim(company_name)) between 1 and 80),
  organization_id uuid references public.organizations(id) on delete cascade,
  -- For a join, which door it came through, so the confirmation can check the
  -- door is still open: a link that has since been replaced, or a domain join
  -- switched off, must not still let this person in.
  join_via text check (join_via in ('link', 'domain')),
  join_code text,
  -- SHA-256 of the emailed token. The token itself is never stored, so a leak
  -- of this table does not hand out working links.
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (kind = 'create' and company_name is not null and organization_id is null)
    or (kind = 'join' and organization_id is not null and join_via is not null)
  )
);

create index on public.signup_requests (email, created_at);

alter table public.signup_requests enable row level security;
-- No policies, on purpose, like password_resets: service role only.

-- ---------- Creating a company ----------
-- The organization plus what every company needs before its first request:
-- the leave type catalogue and a default template. The same starting point
-- migration 013 gave Blackbird: annual and sick leave at 20 days, the other
-- types present but switched off until an admin turns them on.
-- One function, so the company and its setup commit together or not at all.
create or replace function public.create_organization(org_name text)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  org uuid;
  policy uuid;
begin
  insert into public.organizations (name) values (btrim(org_name)) returning id into org;

  insert into public.leave_types (organization_id, key, name, sort_order) values
    (org, 'annual',         'Annual leave',         10),
    (org, 'sick',           'Sick leave',           20),
    (org, 'maternity',      'Maternity leave',      30),
    (org, 'paternity',      'Paternity leave',      40),
    (org, 'marriage',       'Marriage leave',       50),
    (org, 'bereavement',    'Bereavement leave',    60),
    (org, 'blood_donation', 'Blood donation leave', 70),
    (org, 'unpaid',         'Unpaid leave',         80);

  insert into public.leave_policies (organization_id, name, is_default)
  values (org, 'Standard', true)
  returning id into policy;

  insert into public.leave_policy_rules
    (organization_id, policy_id, leave_type, enabled, limit_kind, days, day_unit)
  select org, policy, r.leave_type, r.enabled, r.limit_kind, r.days, r.day_unit
  from (values
    ('annual',         true,  'per_year',    20.0,  'working'),
    ('sick',           true,  'per_year',    20.0,  'working'),
    ('maternity',      false, 'per_request', 365.0, 'calendar'),
    ('paternity',      false, 'per_request', 3.0,   'working'),
    ('marriage',       false, 'per_request', 5.0,   'working'),
    ('bereavement',    false, 'per_request', 5.0,   'working'),
    ('blood_donation', false, 'per_request', 1.0,   'working'),
    ('unpaid',         false, 'unlimited',   null,  'working')
  ) as r(leave_type, enabled, limit_kind, days, day_unit);

  return org;
end;
$$;

-- Server only. Supabase grants new functions to anon and authenticated by
-- default, which would let anyone holding the public key create companies.
revoke execute on function public.create_organization(text) from public, anon, authenticated;
grant execute on function public.create_organization(text) to service_role;
