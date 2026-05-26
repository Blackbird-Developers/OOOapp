-- =====================================================================
-- Password reset tokens.
-- One row per "forgot password" request. Single-use, short-lived.
-- =====================================================================

create table public.password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index on public.password_resets (token);
create index on public.password_resets (user_id);

alter table public.password_resets enable row level security;

-- No client-side access. All reads/writes happen through the service role
-- from the API routes — keeping RLS locked down means a leaked token
-- can't be enumerated via the public API even with the anon key.
