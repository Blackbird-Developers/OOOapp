-- =====================================================================
-- Approve and reject leave from inside Slack.
--
-- When somebody requests leave, each admin gets a direct message from the
-- Slack app with Approve and Reject buttons, the same request they are
-- already emailed. Pressing a button decides the request exactly as the
-- Requests page does.
--
-- Column notes on integration_settings:
--   approvals_enabled  Whether new requests are sent to admins in Slack.
--                      Separate from connected, which is the daily digest:
--                      a company can want one without the other.
--   signing_secret     The Slack app signing secret. Slack signs every button
--                      press with it, and a press that does not verify is
--                      ignored, so nobody can approve leave by posting to the
--                      endpoint directly. A secret, so it is treated exactly
--                      like bot_token: write-only from the browser.
--
-- slack_approval_messages remembers every direct message sent for a request,
-- one per admin. It serves two purposes:
--   1. It is how a button press is tied to an admin. Slack says which Slack
--      user pressed it; this table says which admin that message went to.
--   2. Once anybody decides the request, in Slack or on the website, every
--      copy is rewritten to say so, and the buttons disappear. Without it
--      the other admins would be left looking at buttons that no longer work.
--
-- No apostrophes in these comments, on purpose. The Supabase SQL editor splits
-- statements client-side and reads a lone apostrophe as opening a string
-- literal, which turns a harmless comment into a syntax error on paste.
--
-- Run this in the Supabase SQL editor (after 016).
-- =====================================================================

alter table public.integration_settings
  add column approvals_enabled boolean not null default false,
  add column signing_secret text;

-- A surrogate key, with the real rule as a unique constraint. A primary key of
-- (leave_request_id, admin_id) would make PostgREST read this as a join table
-- between leave_requests and profiles, which adds a relationship between them
-- and risks the same "more than one relationship was found" failure that
-- migration 016 had to undo.
create table public.slack_approval_messages (
  id bigint generated always as identity primary key,
  leave_request_id uuid not null references public.leave_requests(id) on delete cascade,
  admin_id uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slack_user_id text not null,
  -- The direct message channel (D...) Slack opened for this admin. chat.update
  -- needs the channel and timestamp together to find the message again.
  channel text not null,
  ts text not null,
  created_at timestamptz not null default now(),
  unique (leave_request_id, admin_id)
);

create index slack_approval_messages_slack_user
  on public.slack_approval_messages (leave_request_id, slack_user_id);

alter table public.slack_approval_messages enable row level security;

-- No policies, by design, exactly as in integration_settings. Only the server
-- touches this table, through the service-role client.
