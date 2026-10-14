-- =====================================================================
-- Gradual accrual: earning annual leave over the year instead of up front.
--
-- Until now a template's annual days were all there on 1 January (or, with
-- first-year leave, earned month by month in the joining year only). Many
-- companies instead let people earn paid time off as they go:
--
--   hours        X days for every Y hours worked (e.g. 1 day per 104 hours).
--                Hours come from each person's contracted hours a week,
--                worked Monday to Friday, less any approved unpaid leave.
--   pay_period   X days for each pay period completed (weekly, fortnightly,
--                twice a month or monthly).
--   service      A yearly rate that grows with years of service (e.g. 20
--                days a year from the start, 25 from 5 years), earned in
--                equal monthly parts.
--
-- accrual_method null keeps today's behaviour, so nothing changes for any
-- existing template when this runs. Hours and pay periods never earn more
-- in a year than the template's annual days plus seniority; the service
-- scale's own days are its cap.
--
-- employment_details.weekly_hours is the person's contracted hours a week,
-- for the hours method. Null means 40.
--
-- Run this in the Supabase SQL editor (after 020).
-- =====================================================================

alter table public.leave_policies
  add column accrual_method text
    check (accrual_method in ('hours', 'pay_period', 'service')),
  -- hours: `accrual_hours_days` earned per `accrual_hours_per` hours worked.
  add column accrual_hours_days numeric(5,2) not null default 1
    check (accrual_hours_days > 0 and accrual_hours_days <= 31),
  add column accrual_hours_per numeric(6,1) not null default 104
    check (accrual_hours_per >= 1 and accrual_hours_per <= 2080),
  -- pay_period: `accrual_period_days` earned each completed period.
  add column accrual_pay_frequency text not null default 'biweekly'
    check (accrual_pay_frequency in ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  add column accrual_period_days numeric(5,2) not null default 0.77
    check (accrual_period_days > 0 and accrual_period_days <= 31),
  -- service: [{"fromYears": 0, "daysPerYear": 20}, {"fromYears": 5, "daysPerYear": 25}]
  add column accrual_service_tiers jsonb not null default '[]'::jsonb
    check (jsonb_typeof(accrual_service_tiers) = 'array' and jsonb_array_length(accrual_service_tiers) <= 20),
  -- The service scale needs at least one step to earn anything.
  add constraint leave_policies_service_needs_tiers
    check (accrual_method is distinct from 'service' or jsonb_array_length(accrual_service_tiers) > 0);

alter table public.employment_details
  add column weekly_hours numeric(4,1)
    check (weekly_hours is null or (weekly_hours > 0 and weekly_hours <= 100));
