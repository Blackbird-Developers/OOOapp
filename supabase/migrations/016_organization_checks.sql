-- =====================================================================
-- Same-company checks as triggers instead of composite foreign keys.
--
-- Migration 015 tied child rows to their parent with the organization in the
-- key: (organization_id, user_id) referencing profiles (organization_id, id).
-- That sat alongside the original single-column key, so PostgREST suddenly
-- found TWO relationships between, for example, leave_policies and
-- leave_policy_rules, and every embedded select across them failed with
-- "more than one relationship was found". Leave policies, the team calendar,
-- who is off and the Slack digest all embed across exactly those links.
--
-- This drops the composite keys, which puts the relationships PostgREST sees
-- back to exactly what they were before 015, and enforces the same rule in a
-- trigger instead: a child row must be in the same organization as each
-- parent it points at. The trigger still fills organization_id from the first
-- parent when it is not given, as the one from 015 did.
--
-- The composite keys onto leave_types stay. They replaced the old single key
-- rather than sitting beside it, so each of those links is still one
-- relationship, and leave types really are only unique within a company.
--
-- No apostrophes in these comments, on purpose. The Supabase SQL editor splits
-- statements client-side and reads a lone apostrophe as opening a string
-- literal, which turns a harmless comment into a syntax error on paste.
--
-- Run this in the Supabase SQL editor (after 015).
-- =====================================================================

-- ---------- Drop the composite keys that duplicated a relationship ----------
alter table public.leave_requests drop constraint leave_requests_org_user_fkey;
alter table public.password_resets drop constraint password_resets_org_user_fkey;
alter table public.conflict_group_members
  drop constraint conflict_group_members_org_group_fkey,
  drop constraint conflict_group_members_org_user_fkey;
alter table public.auto_reply_state drop constraint auto_reply_state_org_user_fkey;
alter table public.leave_policy_rules drop constraint leave_policy_rules_org_policy_fkey;
alter table public.leave_policy_members
  drop constraint leave_policy_members_org_user_fkey,
  drop constraint leave_policy_members_org_policy_fkey;
alter table public.employment_details drop constraint employment_details_org_user_fkey;

-- The unique keys those pointed at are no longer needed.
alter table public.leave_requests drop constraint leave_requests_org_id_key;
alter table public.conflict_groups drop constraint conflict_groups_org_id_key;
alter table public.leave_policies drop constraint leave_policies_org_id_key;
alter table public.profiles drop constraint profiles_org_id_key;

-- ---------- The check ----------
-- Arguments come in pairs: parent table, column in the new row holding its id.
-- The first pair fills organization_id when it is null; every pair must then
-- name a parent in that same organization. A parent that does not exist is
-- left to the ordinary foreign key, which reports it more clearly.
create or replace function public.check_organization_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  i integer := 0;
  parent_id uuid;
  parent_org uuid;
begin
  while i < tg_nargs loop
    parent_id := (to_jsonb(new) ->> tg_argv[i + 1])::uuid;
    if parent_id is not null then
      execute format('select organization_id from public.%I where id = $1', tg_argv[i])
        into parent_org
        using parent_id;

      if new.organization_id is null and i = 0 then
        new.organization_id := parent_org;
      elsif parent_org is not null and parent_org is distinct from new.organization_id then
        raise exception '%.% belongs to another organization', tg_table_name, tg_argv[i + 1]
          using errcode = '23503';
      end if;
    end if;
    i := i + 2;
  end loop;
  return new;
end;
$$;

-- Replace the fill-only triggers from 015. Updates are checked too now: a
-- composite key would have refused re-pointing a row at another company, and
-- so does this.
drop trigger leave_requests_fill_org on public.leave_requests;
drop trigger password_resets_fill_org on public.password_resets;
drop trigger conflict_group_members_fill_org on public.conflict_group_members;
drop trigger auto_reply_state_fill_org on public.auto_reply_state;
drop trigger leave_policy_rules_fill_org on public.leave_policy_rules;
drop trigger leave_policy_members_fill_org on public.leave_policy_members;
drop trigger employment_details_fill_org on public.employment_details;
drop function public.fill_organization_id();

create trigger leave_requests_check_org before insert or update on public.leave_requests
  for each row execute function public.check_organization_id('profiles', 'user_id');
create trigger password_resets_check_org before insert or update on public.password_resets
  for each row execute function public.check_organization_id('profiles', 'user_id');
create trigger conflict_group_members_check_org before insert or update on public.conflict_group_members
  for each row execute function public.check_organization_id('conflict_groups', 'group_id', 'profiles', 'user_id');
create trigger auto_reply_state_check_org before insert or update on public.auto_reply_state
  for each row execute function public.check_organization_id('profiles', 'user_id');
create trigger leave_policy_rules_check_org before insert or update on public.leave_policy_rules
  for each row execute function public.check_organization_id('leave_policies', 'policy_id');
create trigger leave_policy_members_check_org before insert or update on public.leave_policy_members
  for each row execute function public.check_organization_id('profiles', 'user_id', 'leave_policies', 'policy_id');
create trigger employment_details_check_org before insert or update on public.employment_details
  for each row execute function public.check_organization_id('profiles', 'user_id');

-- Existing rows were all put in one organization by 015, so there is nothing
-- to re-check here.
