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
   - `CRON_SECRET` — only if you want the daily Slack digest (section 7). The Slack token and channel are set from inside the app, not here.
5. Deploy.
6. Add a custom domain (e.g. `leave.blackbird.marketing`) in Vercel → Settings → Domains, and update `NEXT_PUBLIC_SITE_URL` to match.

---

## 6. Linking from WordPress

Just add a menu item or a button somewhere on the WordPress site that links to `https://leave.blackbird.marketing`. Employees sign in there. No plugin or SSO bridge needed.

---

## 7. Slack daily out-of-office digest

Posts one message each weekday at **06:00 Kosovo time** (`Europe/Belgrade` — CET/CEST) into a channel of your choice, listing who's off that day. It reads the same approved-leave data as the Who's off calendar, so the two can't drift. The channel, the weekday rule, the quiet-day rule and whether half-days are named are all editable on the Integrations page — 06:00 on weekdays is just the default. The hour is editable too, within the band the cron schedule can reach — see *Why the post hour has limited choices* below.

It stays **silent when nobody is off** — a channel that only speaks when it has something to say is a channel people don't mute.

This whole section is optional. Never press **Connect** and the app behaves exactly as before.

### 7.1 Create the Slack app

1. Go to <https://api.slack.com/apps> → **Create New App** → **From scratch**.
2. Name it **Blackbird Leave**, pick your workspace.
3. **OAuth & Permissions** → *Scopes* → *Bot Token Scopes* → **Add an OAuth Scope** → add **`chat:write`**. That's the only scope it needs.
4. Scroll up → **Install to Workspace** → Allow.
5. Copy the **Bot User OAuth Token** (starts with `xoxb-`). You'll paste it into the app in 7.3.

### 7.2 Create the channel and lock it down

1. In Slack, create a public channel — e.g. **#out-of-office**.
2. Invite the bot: type `/invite @Blackbird Leave` **in that channel**. If you skip this the post fails with *"not_in_channel"*.
3. Invite everyone else (channel name → **Members** → **Add people**).
4. **Make it announcement-only** so only the app can post: click the channel name → **Settings** tab → **Manage posting permissions** → choose *Only specific people can post*, and make sure **Blackbird Leave** is in the allowed list. Add yourself too if you ever want to post a correction by hand.
5. Get the channel ID: click the channel name → **About** tab → scroll to the bottom → **Channel ID**, looks like `C0123456789`. It's the ID you need, not the `#name`.

### 7.3 Connect it in the app

Deploy, then sign in as an admin and open **Integrations** (`/admin/integrations`):

1. Paste the **bot token** from 7.1 and the **channel ID** from 7.2.
2. Press **Connect**. The token is checked against Slack's `auth.test` before it is stored, so a bad paste fails there and then instead of silently at 06:00.

Everything on the card is editable afterwards — channel, post hour, weekdays-only, whether to stay quiet on days nobody is off, and whether half-days are named. **Disconnect** stops the digest and deletes the stored token.

Those settings live in the `integration_settings` table, so changing the channel no longer needs a redeploy. The table has RLS enabled and no policies: only the server's service-role client can read it, and no endpoint ever hands the token back to the browser — not even masked. Rotating a token means pasting the new one, never reading the old one.

#### Environment variables

Only one is still required for the digest:

| Variable | Value |
| -------- | ----- |
| `CRON_SECRET` | any long random string — generate with `openssl rand -hex 32` |

`CRON_SECRET` is what stops a stranger who guesses the URL from making the bot post. Vercel sends it automatically with every scheduled trigger. **In production the endpoint refuses to run if it isn't set — the 06:00 post simply never happens, and the only trace is a `CRON_SECRET is not configured` line in the function logs.** If the digest is silent on a day when people *are* off, check this variable first.

`SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID` and `SLACK_DAILY_POST_HOUR` still work, but only as a bootstrap: they are read when no settings row exists yet, which is what keeps an existing deployment posting after this upgrade without anyone touching it. The moment an admin presses **Connect** or **Save changes**, the row takes over and those variables are ignored — including by **Disconnect**, which is what makes switching the digest off from the UI actually stick.

### 7.4 Run the migrations

In Supabase → **SQL Editor**, run both:

- `supabase/migrations/006_slack_daily_digest.sql` — the small table that stops the same day being posted twice.
- `supabase/migrations/009_integration_settings.sql` — where the connection and its settings are stored.

Skip 009 and the card still renders from the environment, but **Connect**, **Save changes** and **Disconnect** all fail with a message telling you to run it.

### 7.5 Verify it works

Deploy, then go to **Integrations** in the admin nav (`/admin/integrations`) and click **Post to Slack now**. The same button is also on **/admin/whos-off**. It posts today's digest immediately — no waiting for 06:00, and it posts even on a quiet day so you get proof the wiring is right. Any failure shows the actual reason (bot not in channel, bad token, missing scope) rather than a generic error.

### 7.6 Checking it from the app

**Integrations** (`/admin/integrations`) lists every service Blackbird Leave connects to and whether it is currently wired up. Slack shows its channel ID, the hour it posts, its schedule rules and what it shares — and **Edit** makes each of those changeable in place. When it isn't connected the card says *not connected* and shows the setup steps with the connect form underneath.

The leave **type** is deliberately not among the editable settings. The digest lands in a channel the whole company can see and sick leave is health data, so everyone reads as simply "out" — there is no toggle for that anywhere in the UI or the API.

The tab is admin-only: it is under `/admin`, whose layout calls `requireAdmin()`, the page asserts it again, and the nav link only renders for admins. Employees who type the URL are redirected to their dashboard.

Connecting still happens with environment variables in Vercel, not from the page. Adding a service later means writing one builder in `lib/integrations.ts` and listing it in `listIntegrations()`; the page renders whatever the registry returns.

### 7.7 Muting it

Slack handles this natively, per person — nobody needs an admin to do it for them:

> Right-click the channel in the sidebar → **Mute channel**.

A muted channel stops making noise and drops out of the unread bolding, but the messages are still there when someone wants to look. Muting is per-person and affects nobody else.

### How the schedule actually works

`vercel.json` triggers the endpoint at **04:00 and 05:00 UTC, every day**. Two runs a day is the Vercel Hobby ceiling — that plan allows two cron jobs and fires each at most once daily.

Vercel Cron runs in UTC and Kosovo changes offset twice a year, so those slots land at 05:00/06:00 local in winter (CET, UTC+1) and 06:00/07:00 in summer (CEST, UTC+2). The endpoint compares against the *local* clock rather than assuming an offset, which covers both without a timezone library and survives Vercel firing a cron late.

The schedule deliberately runs **every day**, not `Mon–Fri`. The weekday rule is a setting now, so it belongs in code where an admin can switch it off — a schedule that skipped weekends would make that setting a lie. Same for the quiet-day rule: the runs that fall outside your settings cost one cheap skip each.

One message a day is enforced two ways: `slack_daily_posts` (the first run to post claims the date, every later run that day is a no-op) and a three-hour window starting at your chosen hour, so a leave request logged in the afternoon can't trigger an afternoon "out of office today".

### Why the post hour has limited choices

Two scheduled runs a day means only a narrow band of local hours can ever be reached — with the slots above, **04:00, 05:00 and 06:00**. The dropdown offers exactly those and the API rejects anything else, because an unreachable hour isn't a preference, it's the digest silently stopping.

`lib/slack-schedule.ts` is the single place that knows the schedule; `CRON_UTC_HOURS` there must mirror `vercel.json`. To unlock all 24 hours on a **Pro** plan, set the cron to `"0 * * * *"` and `CRON_UTC_HOURS` to every hour — the dropdown widens on its own, with no other change anywhere.

> **Note:** Vercel Cron only runs on **Production** deployments.

### Privacy

The digest deliberately **never says why** someone is off. Everyone reads as simply out of office, whether the underlying request is annual or sick. Sick leave is health data and this channel is company-wide — the leave type stays in the app, visible to admins on the Who's off page. Half-days are shown (*morning only* / *afternoon only*) because that's scheduling information, not medical information.

---

## 8. Hierarchy — group availability rule

Admins can group people who cover for each other (e.g. everyone holding one core role). **At least one member of each group must always be available**: a member's **annual** leave is blocked if, on any working day of the requested range, everyone else in the group is already on approved or pending annual leave — i.e. the requester would be the last person out. In a 3-person group, two can be off together; only the third is blocked for those days. A 2-person group therefore can never overlap at all. Weekends and public holidays are skipped, and sick leave is never counted or blocked.

1. Run `supabase/migrations/007_conflict_groups.sql` in the Supabase SQL editor.
2. Go to **Admin → Hierarchy**, create a group, add members. A person can be in several groups.

How it's enforced (all server-side, in the API routes):

- **Requesting** annual leave that would empty a group on some day is blocked with a message naming the day, the group, and who's already off.
- **Editing** a request re-runs the same check against the new dates.
- **Approving** re-checks as a safety net (covers races and admin overrides) — the approve button explains the clash instead of approving.
- Admins logging leave on behalf hit the same block, with a **Log anyway** button that forces it through (`override_conflicts: true` in the API).

Until migration 007 is run the check quietly passes (fails open), so deploying the code first is safe.

---

## 9. Settings — annual leave notice period

Admins can require that annual leave be requested a minimum number of calendar days in advance (**Admin → Settings**): 3 days, 1–3 weeks, or a month. Employees who try to book closer in are blocked with the earliest allowed start date. Admins are exempt (they can always log or backfill leave), sick leave is never restricted, and editing a request to *different dates* re-applies the rule while same-date edits (e.g. changing the reason) don't.

1. Run `supabase/migrations/008_app_settings.sql` in the Supabase SQL editor.
2. Go to **Admin → Settings**, pick a notice period, save. It applies to new requests immediately.

Settings live in the `app_settings` key-value table (`annual_min_notice_days`). Until migration 008 is run the rule is off and saving from the Settings page reports that the migration is missing — deploying the code first is safe.

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
    integrations/slack/  connect / edit / disconnect Slack
lib/
  supabase/              browser / server / admin (service-role) clients
  auth.ts                requireUser / requireAdmin helpers
  days.ts                working-day calculator (weekends + holidays + half-days)
  balances.ts            year-to-date used/pending/remaining
  email.ts               Resend wrapper + email templates
  slack.ts               Slack wrapper + digest message builder
  slack-settings.ts      where the Slack connection is stored and resolved
  whos-off.ts            who's on approved leave on a given date
components/              shared UI (TopBar, LeaveCalendar, StatusBadge)
middleware.ts            redirects unauthenticated users to /login
vercel.json              cron schedule for the Slack digest
supabase/migrations/     001_init.sql … 009_integration_settings.sql
```

---

## Operational notes

- **Annual reset (Jan 1)**: balances are computed on the fly from `leave_requests` rows whose `start_date` falls in the current calendar year. There is no cron job — Jan 1 "just works." Old requests stay in the table for history.
- **Allowances**: per-employee allowances live on `profiles.annual_allowance` / `sick_allowance`. Admins can edit per-person from the Employees page.
- **Cancellations**: only admins can cancel pending or approved requests (per spec). Cancellation emails the employee.
- **Half-days**: pick `Morning only` or `Afternoon only` on the first and/or last day of a range. Single-day requests with a half flag count as 0.5.
- **Integrations**: `/admin/integrations` (admin-only) shows what Blackbird Leave is connected to, and lets an admin connect it, edit its settings, fire a digest on demand, or disconnect it. The registry lives in `lib/integrations.ts`; the stored connection in `lib/slack-settings.ts`.
- **Holidays**: admin-managed in `/admin/holidays`. Add the year's Irish public holidays each year (or as needed). Anything in this table is excluded from working-day counts.
- **Slack digest**: by default weekdays at 06:00 Kosovo time and silent when nobody is off — all editable on the Integrations page, except that the post hour is limited to what the cron schedule can reach (04:00–06:00 on the current two Hobby slots; see section 7). It never names the leave type, and that one isn't editable at all. If a post fails, the day's claim in `slack_daily_posts` is released so the second run — or a manual **Post to Slack now** — can retry.
- **Security**: all DB access goes through Postgres Row-Level Security. The service-role key is only used in server-side route handlers (never exposed to the browser) for operations that need to bypass RLS (creating auth users, invite lookup, etc.).
