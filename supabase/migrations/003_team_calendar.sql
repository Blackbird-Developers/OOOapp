-- =====================================================================
-- Team calendar visibility for employees.
-- Employees previously could only see their own leave + their own profile.
-- This migration lets every authenticated user see:
--   * approved leave from any user (for the shared team calendar)
--   * basic profile info from any user (so the join above can resolve names)
-- Admins keep full access via the existing is_admin() policies.
-- =====================================================================

-- ---------- profiles ----------
-- Replace the "read own or admin" policy with one that lets any signed-in
-- user read profile rows. This exposes email + allowance fields to peers;
-- acceptable for an internal staff app where everyone already knows each
-- other. Tighten with a view if that ever changes.
drop policy if exists "profiles: read own or admin reads all" on public.profiles;

create policy "profiles: authenticated read"
  on public.profiles for select
  using (auth.uid() is not null);

-- ---------- leave_requests ----------
-- Add an additive policy: any signed-in user can read approved leave.
-- RLS combines SELECT policies with OR, so the existing
-- "user reads own, admin reads all" policy is preserved.
create policy "leave: authenticated reads approved"
  on public.leave_requests for select
  using (auth.uid() is not null and status = 'approved');
