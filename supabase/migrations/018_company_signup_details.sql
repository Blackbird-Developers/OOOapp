-- =====================================================================
-- More to show before a company can be created, and its leave set up.
--
-- Creating a company on /signup now asks for:
--   country     Where the company is based (ISO 3166 code such as XK).
--               Leave law differs by country, so the sign-up uses it to
--               suggest a starting leave policy and to flag allowances
--               below the legal minimum.
--   team_size   Roughly how many people work there.
--   leave policy  The starting default template: the standard 20 annual
--               and 20 sick days, Kosovo labour law, or one the founder
--               builds on the spot. Skipping the step gives the standard.
--
-- All three are kept on the pending signup_requests row until the emailed
-- link is followed, then the company is created with them in one go.
--
-- Run this in the Supabase SQL editor (after 017_company_registration and
-- 017_slack_leave_approvals). Safe to run again if a first attempt failed.
--
-- No apostrophes in these comments, on purpose. The Supabase SQL editor splits
-- statements client-side and reads a lone apostrophe as opening a string
-- literal, which turns a harmless comment into a syntax error on paste.
-- =====================================================================

alter table public.organizations
  add column if not exists country text check (country is null or country ~ '^[A-Z]{2}$'),
  add column if not exists team_size text
    check (team_size is null or team_size in ('1-10', '11-50', '51-200', '201-500', '500+'));

-- Blackbird Marketing is in Kosovo.
update public.organizations set country = 'XK'
where id = '00000000-0000-4000-8000-000000000001';

alter table public.signup_requests
  add column if not exists country text check (country is null or country ~ '^[A-Z]{2}$'),
  add column if not exists team_size text
    check (team_size is null or team_size in ('1-10', '11-50', '51-200', '201-500', '500+')),
  -- The starting template, already checked by the server: its name, the
  -- seniority, firstYear and carryOver settings, and one rule per leave type
  -- (enabled, limit, days, unit, note), as lib/registration.ts writes it.
  -- Null means the standard template.
  add column if not exists leave_policy jsonb
    check (leave_policy is null or jsonb_typeof(leave_policy) = 'object');

-- ---------- Creating a company, with its details and leave policy ----------
-- Builds on create_organization(text) from 017, which makes the company, the
-- leave type catalogue and the standard default template. This then stores
-- the details and rewrites that default template to the chosen one. All in
-- one function call, so a policy the table checks reject leaves no company
-- behind.
create or replace function public.create_organization(
  org_name text,
  org_country text,
  org_team_size text,
  policy jsonb
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
  set country = org_country, team_size = org_team_size
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

-- Server only, like the one-argument version.
revoke execute on function public.create_organization(text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.create_organization(text, text, text, jsonb) to service_role;
