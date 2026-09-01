-- =====================================================================
-- Integration settings, editable from /admin/integrations.
--
-- One row per service. Until now the Slack digest was configured entirely
-- through environment variables, which meant a redeploy to change the channel
-- and no way to switch it off from inside the app. This row is authoritative:
-- the environment is only consulted for a service that has never been saved
-- here, so an existing deployment keeps working untouched until an admin
-- presses Connect or Save.
--
-- Column notes:
--   connected          Whether the service should actually run. Distinct from
--                      having credentials: disconnecting keeps the row so the
--                      environment cannot quietly re-enable the digest behind
--                      the back of the admin who turned it off.
--   bot_token          The credential. Never sent to the browser: the API
--                      reports only whether a token is on file, and the token
--                      field in the editor is write-only.
--   weekdays_only      Delivery rules the cron reads before it posts.
--   silent_when_empty
--   share_half_days    What the digest may say about a person. The leave TYPE
--                      is deliberately absent: sick leave is health data and
--                      the digest never names it, so that stays a property of
--                      the message builder rather than a switch an admin can
--                      flip from a web form.
--
-- No apostrophes in these comments, on purpose. The Supabase SQL editor splits
-- statements client-side and reads a lone apostrophe as opening a string
-- literal, which turns a harmless comment into a syntax error on paste.
--
-- Run this in the Supabase SQL editor (after 008).
-- =====================================================================

create table public.integration_settings (
  id text primary key,
  connected boolean not null default false,
  bot_token text,
  channel_id text,
  post_hour smallint not null default 6 check (post_hour between 0 and 23),
  weekdays_only boolean not null default true,
  silent_when_empty boolean not null default true,
  share_half_days boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

alter table public.integration_settings enable row level security;

-- No policies, by design, exactly as in slack_daily_posts. This table holds a
-- bot token, so it is reachable only through the service-role client on the
-- server, never with the anon key the browser holds.
