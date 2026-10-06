-- =====================================================================
-- Proving a company is who it says it is.
--
--   1. One company per email domain. A company keeps the domain its
--      founder proved they receive mail at. Nobody else can create a
--      second company on that domain: they are told to ask its admin for
--      an invite instead.
--   2. A declaration on record. Whoever creates a company gives their job
--      title and confirms they are allowed to set it up. The exact words,
--      the time and the IP address are kept in organization_declarations,
--      which only the service role can read.
--   3. Domain verification. An admin adds a TXT record to the DNS of the
--      company domain, which only someone in charge of that domain can do.
--      Until then the company is unverified, and join links, joining by
--      email domain, integrations and more than a few invites stay locked.
--
-- Run this in the Supabase SQL editor (after 018). Safe to run again if a
-- first attempt failed.
--
-- No apostrophes in these comments, on purpose. The Supabase SQL editor splits
-- statements client-side and reads a lone apostrophe as opening a string
-- literal, which turns a harmless comment into a syntax error on paste.
-- =====================================================================

alter table public.organizations
  -- Lower-case, such as acme.com.
  add column if not exists domain text
    check (domain is null or domain ~ '^[a-z0-9.-]+[.][a-z]{2,}$'),
  -- The value of the TXT record that proves the domain. Not a secret: it is
  -- published in DNS, so members of the company may read it.
  add column if not exists domain_verify_token text
    check (domain_verify_token is null or domain_verify_token ~ '^[A-Za-z0-9_-]{16,64}$'),
  add column if not exists domain_verified_at timestamptz;

create unique index if not exists organizations_domain_key
  on public.organizations (domain) where domain is not null;

-- Blackbird Marketing was here first, and is treated as verified.
update public.organizations
set domain = 'blackbird.marketing', domain_verified_at = coalesce(domain_verified_at, now())
where id = '00000000-0000-4000-8000-000000000001' and domain is null;

-- ---------- The declaration, while the sign-up is pending ----------
alter table public.signup_requests
  add column if not exists job_title text
    check (job_title is null or char_length(btrim(job_title)) between 1 and 100),
  add column if not exists declaration text
    check (declaration is null or char_length(declaration) <= 1000),
  add column if not exists declared_ip text
    check (declared_ip is null or char_length(declared_ip) <= 64);

-- ---------- The declaration, once the company exists ----------
create table if not exists public.organization_declarations (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  -- Null once that person is deleted; the record of what they said stays.
  user_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  email text not null,
  job_title text not null,
  declaration text not null,
  ip text,
  declared_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.organization_declarations enable row level security;
-- No policies, on purpose: service role only.

-- ---------- Creating a company, now with its domain ----------
-- Replaces the four-argument version from 018, which only this sign-up used.
-- The unique index above is what stops two companies sharing a domain, even
-- if two people finish signing up at the same moment.
drop function if exists public.create_organization(text, text, text, jsonb);

create or replace function public.create_organization(
  org_name text,
  org_country text,
  org_team_size text,
  policy jsonb,
  org_domain text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  org uuid;
begin
  org := public.create_organization(org_name);

  update public.organizations
  set country = org_country, team_size = org_team_size, domain = org_domain
  where id = org;

  if policy is not null then
    update public.leave_policies set
      name = coalesce(nullif(btrim(policy->>'name'), ''), name),
      seniority_enabled         = coalesce(((policy->'seniority'->>'enabled'))::boolean, seniority_enabled),
      seniority_every_years     = coalesce(((policy->'seniority'->>'everyYears'))::integer, seniority_every_years),
      seniority_extra_days      = coalesce(((policy->'seniority'->>'extraDays'))::numeric, seniority_extra_days),
      first_year_enabled        = coalesce(((policy->'firstYear'->>'enabled'))::boolean, first_year_enabled),
      first_year_days_per_month = coalesce(((policy->'firstYear'->>'daysPerMonth'))::numeric, first_year_days_per_month),
      carry_over_enabled        = coalesce(((policy->'carryOver'->>'enabled'))::boolean, carry_over_enabled),
      carry_over_max_days       = coalesce(((policy->'carryOver'->>'maxDays'))::numeric, carry_over_max_days),
      carry_over_expires        = (policy->'carryOver'->>'expires')
    where organization_id = org and is_default;

    -- Only types the catalogue has: create_organization made a rule for each.
    update public.leave_policy_rules r set
      enabled    = (x.value->>'enabled')::boolean,
      limit_kind = x.value->>'limit',
      days       = (x.value->>'days')::numeric,
      day_unit   = x.value->>'unit',
      note       = nullif(btrim(x.value->>'note'), '')
    from jsonb_each(coalesce(policy->'rules', jsonb_build_object())) as x(key, value)
    where r.organization_id = org and r.leave_type = x.key;
  end if;

  return org;
end;
$$;

revoke execute on function public.create_organization(text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_organization(text, text, text, jsonb, text) to service_role;
