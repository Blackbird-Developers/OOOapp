# BBM Leave

Internal leave / sick-day tracker for Blackbird Marketing.

- Employees: see remaining annual + sick balance, request leave, view history
- Admins: approve/reject, log leave on behalf, see a team calendar, manage employees, public holidays, and invites
- Half-days supported (0.5)
- Working-day counts automatically exclude weekends and admin-managed public holidays
- Balances reset every Jan 1
- Email notifications on every state change (Resend)

**Stack:** Next.js 15 · TypeScript · Tailwind · Supabase (Postgres + Auth + RLS) · Resend · Vercel

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
5. Deploy.
6. Add a custom domain (e.g. `leave.blackbird.marketing`) in Vercel → Settings → Domains, and update `NEXT_PUBLIC_SITE_URL` to match.

---

## 6. Linking from WordPress

Just add a menu item or a button somewhere on the WordPress site that links to `https://leave.blackbird.marketing`. Employees sign in there. No plugin or SSO bridge needed.

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
  api/                   route handlers (leave, invites, holidays, etc.)
lib/
  supabase/              browser / server / admin (service-role) clients
  auth.ts                requireUser / requireAdmin helpers
  days.ts                working-day calculator (weekends + holidays + half-days)
  balances.ts            year-to-date used/pending/remaining
  email.ts               Resend wrapper + email templates
components/              shared UI (TopBar, LeaveCalendar, StatusBadge)
middleware.ts            redirects unauthenticated users to /login
supabase/migrations/     001_init.sql, 002_seed_admin.sql
```

---

## Operational notes

- **Annual reset (Jan 1)**: balances are computed on the fly from `leave_requests` rows whose `start_date` falls in the current calendar year. There is no cron job — Jan 1 "just works." Old requests stay in the table for history.
- **Allowances**: per-employee allowances live on `profiles.annual_allowance` / `sick_allowance`. Admins can edit per-person from the Employees page.
- **Cancellations**: only admins can cancel pending or approved requests (per spec). Cancellation emails the employee.
- **Half-days**: pick `Morning only` or `Afternoon only` on the first and/or last day of a range. Single-day requests with a half flag count as 0.5.
- **Holidays**: admin-managed in `/admin/holidays`. Add the year's Irish public holidays each year (or as needed). Anything in this table is excluded from working-day counts.
- **Security**: all DB access goes through Postgres Row-Level Security. The service-role key is only used in server-side route handlers (never exposed to the browser) for operations that need to bypass RLS (creating auth users, invite lookup, etc.).
