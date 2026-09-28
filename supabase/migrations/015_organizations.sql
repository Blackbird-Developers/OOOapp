-- =====================================================================
-- Organizations: one database, many companies.
--
-- Until now the app assumed exactly one company. Nothing said which company
-- a row belonged to, and is_admin() meant admin of everything. This is the
-- groundwork for letting other companies sign up and run their own leave
-- calendars, and it changes nothing anyone can see: every existing row moves
-- into one organization, Blackbird Marketing, and the app keeps working as it
-- does today.
--
-- How the separation holds
-- ------------------------
--   organization_id  Every table gets one, not null. Root tables (people,
--                    holidays, templates, groups, ...) default it to the
--                    signed-in user organization, so inserts made with the
--                    user session need no change. Child tables (leave, group
--                    members, template rules, ...) copy it from their parent
--                    in a trigger, so the service role does not have to pass
--                    it either.
--
--   Composite keys   Child rows point at their parent with the organization
--                    in the key: (organization_id, user_id) references
--                    profiles (organization_id, id), and so on. The database
--                    itself then refuses leave for a person in another
--                    company, a group member from another company, and so on,
--                    even from the service role, which skips RLS.
--
--   RLS              One RESTRICTIVE policy per table: organization_id must
--                    equal current_org_id(). Restrictive policies are ANDed
--                    with the existing ones, so every rule from earlier
--                    migrations keeps working, now inside one company only.
--                    is_admin() keeps meaning "my role is admin", which these
--                    policies turn into "admin of my own company".
--
--   Service role     Skips RLS entirely. Every server query made with it
--                    filters by organization in the app. Inserts that forget
--                    to set a root organization_id fail on not null rather
--                    than landing in the wrong company.
--
-- Also in here
-- ------------
--   * Leave types, public holidays, settings, integration settings and the
--     Slack digest log become per company: their keys now include
--     organization_id.
--   * The anonymous "read invites" policy is dropped. It let anyone holding
--     the public anon key list every open invite, with names, emails and
--     tokens. The invite page looks its token up on the server instead.
--   * handle_new_user() reads the company and role from app_metadata, which
--     only the service role can write, instead of user_metadata, which the
--     person signing up controls.
--
-- Blackbird Marketing gets a fixed id, 00000000-0000-4000-8000-000000000001,
-- so the app can recognise it: the environment variable fallbacks for Slack
-- and the Gmail auto-reply belong to Blackbird alone.
--
-- No apostrophes in these comments, on purpose. The Supabase SQL editor splits
-- statements client-side and reads a lone apostrophe as opening a string
-- literal, which turns a harmless comment into a syntax error on paste.
--
-- Run this in the Supabase SQL editor (after 014).
-- =====================================================================

-- ---------- Organizations ----------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);

insert into public.organizations (id, name)
values ('00000000-0000-4000-8000-000000000001', 'Blackbird Marketing');

-- ---------- Profiles carry the organization ----------
alter table public.profiles
  add column organization_id uuid references public.organizations(id) on delete cascade;
update public.profiles set organization_id = '00000000-0000-4000-8000-000000000001';
alter table public.profiles alter column organization_id set not null;
alter table public.profiles add constraint profiles_org_id_key unique (organization_id, id);
create index on public.profiles (organization_id);

-- The organization of whoever is signed in. Security definer so it can read
-- profiles without going through the profiles policies, which call it.
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

-- ---------- Every other table ----------
-- Add the column, put existing rows in Blackbird, then require it.
do $$
declare
  t text;
begin
  foreach t in array array[
    'leave_requests', 'public_holidays', 'invites', 'password_resets',
    'slack_daily_posts', 'conflict_groups', 'conflict_group_members',
    'app_settings', 'integration_settings', 'auto_reply_state',
    'leave_types', 'leave_policies', 'leave_policy_rules',
    'leave_policy_members', 'employment_details'
  ] loop
    execute format(
      'alter table public.%I add column organization_id uuid references public.organizations(id) on delete cascade',
      t);
    execute format(
      'update public.%I set organization_id = %L', t, '00000000-0000-4000-8000-000000000001');
    execute format('alter table public.%I alter column organization_id set not null', t);
    execute format('create index on public.%I (organization_id)', t);
  end loop;
end;
$$;

-- Root tables: rows written with the user session land in their company.
alter table public.public_holidays alter column organization_id set default public.current_org_id();
alter table public.invites         alter column organization_id set default public.current_org_id();
alter table public.conflict_groups alter column organization_id set default public.current_org_id();
alter table public.app_settings    alter column organization_id set default public.current_org_id();
alter table public.leave_types     alter column organization_id set default public.current_org_id();
alter table public.leave_policies  alter column organization_id set default public.current_org_id();

-- Child tables: copy the organization from the parent row when not given.
-- Arguments: parent table, column in the new row that holds the parent id.
create or replace function public.fill_organization_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_id uuid;
  org uuid;
begin
  if new.organization_id is null then
    parent_id := (to_jsonb(new) ->> tg_argv[1])::uuid;
    execute format('select organization_id from public.%I where id = $1', tg_argv[0])
      into org
      using parent_id;
    new.organization_id := org;
  end if;
  return new;
end;
$$;

create trigger leave_requests_fill_org before insert on public.leave_requests
  for each row execute function public.fill_organization_id('profiles', 'user_id');
create trigger password_resets_fill_org before insert on public.password_resets
  for each row execute function public.fill_organization_id('profiles', 'user_id');
create trigger conflict_group_members_fill_org before insert on public.conflict_group_members
  for each row execute function public.fill_organization_id('conflict_groups', 'group_id');
create trigger auto_reply_state_fill_org before insert on public.auto_reply_state
  for each row execute function public.fill_organization_id('profiles', 'user_id');
create trigger leave_policy_rules_fill_org before insert on public.leave_policy_rules
  for each row execute function public.fill_organization_id('leave_policies', 'policy_id');
create trigger leave_policy_members_fill_org before insert on public.leave_policy_members
  for each row execute function public.fill_organization_id('profiles', 'user_id');
create trigger employment_details_fill_org before insert on public.employment_details
  for each row execute function public.fill_organization_id('profiles', 'user_id');

-- ---------- Keys that were global become per company ----------
alter table public.public_holidays drop constraint public_holidays_date_key;
alter table public.public_holidays
  add constraint public_holidays_org_date_key unique (organization_id, date);

alter table public.app_settings drop constraint app_settings_pkey;
alter table public.app_settings add primary key (organization_id, key);

alter table public.integration_settings drop constraint integration_settings_pkey;
alter table public.integration_settings add primary key (organization_id, id);

alter table public.slack_daily_posts drop constraint slack_daily_posts_pkey;
alter table public.slack_daily_posts add primary key (organization_id, post_date);

drop index public.leave_policies_single_default;
create unique index leave_policies_single_default
  on public.leave_policies (organization_id) where is_default;

-- Leave types: each company has its own catalogue, so the key is only unique
-- within one. The foreign keys onto it are rebuilt with the organization in.
alter table public.leave_requests drop constraint leave_requests_type_fkey;
alter table public.leave_policy_rules drop constraint leave_policy_rules_leave_type_fkey;
alter table public.leave_types drop constraint leave_types_pkey;
alter table public.leave_types add primary key (organization_id, key);

alter table public.leave_requests
  add constraint leave_requests_type_fkey
  foreign key (organization_id, type)
  references public.leave_types (organization_id, key) on update cascade;

alter table public.leave_policy_rules
  add constraint leave_policy_rules_leave_type_fkey
  foreign key (organization_id, leave_type)
  references public.leave_types (organization_id, key) on update cascade on delete cascade;

-- ---------- Children and parents in the same company ----------
alter table public.leave_requests add constraint leave_requests_org_id_key unique (organization_id, id);
alter table public.conflict_groups add constraint conflict_groups_org_id_key unique (organization_id, id);
alter table public.leave_policies add constraint leave_policies_org_id_key unique (organization_id, id);

alter table public.leave_requests
  add constraint leave_requests_org_user_fkey
  foreign key (organization_id, user_id)
  references public.profiles (organization_id, id) on delete cascade;

alter table public.password_resets
  add constraint password_resets_org_user_fkey
  foreign key (organization_id, user_id)
  references public.profiles (organization_id, id) on delete cascade;

alter table public.conflict_group_members
  add constraint conflict_group_members_org_group_fkey
  foreign key (organization_id, group_id)
  references public.conflict_groups (organization_id, id) on delete cascade,
  add constraint conflict_group_members_org_user_fkey
  foreign key (organization_id, user_id)
  references public.profiles (organization_id, id) on delete cascade;

alter table public.auto_reply_state
  add constraint auto_reply_state_org_user_fkey
  foreign key (organization_id, user_id)
  references public.profiles (organization_id, id) on delete cascade;

alter table public.leave_policy_rules
  add constraint leave_policy_rules_org_policy_fkey
  foreign key (organization_id, policy_id)
  references public.leave_policies (organization_id, id) on delete cascade;

alter table public.leave_policy_members
  add constraint leave_policy_members_org_user_fkey
  foreign key (organization_id, user_id)
  references public.profiles (organization_id, id) on delete cascade,
  add constraint leave_policy_members_org_policy_fkey
  foreign key (organization_id, policy_id)
  references public.leave_policies (organization_id, id) on delete cascade;

alter table public.employment_details
  add constraint employment_details_org_user_fkey
  foreign key (organization_id, user_id)
  references public.profiles (organization_id, id) on delete cascade;

-- ---------- Row Level Security ----------
alter table public.organizations enable row level security;

create policy "organizations: members read own"
  on public.organizations for select
  using (id = public.current_org_id());

-- One restrictive policy per table that has policies. The function sits in a
-- sub-select so Postgres works it out once per query rather than once per row. Tables without any
-- (integration_settings, slack_daily_posts, password_resets, auto_reply_state)
-- stay closed to everyone but the service role, as before.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'leave_requests', 'public_holidays', 'invites',
    'conflict_groups', 'conflict_group_members', 'app_settings',
    'leave_types', 'leave_policies', 'leave_policy_rules',
    'leave_policy_members', 'employment_details'
  ] loop
    execute format(
      'create policy %I on public.%I as restrictive for all to public '
      'using (organization_id = (select public.current_org_id())) '
      'with check (organization_id = (select public.current_org_id()))',
      t || ': own organization only', t);
  end loop;
end;
$$;

drop policy if exists "invites: public read by token" on public.invites;

-- ---------- New auth users ----------
-- Only the service role can set app_metadata, so this is the one place a
-- company and role can come from. A user created without a company gets no
-- profile, and without a profile the app lets them do nothing.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid := nullif(new.raw_app_meta_data->>'organization_id', '')::uuid;
begin
  if org is null or not exists (select 1 from public.organizations where id = org) then
    return new;
  end if;

  insert into public.profiles (id, email, full_name, role, organization_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_app_meta_data->>'role')::user_role, 'employee'),
    org
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
