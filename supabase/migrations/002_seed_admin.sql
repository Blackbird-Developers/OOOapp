-- =====================================================================
-- Promote tech@blackbird.marketing to admin automatically whenever
-- their profile is created (or update it now if it already exists).
-- =====================================================================

-- If profile already exists, promote it now.
update public.profiles
   set role = 'admin'
 where email = 'tech@blackbird.marketing';

-- Trigger: any time a profile is inserted for the seed admin email,
-- force role = 'admin'.
create or replace function public.enforce_seed_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email = 'tech@blackbird.marketing' then
    new.role := 'admin';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_seed_admin on public.profiles;
create trigger profiles_seed_admin
  before insert on public.profiles
  for each row execute function public.enforce_seed_admin();
