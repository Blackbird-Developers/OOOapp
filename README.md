# BBM Leave

Internal leave / sick-day tracker for Blackbird Marketing.

- Employees: see remaining annual + sick balance, request leave, view history
- Admins: approve/reject, log leave on behalf, see a team calendar, manage employees, public holidays, and invites
- Half-days supported (0.5)
- Working-day counts automatically exclude weekends and admin-managed public holidays
- Balances reset every Jan 1
- Email notifications on every state change (Resend)
- Optional daily Slack digest of who's out of office today (section 7)

**Stack:** Next.js 15 · TypeScript · Tailwind · Supabase (Postgres + Auth + RLS) · Resend · Slack · Vercel

---

## 1. Prerequisites — accounts you need

| Service  | What it does            | Sign up                                           |
| -------- | ----------------------- | ------------------------------------------------- |
| Supabase | Database + auth         | https://supabase.com (free tier is enough)        |
| Resend   | Transactional email     | https://resend.com (free 100 emails/day)          |
| Vercel   | App hosting             | https://vercel.com (free hobby plan)              |
| GitHub   | Source control + deploy | https://github.com                                |

---

## 2. Set up Supabase

1. Create a new project. Pick the **EU West (Dublin)** region for GDPR.
2. Save your **DB password** somewhere safe (you won't need it day-to-day, but you'll be locked out without it).
3. In the dashboard → **Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key (click to reveal) → `SUPABASE_SERVICE_ROLE_KEY`
4. **Settings → Authentication → Providers**: leave only **Email** enabled. Turn **Confirm email** OFF (we use invites, not self-signup).
5. **SQL Editor → New query**: paste the contents of `supabase/migrations/001_init.sql`, run it. Then do the same with `002_seed_admin.sql`.

The schema includes a trigger that auto-promotes `tech@blackbird.marketing` to admin whenever that profile is created.

---

## 3. Set up Resend

1. Sign up at resend.com.
2. **Domains → Add Domain**: `blackbird.marketing`. Follow Resend's instructions to add the DNS records (SPF, DKIM, optionally DMARC) in your domain registrar.
3. Wait until the domain shows **Verified** (usually 5–30 minutes).
4. **API Keys → Create API Key** (full access) → copy → save as `RESEND_API_KEY`.
5. Set `RESEND_FROM` to `BBM Leave <leave@blackbird.marketing>` (or any address at your verified domain).

> If you want to test before verifying the domain, you can temporarily set `RESEND_FROM="BBM Leave <onboarding@resend.dev>"` — Resend's shared sender, limited to your own email.

---

## 4. Run locally

```bash
cp .env.local.example .env.local
# fill in real values from steps 2 and 3
npm install
npm run dev
```

Open http://localhost:3000.

### First login

Since signup is invite-only, you need to bootstrap the first admin manually:

1. In Supabase **Authentication → Users → Add user → Create new user**.
   - Email: `tech@blackbird.marketing`
   - Password: pick one
   - **Auto Confirm User**: ON
2. The DB trigger creates a `profiles` row and the seed-admin trigger sets `role = admin`.
3. Sign in at `/login` with that email/password.

From here you can use **Invites** in the admin nav to invite everyone else.

---

## 5. Deploy to Vercel

1. Push this folder to a new GitHub repo.
2. Vercel → **Add New… → Project** → import the repo.
3. Framework: Next.js (auto-detected). Build command and output: defaults.
4. **Environment Variables** — copy each value from your `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY`
   - `RESEND_FROM`
   - `NEXT_PUBLIC_SITE_URL` — set this to your Vercel URL (e.g. `https://leave.blackbird.marketing` once you add the custom domain)
   - `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID`, `CRON_SECRET` — only if you want the daily Slack digest (section 7)
5. Deploy.
6. Add a custom domain (e.g. `leave.blackbird.marketing`) in Vercel → Settings → Domains, and update `NEXT_PUBLIC_SITE_URL` to match.

---

## 6. Linking from WordPress

Just add a menu item or a button somewhere on the WordPress site that links to `https://leave.blackbird.marketing`. Employees sign in there. No plugin or SSO bridge needed.

---

## 7. Slack daily out-of-office digest

Posts one message each weekday at **09:00 Kosovo time** (`Europe/Belgrade` — CET/CEST) into a channel of your choice, listing who's off that day. It reads the same approved-leave data as the Who's off calendar, so the two can't drift.

It stays **silent when nobody is off** — a channel that only speaks when it has something to say is a channel people don't mute.

This whole section is optional. Leave `SLACK_BOT_TOKEN` unset and the app behaves exactly as before.

### 7.1 Create the Slack app

1. Go to <https://api.slack.com/apps> → **Create New App** → **From scratch**.
2. Name it **Blackbird Leave**, pick your workspace.
3. **OAuth & Permissions** → *Scopes* → *Bot Token Scopes* → **Add an OAuth Scope** → add **`chat:write`**. That's the only scope it needs.
4. Scroll up → **Install to Workspace** → Allow.
5. Copy the **Bot User OAuth Token** (starts with `xoxb-`) → this is `SLACK_BOT_TOKEN`.

### 7.2 Create the channel and lock it down

1. In Slack, create a public channel — e.g. **#out-of-office**.
2. Invite the bot: type `/invite @Blackbird Leave` **in that channel**. If you skip this the post fails with *"not_in_channel"*.
3. Invite everyone else (channel name → **Members** → **Add people**).
4. **Make it announcement-only** so only the app can post: click the channel name → **Settings** tab → **Manage posting permissions** → choose *Only specific people can post*, and make sure **Blackbird Leave** is in the allowed list. Add yourself too if you ever want to post a correction by hand.
5. Get the channel ID: click the channel name → **About** tab → scroll to the bottom → **Channel ID**, looks like `C0123456789`. That's `SLACK_CHANNEL_ID` (the ID, not the `#name`).

### 7.3 Environment variables

Add these in **Vercel → Settings → Environment Variables** (and to `.env.local` if you want to test locally):

| Variable | Value |
| -------- | ----- |
| `SLACK_BOT_TOKEN` | the `xoxb-…` token from 7.1 |
| `SLACK_CHANNEL_ID` | the `C…` ID from 7.2 |
| `SLACK_DAILY_POST_HOUR` | optional, `0`–`23` Kosovo time. Defaults to `9` |
| `CRON_SECRET` | any long random string — generate with `openssl rand -hex 32` |

`CRON_SECRET` is what stops a stranger who guesses the URL from making the bot post. Vercel sends it automatically with every scheduled trigger. **In production the endpoint refuses to run if it isn't set — the 09:00 post simply never happens, and the only trace is a `CRON_SECRET is not configured` line in the function logs.** If the digest is silent on a day when people *are* off, check this variable first.

### 7.4 Run the migration

In Supabase → **SQL Editor**, run `supabase/migrations/006_slack_daily_digest.sql`. It creates the small table that stops the same day being posted twice.

### 7.5 Verify it works

Deploy, then go to **/admin/whos-off** and click **Post to Slack now**. It posts today's digest immediately — no waiting for 09:00, and it posts even on a quiet day so you get proof the wiring is right. Any failure shows the actual reason (bot not in channel, bad token, missing scope) rather than a generic error.

### 7.6 Muting it

Slack handles this natively, per person — nobody needs an admin to do it for them:

> Right-click the channel in the sidebar → **Mute channel**.

A muted channel stops making noise and drops out of the unread bolding, but the messages are still there when someone wants to look. Muting is per-person and affects nobody else.

### How the schedule actually works

Vercel Cron runs in UTC and Kosovo changes offset twice a year, so `vercel.json` schedules the endpoint at **both 07:00 and 08:00 UTC**, Monday–Friday. In summer (CEST, UTC+2) the 07:00 run is the one that lands on 09:00 local; in winter (CET, UTC+1) it's the 08:00 run. Whichever run first finds the Kosovo clock at or past the target hour does the post; the `slack_daily_posts` table makes every later run that day a no-op. That covers both offsets without a timezone library, and it survives Vercel firing a cron late.

> **Note:** Vercel Cron only runs on **Production** deployments, and the Hobby plan allows a maximum of two cron jobs — which is exactly what this uses.

### Privacy

The digest deliberately **never says why** someone is off. Everyone reads as simply out of office, whether the underlying request is annual or sick. Sick leave is health data and this channel is company-wide — the leave type stays in the app, visible to admins on the Who's off page. Half-days are shown (*morning only* / *afternoon only*) because that's scheduling information, not medical information.

---

## Project layout

```
app/
  login/                 sign-in page
  invite/[token]/        invited user sets password
  dashboard/             employee dashboard (balance + request form + history)
  admin/                 admin dashboard (calendar + pending)
    requests/            full request list
    employees/           employee list + allowance editor
    invites/             send invites
    holidays/            CRUD public holidays
    leave/new/           log leave on behalf
    whos-off/            team calendar + "Post to Slack now"
  api/                   route handlers (leave, invites, holidays, etc.)
    cron/slack-daily/    daily Slack digest, triggered by Vercel Cron
    slack/test/          admin-only "post the digest right now"
lib/
  supabase/              browser / server / admin (service-role) clients
  auth.ts                requireUser / requireAdmin helpers
  days.ts                working-day calculator (weekends + holidays + half-days)
  balances.ts            year-to-date used/pending/remaining
  email.ts               Resend wrapper + email templates
  slack.ts               Slack wrapper + digest message builder
  whos-off.ts            who's on approved leave on a given date
components/              shared UI (TopBar, LeaveCalendar, StatusBadge)
middleware.ts            redirects unauthenticated users to /login
vercel.json              cron schedule for the Slack digest
supabase/migrations/     001_init.sql … 006_slack_daily_digest.sql
```

---

## Operational notes

- **Annual reset (Jan 1)**: balances are computed on the fly from `leave_requests` rows whose `start_date` falls in the current calendar year. There is no cron job — Jan 1 "just works." Old requests stay in the table for history.
- **Allowances**: per-employee allowances live on `profiles.annual_allowance` / `sick_allowance`. Admins can edit per-person from the Employees page.
- **Cancellations**: only admins can cancel pending or approved requests (per spec). Cancellation emails the employee.
- **Half-days**: pick `Morning only` or `Afternoon only` on the first and/or last day of a range. Single-day requests with a half flag count as 0.5.
- **Holidays**: admin-managed in `/admin/holidays`. Add the year's Irish public holidays each year (or as needed). Anything in this table is excluded from working-day counts.
- **Slack digest**: weekdays at 09:00 Kosovo time, silent when nobody is off, and it never names the leave type (see section 7). If a post fails, the day's claim in `slack_daily_posts` is released so the second cron run — or a manual **Post to Slack now** — can retry.
- **Security**: all DB access goes through Postgres Row-Level Security. The service-role key is only used in server-side route handlers (never exposed to the browser) for operations that need to bypass RLS (creating auth users, invite lookup, etc.).
