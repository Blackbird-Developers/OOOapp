-- =====================================================================
-- Allow deleting a profile without losing historical leave requests
-- or invites. Referring columns become NULL instead of blocking the delete.
-- =====================================================================

-- leave_requests.decided_by is already nullable.
alter table public.leave_requests
  drop constraint leave_requests_decided_by_fkey,
  add constraint leave_requests_decided_by_fkey
    foreign key (decided_by) references public.profiles(id) on delete set null;

-- leave_requests.created_by was NOT NULL; relax it so SET NULL works.
alter table public.leave_requests
  alter column created_by drop not null,
  drop constraint leave_requests_created_by_fkey,
  add constraint leave_requests_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;

-- invites.created_by: same treatment.
alter table public.invites
  alter column created_by drop not null,
  drop constraint invites_created_by_fkey,
  add constraint invites_created_by_fkey
    foreign key (created_by) references public.profiles(id) on delete set null;
