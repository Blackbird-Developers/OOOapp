-- =====================================================================
-- Calendar integration: approved leave lands in the employee's own calendar.
--
-- Two delivery routes, because no single one reaches every calendar app:
--
--   1. Calendar invites. On approval the employee is emailed an iCalendar
--      attachment with METHOD:REQUEST. Google Calendar, Outlook, Teams and
--      Apple Mail all understand it natively, so this is the only mechanism
--      that covers all four without an OAuth app per vendor. Apple in
--      particular has no server-side write API at all, so any push-based
--      design would have left iCloud users out.
--
--   2. A personal subscription feed. Each profile gets a secret token that
--      addresses a read-only ICS URL of that persons approved leave. They
--      subscribe once and their calendar re-fetches it forever, which is the
--      self-healing backstop for an invite that was never accepted.
--
-- Column notes:
--   leave_requests.ics_sequence
--                      iCalendar SEQUENCE for this request. A calendar only
--                      replaces an existing event when the incoming copy
--                      carries the same UID and a HIGHER sequence, so this
--                      has to be durable and monotonic. Bumped every time an
--                      approved request is re-approved, edited or cancelled.
--
--   profiles.calendar_token
--                      Bearer secret in the feed URL. The feed is unavoidably
--                      unauthenticated -- calendar clients cannot log in --
--                      so the token IS the credential and is generated with
--                      gen_random_bytes rather than anything guessable.
--                      Nullable: a row only gets one when the person first
--                      asks for their feed, and regenerating is just an
--                      update, which instantly breaks the old URL.
--
--   integration_settings.config
--                      Per-service settings that are not Slack-shaped. The
--                      existing columns (channel_id, post_hour, bot_token)
--                      are all Slack vocabulary; rather than bolt six more
--                      nullable columns onto a shared table for every future
--                      service, anything service-specific from here on lives
--                      in this JSON object.
--
-- No apostrophes in these comments, on purpose -- the Supabase SQL editor
-- splits statements client-side and reads a lone apostrophe as opening a
-- string literal, which turns a harmless comment into a syntax error.
--
-- Run this in the Supabase SQL editor (after 009).
-- =====================================================================

alter table public.leave_requests
  add column if not exists ics_sequence integer not null default 0;

alter table public.profiles
  add column if not exists calendar_token text unique;

alter table public.integration_settings
  add column if not exists config jsonb not null default '{}'::jsonb;

-- The calendar service, off until an admin turns it on. Inserted here rather
-- than left to the app so the Integrations page has a row to read on day one.
insert into public.integration_settings (id, connected, config)
values ('calendar', false, '{}'::jsonb)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- No new RLS policy for calendar_token, on purpose. Every read and write of
-- it goes through the service-role client in lib/calendar.ts, behind a route
-- that has already established who the caller is, so the browser never
-- queries the column directly and the existing profiles policies are left
-- exactly as they were.
--
-- Worth knowing: those policies let an admin SELECT any profile row, which
-- now includes other peoples feed tokens. That is not a new grant -- an admin
-- can already read every leave request in the app -- but it is the reason the
-- account page offers Create a new link, which invalidates the old one.
-- ---------------------------------------------------------------------
