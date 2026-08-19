-- =====================================================================
-- Slack daily out-of-office digest.
-- One row per day on which the bot actually posted to Slack.
--
-- The cron endpoint is scheduled twice (see vercel.json) so that 09:00 Kosovo
-- time is hit in both CET and CEST. This table is what stops the second run
-- — or a manual retry, or a Vercel redelivery — from posting a duplicate:
-- post_date is the primary key, so the insert that claims the day fails for
-- everyone after the first.
-- =====================================================================

create table public.slack_daily_posts (
  post_date date primary key,
  channel text not null,
  people_count integer not null default 0,
  posted_at timestamptz not null default now()
);

alter table public.slack_daily_posts enable row level security;

-- No policies, by design. Only the cron route touches this table and it uses
-- the service role, which bypasses RLS. Leaving it locked means the digest
-- history can't be read or forged with the anon key.
