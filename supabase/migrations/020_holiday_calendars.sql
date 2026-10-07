-- =====================================================================
-- Holiday calendars: public holidays by country, with people added to them.
--
-- Until now each company had one list of public holidays, and it applied to
-- everybody. A team split between Kosovo and Ireland had to keep both
-- countries holidays in that one list, so a Kosovo holiday was a day off for
-- the Irish staff too, as far as leave counts went, and the other way round.
--
-- How it fits together, the same way leave policies work (013)
-- ----------------------------------------------------------------------
--   holiday_calendars         A named list of holidays, such as Kosovo or
--                             Ireland. `preset` remembers which built-in
--                             country rules fill it (lib/holiday-presets.ts),
--                             so the app can offer next year with one click.
--                             One calendar per company is the default.
--   public_holidays           Each holiday now belongs to one calendar. The
--                             same date may appear in several calendars.
--   holiday_calendar_members  Who follows which calendar. One each; anyone
--                             not added to one follows the default.
--
-- Nothing changes on the day this runs. Every company gets one default
-- calendar called Company holidays, all of its existing holidays move into
-- it, and nobody is added to anything, so everyone follows it exactly as
-- they follow the single list today.
--
-- New companies get an empty default calendar from a trigger; the sign-up
-- then fills it with the holidays of the country the company chose.
--
-- No apostrophes in these comments, on purpose. The Supabase SQL editor splits
-- statements client-side and reads a lone apostrophe as opening a string
-- literal, which turns a harmless comment into a syntax error on paste.
--
-- Run this in the Supabase SQL editor (after 019).
-- =====================================================================

-- ---------- Calendars ----------
create table public.holiday_calendars (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_org_id()
    references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- A preset key: a country code such as XK, or GB-SCT for a UK nation.
  preset text check (preset is null or preset ~ '^[A-Z]{2}(-[A-Z]{2,3})?$'),
  is_default boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.holiday_calendars (organization_id);

-- At most one default per company. Switching it goes through
-- set_default_holiday_calendar(), which clears the old one first.
create unique index holiday_calendars_single_default
  on public.holiday_calendars (organization_id) where is_default;

-- ---------- Who follows which calendar ----------
create table public.holiday_calendar_members (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  calendar_id uuid not null references public.holiday_calendars(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  added_at timestamptz not null default now()
);

create index on public.holiday_calendar_members (calendar_id);

create trigger holiday_calendar_members_check_org
  before insert or update on public.holiday_calendar_members
  for each row execute function public.check_organization_id(
    'profiles', 'user_id', 'holiday_calendars', 'calendar_id');

-- ---------- Every company gets a default calendar ----------
insert into public.holiday_calendars (organization_id, name, preset, is_default)
select o.id, 'Company holidays', o.country, true
from public.organizations o;

-- ---------- Holidays belong to a calendar ----------
alter table public.public_holidays
  add column calendar_id uuid references public.holiday_calendars(id) on delete cascade;

update public.public_holidays h
set calendar_id = c.id
from public.holiday_calendars c
where c.organization_id = h.organization_id and c.is_default;

alter table public.public_holidays alter column calendar_id set not null;

-- The same date can now be a holiday in two calendars of one company.
alter table public.public_holidays drop constraint public_holidays_org_date_key;
alter table public.public_holidays
  add constraint public_holidays_calendar_date_key unique (calendar_id, date);

create index on public.public_holidays (organization_id, date);

-- The calendar decides the company: inserts made with the service role need
-- not pass organization_id, and a holiday can never point at a calendar of
-- another company.
create trigger public_holidays_check_org
  before insert or update on public.public_holidays
  for each row execute function public.check_organization_id('holiday_calendars', 'calendar_id');

-- ---------- New companies ----------
create or replace function public.create_default_holiday_calendar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.holiday_calendars (organization_id, name, preset, is_default)
  values (new.id, 'Company holidays', new.country, true);
  return new;
end;
$$;

create trigger organizations_default_holiday_calendar
  after insert on public.organizations
  for each row execute function public.create_default_holiday_calendar();

-- ---------- Switching the default ----------
-- Security invoker, so RLS keeps it inside the caller company.
create or replace function public.set_default_holiday_calendar(calendar uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change the default holiday calendar';
  end if;
  if not exists (select 1 from public.holiday_calendars where id = calendar) then
    raise exception 'Holiday calendar not found';
  end if;
  update public.holiday_calendars set is_default = false where is_default and id <> calendar;
  update public.holiday_calendars set is_default = true, updated_at = now() where id = calendar;
end;
$$;

-- ---------- Row Level Security ----------
alter table public.holiday_calendars enable row level security;
alter table public.holiday_calendar_members enable row level security;

-- Calendars and their holidays are no secret inside a company.
create policy "holiday_calendars: authenticated read"
  on public.holiday_calendars for select
  using (auth.uid() is not null);

create policy "holiday_calendars: admin writes"
  on public.holiday_calendars for all
  using (public.is_admin())
  with check (public.is_admin());

-- Like leave policy membership: you see your own, admins see everyone.
create policy "holiday_calendar_members: read own, admin reads all"
  on public.holiday_calendar_members for select
  using (user_id = auth.uid() or public.is_admin());

create policy "holiday_calendar_members: admin writes"
  on public.holiday_calendar_members for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "holiday_calendars: own organization only"
  on public.holiday_calendars as restrictive for all to public
  using (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));

create policy "holiday_calendar_members: own organization only"
  on public.holiday_calendar_members as restrictive for all to public
  using (organization_id = (select public.current_org_id()))
  with check (organization_id = (select public.current_org_id()));
