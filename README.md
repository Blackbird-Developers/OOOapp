# BBM Leave

Internal leave / sick-day tracker for Blackbird Marketing.

- Employees: see remaining balances, request annual, sick or any other leave type their policy allows, view history
- Admins: approve/reject, log leave on behalf, see a team calendar, manage employees, public holidays, and invites
- Half-days supported (0.5)
- Working-day counts automatically exclude weekends and the public holidays of each person's own holiday calendar (one per country)
- Leave policy templates per country or company: yearly allowances, seniority, first-year leave, carry-over and custom leave types (section 11)
- Balances reset every Jan 1, less anything carried over
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

From here you can use **People → Invites** in the admin nav to invite everyone else.

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

Deploy, then sign in as an admin and open **Workspace → Integrations** (`/admin/integrations`):

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

Deploy, then go to **Workspace → Integrations** in the admin nav (`/admin/integrations`) and click **Post to Slack now**. The same button is also on **/admin/whos-off**. It posts today's digest immediately — no waiting for 06:00, and it posts even on a quiet day so you get proof the wiring is right. Any failure shows the actual reason (bot not in channel, bad token, missing scope) rather than a generic error.

### 7.6 Checking it from the app

**Integrations** (`/admin/integrations`) lists every service Blackbird Leave connects to and whether it is currently wired up. Slack shows its channel ID, the hour it posts, its schedule rules and what it shares — and **Edit** makes each of those changeable in place. When it isn't connected the card says *not connected* and shows the setup steps with the connect form underneath.

The leave **type** is deliberately not among the editable settings. The digest lands in a channel the whole company can see and sick leave is health data, so everyone reads as simply "out" — there is no toggle for that anywhere in the UI or the API.

The tab is admin-only: it is under `/admin`, whose layout calls `requireAdmin()`, the page asserts it again, and the nav link only renders for admins. Employees who type the URL are redirected to their dashboard.

Connecting still happens with environment variables in Vercel, not from the page. Adding a service later means writing one builder in `lib/integrations.ts` and listing it in `listIntegrations()`; the page renders whatever the registry returns.

### 7.7 Muting it

Slack handles this natively, per person — nobody needs an admin to do it for them:

> Right-click the channel in the sidebar → **Mute channel**.

A muted channel stops making noise and drops out of the unread bolding, but the messages are still there when someone wants to look. Muting is per-person and affects nobody else.

### 7.8 Approving leave from Slack

Optional, and off until an admin switches it on. When it's on, every new leave request is sent to each admin as a **direct message** from the Blackbird Leave app with **Approve** and **Reject** buttons — the Slack twin of the "new request" email, which still goes out as before.

- **Approve** decides it on the spot. **Reject** opens a small form for an optional note to the employee, the same as on the Requests page.
- Either way the decision goes through exactly the same code as the website (`lib/leave-decision.ts`): the employee is emailed, the day lands in (or stays out of) their calendar, their Gmail auto-reply is updated, and the Hierarchy rule still blocks clashing annual leave.
- Once anyone decides — in Slack or on the website — every admin's copy is rewritten to say who decided it and when, and the buttons disappear. Cancelling or editing a request updates the copies too.
- DMs rather than the digest channel on purpose: these messages name the leave type, and sick leave is health data.

**Setup, once:**

1. In the Slack app (<https://api.slack.com/apps>) → **OAuth & Permissions** → add the **`users:read`** and **`users:read.email`** bot scopes, then **Reinstall to Workspace**. Admins are matched to Slack by email, so each admin's Blackbird Leave email must be the one on their Slack account. An admin without a match is simply skipped in Slack and still gets the email.
2. **Interactivity & Shortcuts** → switch **Interactivity** on → set the **Request URL** to `https://<your site>/api/slack/interactions` → Save.
3. **App Home** → make sure the **Messages Tab** is enabled, so the DMs have somewhere to appear.
4. **Basic Information** → **App Credentials** → copy the **Signing Secret**.
5. Run `supabase/migrations/017_slack_leave_approvals.sql` in the Supabase SQL editor (after 016). Until it's run the toggle is replaced with a note asking for it; the digest keeps working either way.
6. In Blackbird Leave → **Integrations** → Slack → **Edit** → tick *Send new leave requests to admins in Slack*, paste the signing secret, **Save changes**. Saving checks the scopes by looking you up by email, so a missing scope fails there and then.

**Security.** `/api/slack/interactions` is public (Slack holds no session), so every press is checked against Slack's request signature using the company's signing secret, and refused if it doesn't verify or is more than five minutes old. A verified press then has to come from the Slack account the DM was sent to, and that person must still be an admin of the same company. The signing secret is stored like the bot token — write-only from the browser. `SLACK_SIGNING_SECRET` in the environment works as a bootstrap for Blackbird's own workspace, like the other `SLACK_*` variables.

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
2. Go to **People → Hierarchy**, create a group, add members. A person can be in several groups.

How it's enforced (all server-side, in the API routes):

- **Requesting** annual leave that would empty a group on some day is blocked with a message naming the day, the group, and who's already off.
- **Editing** a request re-runs the same check against the new dates.
- **Approving** re-checks as a safety net (covers races and admin overrides) — the approve button explains the clash instead of approving.
- Admins logging leave on behalf hit the same block, with a **Log anyway** button that forces it through (`override_conflicts: true` in the API).

Until migration 007 is run the check quietly passes (fails open), so deploying the code first is safe.

---

## 9. Settings — annual leave notice period

Admins can require that annual leave be requested a minimum number of calendar days in advance (**Workspace → Settings**): 3 days, 1–3 weeks, or a month. Employees who try to book closer in are blocked with the earliest allowed start date. Admins are exempt (they can always log or backfill leave), sick leave is never restricted, and editing a request to *different dates* re-applies the rule while same-date edits (e.g. changing the reason) don't.

1. Run `supabase/migrations/008_app_settings.sql` in the Supabase SQL editor.
2. Go to **Workspace → Settings**, pick a notice period, save. It applies to new requests immediately.

Settings live in the `app_settings` key-value table (`annual_min_notice_days`). Until migration 008 is run the rule is off and saving from the Settings page reports that the migration is missing — deploying the code first is safe.

---

## 10. Calendar — approved leave in everyone's own calendar

When leave is approved, the employee gets a calendar entry marking them out of office, in whichever calendar they already use: **Google Calendar, Apple Calendar, Outlook, or Teams**. It blocks their availability, so colleagues stop booking meetings over their days off.

### 10.1 Turning it on

1. Run `supabase/migrations/010_calendar_integration.sql`, `011_calendar_event_generation.sql` and `012_calendar_feed_mirror.sql` in the Supabase SQL editor.
2. Set `NEXT_PUBLIC_SITE_URL` to the deployment's real address. Subscription links are built from it, so on a deploy where it still says `localhost` every link handed out is dead — the Integrations card warns when it spots this.
3. Go to **Workspace → Integrations → Calendar** and press **Connect**.

That is the whole setup. There is no Google Cloud project, no Azure app registration, no OAuth consent screen and no per-user sign-in, because the integration does not call any vendor's API — see 10.4 for why that turned out to be the better design rather than a compromise.

It applies to leave approved from then on. Bookings already approved are not back-filled; the people affected can pick them up from the subscription link below.

### 10.2 The two ways an entry arrives

Both are on by default, and either can be switched off under **Edit** on the card. They fail in opposite directions, which is the reason for having both.

**A calendar invitation, on approval.** The approval email the employee already receives carries the event as an iCalendar part. Google, Outlook, Teams and Apple Mail all recognise it and file the event themselves. This is the fast path — the entry appears within seconds — but it is one-shot: if the mail is deleted before the client processes it, nothing lands.

Those emails go out over **SMTP** rather than Resend's HTTP API, and the reason is Outlook. Apple Mail and Gmail will act on a `text/calendar` *file attachment*; Outlook will not. Outlook only auto-processes an invitation or cancellation when the calendar document is an **alternative body part** of the message carrying `method=REQUEST` or `method=CANCEL` in its own `Content-Type`. Delivered as an attachment it is a file called `invite.ics` that somebody has to notice and open, which nobody does — so Outlook users were only ever being served by the subscription feed, and wondered why their leave took hours to appear.

Resend's send API accepts `attachments` and nothing else, so that structure cannot be expressed through it. Resend also speaks SMTP, where it can, so `lib/email-calendar-transport.ts` sends the three calendar-bearing emails through Nodemailer over `smtp.resend.com` — same provider, same `RESEND_API_KEY`, same verified sender, no new configuration. The `.ics` is still attached by name as well as inlined, so nothing is taken away from the clients that were already working. If SMTP fails for any reason the send falls back to the HTTP API, which is exactly where this stood before: a worse calendar experience, never a missing approval.

**A private subscription link.** Every employee has one on their **Account** page. They subscribe once and their calendar re-checks it forever, which repairs anything a missed invitation left behind. This is the slow path: Google refreshes subscribed calendars on its own schedule and can take several hours, Outlook likewise; Apple can be set to hourly.

One click covers **Apple Calendar**, **Google Calendar** and **Outlook / Teams**, from the Account page and from the emails alike. A fourth link handles personal Outlook.com accounts, which live on a different Microsoft host that cannot be detected from our side — so both are offered rather than one being guessed at. Anything else is served by the copyable address, with per-app instructions on the Account page.

Those buttons are all ordinary `https://` links back to `/api/calendar/<token>/subscribe?app=…`, which redirects to whatever the chosen app actually wants. The indirection is load-bearing: Apple needs a `webcal://` URL, and a `webcal://` href does not survive email. Gmail and most clients sanitise anchors whose scheme they do not recognise, so the button arrives as dead text — which is exactly why the Apple button used to work on the Account page and do nothing in the approval email. Keeping the vendor URL formats server-side has a second benefit: they can be corrected without reissuing emails that have already gone out.

The link is a bearer credential — anyone holding it can see when that person is off — so it is 32 random bytes, and **Create a new link** on the same page revokes the old one instantly.

### 10.3 What happens when leave changes

| Event | What the calendar does |
|---|---|
| Request approved | Entry appears |
| Request rejected | Nothing — no entry was ever created |
| Approved leave cancelled by an admin | Entry is withdrawn |
| Approved leave edited by the employee | Entry is withdrawn immediately, because the request has gone back to pending. A fresh one is sent when it is approved again |
| Pending request cancelled | Nothing |

Every one of those reaches a subscribed calendar as well as the mailbox, including the withdrawals — see *Why the feed publishes cancellations* below.

Updates work because every event carries a `UID` and a `SEQUENCE` that only ever increases (`leave_requests.ics_sequence`). A calendar replaces an existing entry only when it sees the same UID with a higher sequence, so the count has to survive redeploys — which is why it lives in the database rather than being recomputed.

The UID is stable *within one incarnation of an entry*, not for the life of the request, and the difference matters. A UID that has been cancelled is tombstoned by calendar clients: Google and Outlook both drop a later invitation carrying a UID they have already seen a cancellation for, rather than re-creating the entry. Re-using it meant the fourth row of that table quietly did not work — the withdrawal landed, and the fresh entry that should have followed re-approval never appeared.

So a second counter, `leave_requests.ics_generation`, moves forward every time an entry is withdrawn and forms part of the UID (`leave-<id>-r2@host`). Withdraw-and-return therefore describes a genuinely new event instead of trying to revive a dead one, while an ordinary in-place update keeps the UID it had. Generation 0 has no suffix on purpose: entries filed before this existed went out under that exact UID, and changing it would leave them beyond the reach of any future cancellation.

Withdrawals are *not* gated on the **invitation** switch, unlike new entries. That switch governs whether entries are created; a withdrawal is cleanup for one that already exists. Skipping it because the switch had since been turned off would leave a day off blocking somebody's calendar for leave that had been cancelled or moved, with nothing in the app to explain it.

The **sequence** is not gated on it either, and that is load-bearing rather than tidy. Advancing it is what guarantees a withdrawal out-ranks the booking it revokes, and the feed publishes at the same number the invitation would have. When it was bumped only on the invitation path, a workspace with invitations switched off left every request sitting at sequence 0 forever: the booking and its own cancellation carried the same number, so no client would ever act on the cancellation.

#### Why the feed publishes cancellations instead of dropping them

A subscribed calendar cannot be trusted to notice an absence, and the three clients disagree about it completely:

| Client | An event that stops appearing in the feed |
|---|---|
| Google Calendar | Reconciled against the document and deleted |
| Apple Calendar | Reconciled against the document and deleted |
| Outlook / Teams | **Left in place indefinitely** — the sync merges, it does not replace |

The feed used to contain approved leave and nothing else, so cancelling was expressed as an absence — the one signal Outlook does not read. Google and Apple were right within a refresh; Outlook kept the day off forever, still marking the person out of office for dates nobody had agreed to, and unsubscribing and re-subscribing was the only cure.

So the feed states it instead. Anything a calendar might be holding that is no longer true is published as a `STATUS:CANCELLED` entry under the UID it was filed as, which is the one statement all three clients act on. A withdrawn entry also flips to `TRANSP:TRANSPARENT` and `X-MICROSOFT-CDO-BUSYSTATUS:FREE`, so a client stubborn enough to keep the row on screen at least stops blocking the person's availability with it.

Because a request can be filed under more than one UID over its life — every withdrawal moves the generation on — the rule is that **exactly one UID per request may be live, and every other one is cancelled**. Cancelling a UID a client never held is a no-op everywhere; missing one it does hold is the bug, so the feed errs towards withdrawing. How far it goes depends on the status, and the three answers differ for reasons worth knowing:

| Status | What the feed publishes |
|---|---|
| `approved` | The booking at the current generation, plus withdrawals for every generation below it |
| `pending` | Withdrawals for every generation **below** the current one — never the current one itself |
| `cancelled` / `rejected` | Withdrawals for every generation **including** the current one, at one higher sequence |

The `pending` bound is the subtle one, and getting it wrong is the worst bug available here. A calendar that has seen a cancellation for a UID tombstones it and drops any later invitation carrying it. The current generation of a pending request is the UID its *next approval* will arrive under, so withdrawing it first means re-approved leave silently never comes back — the exact failure migration 011 exists to prevent, reachable all over again from the feed.

The terminal case goes one further in both directions because nothing is ever published for that request again: the current generation is the one a calendar is still holding whenever the withdrawal path did not run, and the sequence is advanced by one at render time so the withdrawal out-ranks a booking that went out at the stored number. Without that bump, a request that was published but never formally withdrawn emits a cancellation at the sequence its own `CONFIRMED` carried, which every client discards as stale.

Nothing here tests the sequence to decide whether a calendar is holding an entry. It used to, and that was a bug: leave approved during any period when the sequence was not being advanced — before invitations were switched on, or before the integration was connected — was still published by the feed, so a calendar *was* holding it. Refusing to withdraw it because the counter said zero stranded exactly that entry forever, and the same test also dropped the live booking out of the feed entirely. The status is the honest signal; the counters only order the copies.

Tombstones stay for as long as the feed's rolling window — last year onwards — because a cancellation has to survive long enough for every subscriber to poll at least once, and a laptop that was shut for a fortnight still has to hear about it.

The practical result is the one that matters: **subscribing once is permanent.** The feed is a mirror of what Blackbird Leave says, not a list of bookings, so an employee never has to re-subscribe to clear something stale.

**Disconnecting does not remove entries already in people's calendars.** New approvals stop producing them and subscription links stop resolving, but mass-cancelling every future booking across the company is not something one click should do. Existing entries have to be removed by hand.

### 10.4 Why iCalendar rather than the Google and Microsoft APIs

This looks like the place for three vendor integrations. It is not, for two reasons that are worth writing down so nobody re-litigates it later:

- **Apple publishes no server-side write API for iCloud Calendar.** There is no equivalent of the Google Calendar API. The only ways in are CalDAV, which requires every employee to generate an app-specific password by hand, or the iCalendar format. A push-based design would simply have left iPhone and Mac users out.
- **Teams has no calendar of its own.** It renders the Microsoft 365 calendar, so anything that reaches Outlook reaches Teams. There was never a third integration to build.

So the vendor-API route would have been more code, three sets of credentials to hold and rotate, per-user OAuth tokens that expire, and *still* no Apple support. iCalendar is the one language all four speak, and it needs no credential at all.

The one thing given up is instant delivery on the subscription path — a feed refreshes on the client's schedule. The invitation email covers that, which is why both exist.

### 10.5 Privacy

Entries say **"Out of office"** and never the leave type, exactly as the Slack digest does, and for the same reason: a work calendar is rarely as private as it looks. Inside a Google Workspace or Microsoft 365 tenant colleagues routinely see event *titles*, not just busy blocks, so writing "Sick leave" into one would broadcast health data to everyone who can open that calendar.

Half-days are named in words ("half day", "morning only on the first day") because an all-day event cannot express a half day. Over-blocking half a morning is a smaller error than silently hiding it.

Invitations are sent as `PARTSTAT=ACCEPTED` with `RSVP=FALSE` — approved leave is not a meeting anyone may decline — and carry `X-MICROSOFT-CDO-BUSYSTATUS:OOF`, which is what turns Teams presence and Outlook availability to *Out of Office* rather than a plain *Busy*.

### 10.6 If nothing arrives

- **No invitation email.** Invitations travel over Resend, so `RESEND_API_KEY` must be set. The Integrations card says so plainly when it isn't. Subscription links still work without it.
- **Invitations arrive in Outlook as an `invite.ics` attachment instead of filing themselves.** The SMTP path is not being used — check the logs for `calendar SMTP send failed, falling back to API`. Outbound port 465 has to be reachable from wherever the app runs. Everything still gets delivered; the event just has to be opened by hand, as it did before.
- **The feed URL 404s.** Either the integration is disconnected, subscription links are switched off, or the link was regenerated — get the current one from the Account page.
- **New leave doesn't show up in a subscribed Outlook calendar.** Almost always Outlook's refresh schedule rather than the feed. Microsoft syncs internet calendars on its own cadence — commonly a few hours, sometimes up to a day — and ignores the `REFRESH-INTERVAL` the feed asks for, so there is no way to push from this end. To tell the two apart, open the feed URL in a browser: if the leave is in that document, the app has done its job and Outlook simply hasn't re-read it. The invitation on approval is the path that reaches Outlook in seconds, which is why both exist and both default on.
- **Leave that moved still shows at its old dates in Outlook.** That one *was* ours, twice over. Feed events carry `CREATED` and `LAST-MODIFIED` so Outlook has a per-event reason to replace the copy it fetched first time; `LAST-MODIFIED` comes from `leave_requests.ics_updated_at`, which moves whenever the calendar copy changes, rather than from `decided_at`, which stands still through a cancellation. And moved leave is a *withdrawal plus a new entry*, so the old one is now explicitly cancelled in the feed instead of being silently dropped.
- **Cancelled leave is gone from Google and Apple but still blocks the day in Outlook.** Fixed. Outlook's internet-calendar sync merges rather than replaces, so an event that merely stopped being published stayed put forever; the feed now publishes an explicit cancellation for it. If it recurs, open the feed URL in a browser and look for a `STATUS:CANCELLED` block carrying that leave's `UID` — if it is there, the app has done its job and Outlook has not re-read the feed yet. Employees never need to re-subscribe to clear one.
- **A specific old entry never clears, however long you wait.** Was a second bug in the first version of the feed mirror: the decision to withdraw was gated on `ics_sequence > 0`, so leave approved before the sequence was being advanced was published into the feed and then never withdrawn from it. The status alone now decides. Entries stranded by it heal on the next poll once they are inside the feed window.
- **The feed link points at `localhost`.** `NEXT_PUBLIC_SITE_URL` isn't set to the deployment's address. Fix it in the Vercel project settings and redeploy; anyone already subscribed needs a fresh link from their account page, because the dead one fails quietly rather than reporting an error.
- **Everything 404s and the logs say `column integration_settings.config does not exist`.** Migration 010 hasn't been run. Deploying the code first is safe; the feature stays off until the migration lands.
- **Re-approved leave doesn't come back after an edit.** Migration 011 hasn't been run. The app falls back to the old single-UID behaviour rather than failing, which is exactly the behaviour that has this symptom.
- **The entry is a day short.** It shouldn't be — all-day `DTEND` is exclusive, including across the single-day, year-boundary and leap-year cases — but that is the shape of the classic iCalendar bug if it ever resurfaces.

---

## 11. Leave policies — allowances, earning more days, and other leave types

Different countries and companies give different leave, so the rules are data an admin edits rather than code. A **leave policy** is a template, built and staffed like a Hierarchy group (**People → Leave policies**): create one, set its rules, add the people it applies to. A person follows one template; anyone not added to one follows the template marked **Default**.

Each template sets:

- **Annual leave**: days a year (working days), plus three rules that can each be switched on:
  - **Seniority bonus**: extra days per block of work experience (Kosovo: +1 day for every 5 years). Experience is the person's time since their start date plus any previous experience, and years completed by 31 December count for that whole year.
  - **First-year leave**: in the calendar year someone joins, they earn a set number of days per month worked (Kosovo: 1.5) instead of the full allowance, up to that allowance. A month counts once worked in full. From the next 1 January they get the full amount.
  - **Carry-over**: unused annual days move into the next year up to a cap, optionally expiring at the end of a chosen month. Carried days are spent first, on the earliest leave, since they're the ones that can lapse. With no expiry, what's left can carry again (still capped). The first leftovers that can carry are 2026's, and never from before someone joined.
- **Every other leave type**, on or off: a yearly allowance, a cap per occasion (marriage: 5 days for each wedding), or no fixed limit (unpaid: approval decides). Each type counts working days or calendar days (maternity runs in months), and can carry a note employees see when they pick it, e.g. how it's paid.

Types are one catalogue shared by all templates: annual, sick, maternity, paternity, marriage, bereavement, blood donation and unpaid leave come built in, and admins can add their own from any template (it joins the others switched off). A type nobody has booked can be deleted; one that has been booked can only be switched off, so past leave keeps its name. New templates start from **the full company policy** (every type on, with seniority and first-year leave) or **blank** (20 annual, 20 sick).

Start dates and previous experience are set per person on **People → Employees** (Edit). Without a start date, nobody gets seniority or first-year proration, just the template's days.

Every type keeps its own count: paternity leave never comes out of annual leave. Employees see all of theirs from **All leave types**, at the end of the annual and sick balance line on Request leave and My requests; admins open a person from **People → Employees** to see the same, with their policy, start date and requests. Yearly allowances count down ("16 of 21 left"); types capped per occasion show the cap, the template's note on what they're for, and what's been taken that year, since there's no yearly total to count down (switch a type to "Days per year" on its template if a running total is what you want).

### 11.1 Turning it on

1. Run `supabase/migrations/013_leave_policies.sql` in the Supabase SQL editor.
2. Open **People → Leave policies**. The migration created a **Standard** template matching the old behaviour exactly (20 annual, 20 sick, everything else off) and made it the default, so no balance moves when it runs. Anyone whose allowance had been edited by hand gets a template with their own numbers.
3. Create a template from the full company policy (or edit Standard), adjust it, and add people. Set start dates and previous experience under Employees for the seniority and first-year rules.

Until migration 013 is run, the app behaves as before: annual and sick leave only, allowances edited per person on the Employees page, and the Leave policies page says the migration is missing. Deploying the code first is safe.

### 11.2 How it's enforced

- Balances are still computed on the fly from `leave_requests`, all in `lib/leave-rules.ts` (pure functions, shared by the API routes, the admin tables and the employee's request form, so the number a form shows is the number the server enforces).
- A request counts against the year it **starts** in, and is checked against that year's allowance, so booking January in December checks next year's days rather than this year's.
- Pending leave holds its days like approved leave does. A request still pending in a year that has ended no longer holds anything back from the carry-over.
- Employees can only request types their template switches on, and hit its limits. Admins logging leave on behalf skip the limits, as before, and can log any type. Editing a request leaves its own days out of the count and may keep a type that has since been switched off.
- The annual notice period (section 9) and the Hierarchy rule (section 8) still apply to annual leave only.
- Templates aren't versioned. A person's current template is used for every year, including last year when working out what carries over, so changing a template's annual days (or moving someone to another template) also changes the leftover their carry-over is based on.

### 11.3 Privacy

- Start dates and previous experience live in `employment_details`, readable only by the person and admins. Not `profiles`: since migration 003 any signed-in user can read every profile column.
- Which template someone follows is readable only by them and admins.
- Colleagues see each other's leave as simply "off". The employee dashboard no longer sends colleagues' leave types to the browser at all. Note that the `leave: authenticated reads approved` RLS policy from 003 still lets a signed-in user query the `type` of anyone's approved leave through the API directly; closing that needs a view or a column-restricted policy, and matters more now that types like maternity leave exist.

---

## 12. Gmail auto-reply — the mailbox answers while you're away

When approved leave starts, the person's Gmail answers anyone who writes to them: that they're out of office, the day they're back, and **who to contact in the meantime** — a colleague from their Hierarchy group (section 8) who is not also away. It switches itself off when the leave ends.

The reply never says what kind of leave it is, exactly as the Slack digest and calendar entries don't. This is the loudest of the three — it answers strangers, clients and recruiters automatically, with nobody reviewing it — so "out of office" is all it ever says.

**Google Workspace only.** It works by setting each employee's own vacation responder through the Gmail API, so anyone on an address outside the Workspace is skipped.

### 12.1 What you set up in Google, once

This is the only integration in the app that needs a credential from a Google console, and it needs a **super admin** for step 3.

1. **Google Cloud** → create a project (or pick an existing one) → **APIs & Services → Library → Gmail API → Enable**. Skipping this is the single most common cause of the whole thing failing with a 403.
2. **IAM & Admin → Service Accounts** → create one → **Keys → Add key → JSON**. The file downloads once; treat it like a password.
3. **Google Admin console** (admin.google.com, super admin required) → **Security → Access and data control → API controls → Manage domain-wide delegation → Add new**:
   - **Client ID**: the service account's *Unique ID* (a long number, on the service account's details page — not its email address).
   - **OAuth scopes**: `https://www.googleapis.com/auth/gmail.settings.basic`
   - **Authorize**. Newly added delegations can take a few minutes to take effect.

**What that scope can and cannot do.** `gmail.settings.basic` reads and writes mailbox *settings* — the vacation responder among them. It cannot read, send, or delete a single message. This is worth being precise about internally, because "we authorised an app to act as any employee" sounds far broader than what was actually granted.

### 12.2 What you set on the deployment

Three environment variables, from the JSON key file (Vercel project settings, and `.env.local` for development):

```
GOOGLE_SA_CLIENT_EMAIL   the key file's client_email
GOOGLE_SA_PRIVATE_KEY    the key file's private_key, newlines and all
GOOGLE_WORKSPACE_DOMAIN  blackbird.marketing
```

`GOOGLE_WORKSPACE_DOMAIN` is a safety rail rather than a requirement: with it set, an address outside the domain is skipped before Google is ever asked, which turns a confusing Google error into a clear "skipped, not in the Workspace" on the Integrations card.

The private key is one long value containing newlines. Both forms parse — pasted verbatim, or with the `\n` escapes the JSON file uses — because every dashboard mangles it differently and a wrong guess produces a signature error that says nothing about newlines.

### 12.3 Turning it on

1. Run `supabase/migrations/014_gmail_auto_reply.sql` in the Supabase SQL editor.
2. Go to **Workspace → Integrations**, find **Gmail auto-reply**, press **Connect**. It refuses to connect without credentials, on purpose: every other integration here announces a broken setup by visibly not working, while this one would read "Connected" while every mailbox stayed silent.
3. Press **Check and preview**. It reads *your own* mailbox settings and changes nothing, which exercises every piece that can be silently wrong — the key signs, Google accepts the delegation, the Gmail API is enabled, the scope reaches vacation settings — and shows you the exact words your own reply would use.

Two settings are worth a look while you're there:

- **Fallback address** — used only when no colleague can be named, i.e. nobody in their Hierarchy group, or everyone in it away at once. Defaults to `art@blackbird.marketing`; clearing the field goes back to that.
- **Extra line** — appended to every reply above the sign-off, e.g. an office phone number.

### 12.4 How it behaves

- **Gmail owns the clock.** The responder is written once with a start and end instant, and Gmail switches it on and off at those times. Leave approved in March for August needs nothing to happen in between — which is why this feature has no cron job.
- **Half days are honoured.** An afternoon off starts the responder at midday Kosovo time, not midnight.
- **The return date skips weekends and public holidays.** Leave ending on a Friday says "back on Monday".
- **Re-synced on every change.** Approving, editing, cancelling, or an admin logging leave on behalf all recompute the responder. Editing approved leave sends it back to pending, so the reply comes down until it's approved again.
- **Group-mates are re-checked too.** When someone's leave changes, colleagues whose replies currently name them are recomputed as well — so a reply can't go on telling clients to contact somebody who has since booked the same week off. That self-correction is the reason no reconciling cron is needed.
- **One responder per mailbox.** Gmail allows only one, so back-to-back bookings are represented by the nearest one; each later booking gets its turn when the earlier ends.

### 12.5 Opting out

Anyone can switch it off for themselves under **Account** — "Set an out-of-office on my leave". Opting out while a reply is already running takes it down immediately. It's on for the team by default because an opt-in would leave exactly the mailboxes that matter silent, but writing into somebody's personal mailbox has to be refusable by the person whose mailbox it is.

### 12.6 Disconnecting

**Disconnect takes down the replies that are already running**, unlike the calendar integration, which leaves existing entries alone. The distinction is deliberate: a calendar entry records a real day off, while a responder is the app actively speaking in an employee's voice to everyone who writes in. Switching the feature off has to actually silence it.

### 12.7 If nothing arrives

The Integrations card reports what it can see, because every failure here is invisible from the outside. In rough order of likelihood:

| What you see | What it means |
| --- | --- |
| 403 mentioning the API being disabled | Gmail API not enabled on the Cloud project (step 1). |
| `unauthorized_client` | The delegation isn't authorised for `gmail.settings.basic`, or the client ID is wrong. Check you used the service account's *Unique ID*, not its email. Newly added delegations can also take a few minutes. |
| `invalid_grant` | That address has no mailbox in this Workspace. |
| `invalid_client` | `GOOGLE_SA_CLIENT_EMAIL` / `GOOGLE_SA_PRIVATE_KEY` don't match the downloaded key. |
| "N people are on an address outside …" | Those colleagues aren't in the Workspace and are skipped. |
| "There are no Hierarchy groups" | Replies still go out, pointing to the fallback address instead of a colleague. Set up groups under People → Hierarchy. |

Until migration 014 is run the feature is simply off and the card says so — deploying the code first is safe.

---

## 13. Organizations — one app, many companies

Every row in the database belongs to one company (an *organization*). This is the groundwork for other companies signing up and running their own leave calendar; until sign-up exists, Blackbird Marketing is the only one and nothing looks different.

How the separation holds:

- **Every table has `organization_id`.** Existing data sits in Blackbird Marketing, which has the fixed id `00000000-0000-4000-8000-000000000001`.
- **RLS.** One restrictive policy per table keeps each signed-in user inside their own company, on top of the existing policies. "Admin" now means admin of your own company.
- **Same-company triggers.** Leave, group members, template members and so on are checked against their parent's company on every insert and update (migration 016), so a row can never link two companies, even from the service role. Triggers rather than composite foreign keys: an extra foreign key gives PostgREST two relationships to choose from, and every embedded select across them fails.
- **Service-role code filters by company itself.** It skips RLS, so every query made with it passes `organization_id`. Inserts into a root table that forget it fail rather than landing in the wrong company.
- **Per company:** leave types, public holidays, settings, integration settings and the Slack digest. The Slack cron runs once per company.
- **Blackbird only:** the `SLACK_BOT_TOKEN` / `SLACK_CHANNEL_ID` fallbacks and the Gmail auto-reply's Workspace service account (see `lib/org.ts`).
- New auth users get their company and role from `app_metadata`, which only the service role can set. A user created without one gets no profile.

**Rolling it out.** Run `supabase/migrations/015_organizations.sql` and then `016_organization_checks.sql` in the Supabase SQL editor *before* deploying the code. This code filters on `organization_id`, so it cannot run without the migration. The code already live keeps working after it, except for sending and accepting invites and saving integration settings, which fail until the deploy lands. Keep the gap to a few minutes.

---

## 14. Sign-up — new companies and people joining them

Besides an admin invite there are three ways in, all public (`lib/registration.ts`):

- **Create a company** at `/signup`, in three steps. **You:** name and a work email; personal and throwaway addresses (Gmail, Outlook.com, Yahoo, Mailinator, …) are refused, and so is a domain with no mail server. **Company:** name, country, team size, their job title, and a declaration that they work there and may set it up; its exact words, the time and their IP address are kept in `organization_declarations` (service role only). **Leave policy:** Standard (20 annual, 20 sick, raised to the country's legal minimum where that is higher, e.g. 25 in France), Kosovo labour law (suggested for Kosovo), or one built on the spot; skipping gives Standard. The country's minimum paid annual leave is shown as a guide (`lib/countries.ts`) and a custom policy below it is flagged. The person becomes the new company's first admin, and the company, its leave types and that default template are made in one step by `create_organization()`.
- **Join link** at `/join/<code>`. An admin switches it on under Invites → More ways to join. Anyone who opens it joins as an employee. **Replace link** stops the old one working immediately, and **Switch off** removes it.
- **Work email domain.** Off by default. When an admin turns it on, anyone signing up at `/signup` with an address at that admin's own domain joins the company as an employee instead of creating a new one. Public providers (gmail.com, outlook.com, …) can't be used, and each domain belongs to at most one company.

Every route emails a link first, and only following it (and setting a password) creates anything. `/signup` always answers "check your inbox"; whether the address already has an account is said only in the email. Links last 24 hours, are single-use, and are stored hashed. A join link that has been replaced, or a domain join switched off, also invalidates links already sent. Each address can request at most three links an hour. Admins get an email whenever someone joins without an invite.

Admin rights are never handed out by sign-up beyond a new company's founder. Other admins are invited as admins, or promoted with **Make admin** on their page under Employees. A company always keeps at least one admin.

**One company per domain, and domain verification.** A new company keeps the email domain its founder signed up with, and nobody else can create a company on it: they're emailed to ask its admin for an invite. On their own **Your account** page (linked from Settings), an admin adds a `blackbird-leave-verify=…` TXT record to the domain's DNS and checks it, or skips it for now and comes back later. Until the company is verified it can have up to 10 people (members plus open invites), and join links, joining by email domain and connecting integrations are locked. Blackbird Marketing is verified by migration 019. See `lib/verification.ts`.

Needs `supabase/migrations/017_company_registration.sql`, `018_company_signup_details.sql` for the country, team size and leave policy step, and `019_company_verification.sql` for domains, declarations and verification.

---

## Project layout

```
app/
  login/                 sign-in page
  invite/[token]/        invited user sets password
  signup/                create a company; [token] is the emailed link that finishes any sign-up
  join/[code]/           a company's shareable join link
  dashboard/             employee dashboard (balance + request form + history)
  admin/                 admin dashboard (calendar + pending)
    requests/            full request list
    employees/           employee list + start date / previous experience editor; [id] shows one person's leave
    hierarchy/           conflict groups
    policies/            leave policy templates, their people, and the rules editor ([id])
    invites/             send invites
    holidays/            holiday calendars by country, and their holidays
    leave/new/           log leave on behalf
    whos-off/            team calendar + "Post to Slack now"
  api/                   route handlers (leave, invites, holidays, etc.)
    leave-policies/      create / save / delete templates, set the default, add and move people
    cron/slack-daily/    daily Slack digest, triggered by Vercel Cron
    slack/test/          admin-only "post the digest right now"
    integrations/slack/  connect / edit / disconnect Slack
    integrations/calendar/ connect / edit / disconnect calendars
    integrations/auto-reply/ connect / edit / disconnect the Gmail auto-reply (+ test: check and preview)
    calendar/[token]/    public ICS feed, authenticated by the token itself
    me/calendar-feed/    the caller's own feed URL (+ regenerate)
    me/auto-reply/       the caller's own auto-reply opt-out
lib/
  supabase/              browser / server / admin (service-role) clients
  auth.ts                requireUser / requireAdmin helpers
  org.ts                 organizations: Blackbird's fixed id, membership check
  registration.ts        sign-up: create a company, join by link or domain, emailed confirmation
  signup.ts              what creating a company asks for: work-email rules, team sizes, starting leave policy
  countries.ts           country list and each one's legal minimum annual leave
  verification.ts        company domain verification (DNS TXT) and what it unlocks
  onboarding.ts          what every new account gets (calendar setup email)
  days.ts                working-day calculator (weekends + holidays + half-days)
  leave-rules.ts         the leave maths: allowances, seniority, first year, carry-over, limits (pure)
  leave-policies.ts      loads templates, types and who follows which; works before migration 013 too
  balances.ts            one person's template, leave and this year's balances
  email.ts               Resend wrapper + email templates
  slack.ts               Slack wrapper + digest message builder
  slack-settings.ts      where the Slack connection is stored and resolved
  ics.ts                 iCalendar generation (invites, cancellations, feeds)
  calendar.ts            publishes and withdraws entries; builds the feed; mints feed tokens
  calendar-settings.ts   where the calendar configuration is stored
  whos-off.ts            who's on approved leave on a given date
  google-auth.ts         service-account JWT -> impersonated Google access token
  gmail.ts               read and write one mailbox's vacation responder
  auto-reply.ts          what each mailbox should say while someone is away, and how it gets there
  auto-reply-settings.ts where the auto-reply configuration is stored
components/              shared UI (TopBar, LeaveCalendar, StatusBadge)
middleware.ts            redirects unauthenticated users to /login
vercel.json              cron schedule for the Slack digest
supabase/migrations/     001_init.sql … 019_company_verification.sql
```

---

## Operational notes

- **Annual reset (Jan 1)**: balances are computed on the fly from `leave_requests` rows whose `start_date` falls in the calendar year, and carry-over is worked out from last year's rows. There is no cron job — Jan 1 "just works." Old requests stay in the table for history.
- **Allowances**: come from each person's leave policy template (section 11). Before migration 013 they're the per-person `profiles.annual_allowance` / `sick_allowance`, edited from the Employees page; after it those columns are no longer read.
- **Cancellations**: only admins can cancel pending or approved requests (per spec). Cancellation emails the employee.
- **Half-days**: pick `Morning only` or `Afternoon only` on the first and/or last day of a range. Single-day requests with a half flag count as 0.5.
- **Integrations**: `/admin/integrations` (admin-only) shows what Blackbird Leave is connected to, and lets an admin connect it, edit its settings, fire a digest on demand, or disconnect it. The registry lives in `lib/integrations.ts`; the stored connection in `lib/slack-settings.ts`.
- **Holidays**: holiday calendars in `/admin/holidays` (migration 020), set up like leave policies. Create a calendar per country (Kosovo, Ireland, ...), add the people it applies to, and anyone not added follows the default calendar. Picking a country fills in this year's and next year's national holidays: about 45 countries have built-in rules in `lib/holiday-presets.ts` (Easter-based dates, "last Monday in May", weekend days off in lieu, a table of Eid dates), and any other country is fetched from [Nager.Date](https://date.nager.at). Every holiday is an ordinary row the admin can rename, move, remove or add to, and a later year is one click ("Add missing 2028 holidays"). Only national holidays are filled in; regional ones (German states, Spanish communities, US states) are added by hand. A person's holidays decide their working-day counts, the hatching on their calendar, the auto-reply's "back on" date and the conflict check. The Slack digest says "office closed" only when the day is a holiday for everyone; otherwise it lists who is off for a holiday under that calendar's name.
- **Slack digest**: by default weekdays at 06:00 Kosovo time and silent when nobody is off — all editable on the Integrations page, except that the post hour is limited to what the cron schedule can reach (04:00–06:00 on the current two Hobby slots; see section 7). It never names the leave type, and that one isn't editable at all. If a post fails, the day's claim in `slack_daily_posts` is released so the second run — or a manual **Post to Slack now** — can retry.
- **Security**: all DB access goes through Postgres Row-Level Security. The service-role key is only used in server-side route handlers (never exposed to the browser) for operations that need to bypass RLS (creating auth users, invite lookup, etc.).
