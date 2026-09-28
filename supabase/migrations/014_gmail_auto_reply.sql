-- =====================================================================
-- Gmail out-of-office auto-reply.
--
-- When approved leave starts, the person mailbox answers senders with
-- "away until <date>, meanwhile contact <group-mate>" and stops on its own
-- when the leave ends. The cover contact comes from the Hierarchy groups in
-- 007: those are already the people who cover for each other, so there is no
-- second org chart to keep up to date.
--
-- Written through the Gmail API with a Google Workspace service account that
-- holds domain-wide delegation for gmail.settings.basic. The app impersonates
-- each employee and sets THEIR vacation responder -- it never sends mail as
-- them, and the scope cannot read a single message.
--
-- The responder window itself is enforced by Gmail, not by this app. Gmail
-- takes startTime and endTime and switches the responder on and off at those
-- instants, so a booking approved in March for August needs no scheduled job
-- in between. That is the whole reason this feature needs no cron.
--
-- Column notes:
--   profiles.auto_reply_opt_out
--                      Per-person refusal. The integration is on for the team
--                      once an admin connects it, because an opt-in default
--                      would leave exactly the mailboxes that matter silent.
--                      Writing an auto-reply into somebody personal mailbox is
--                      still intrusive enough that it must be refusable, so
--                      this column is the one thing an employee can set here.
--
--   auto_reply_state   What the app last wrote into a given mailbox, so it can
--                      tell its own responder from one the person set by hand.
--                      Without it, clearing on cancellation would happily wipe
--                      a responder somebody switched on for their own reasons.
--                      It also makes a re-sync that changes nothing free: a
--                      matching fingerprint skips the API call entirely.
--
--   auto_reply_state.error
--                      Last failure for this mailbox, kept rather than logged
--                      and forgotten. A delegation that was never authorised
--                      fails per-mailbox and silently, so the Integrations
--                      card reads this column to say which people are not
--                      actually covered.
--
-- No apostrophes in these comments, on purpose. The Supabase SQL editor splits
-- statements client-side and reads a lone apostrophe as opening a string
-- literal, which turns a harmless comment into a syntax error on paste.
--
-- Run this in the Supabase SQL editor (after 013).
-- =====================================================================

alter table public.profiles
  add column if not exists auto_reply_opt_out boolean not null default false;

create table if not exists public.auto_reply_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  -- The leave this responder belongs to. Null once the responder is cleared,
  -- which is how a row survives as a record of "we turned it off" rather than
  -- being deleted and losing the last error with it.
  leave_request_id uuid references public.leave_requests(id) on delete set null,
  enabled boolean not null default false,
  start_time timestamptz,
  end_time timestamptz,
  -- Digest of the subject and body last written. Comparing this is what makes
  -- a no-op sync free, and what proves the responder in the mailbox is still
  -- the one the app put there.
  fingerprint text,
  synced_at timestamptz,
  error text
);

create index if not exists auto_reply_state_leave_idx
  on public.auto_reply_state (leave_request_id);

alter table public.auto_reply_state enable row level security;

-- No policies, on purpose, matching integration_settings and slack_daily_posts.
-- Every read and write goes through the service-role client on the server,
-- behind a route that has already established who the caller is. The browser
-- never queries this table with the anon key.

-- The service, off until an admin connects it. Inserted here so the
-- Integrations page has a row to read on day one.
insert into public.integration_settings (id, connected, config)
values ('gmail', false, '{}'::jsonb)
on conflict (id) do nothing;
