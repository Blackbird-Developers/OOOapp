-- =====================================================================
-- Calendar: make the subscription feed a mirror, not a highlight reel.
--
-- The bug this fixes
-- ------------------
-- Cancelling or rejecting leave removed the day off from Google Calendar and
-- Apple Calendar within one refresh, and never removed it from Outlook. The
-- employee stayed marked out of office in Outlook and Teams for dates nobody
-- had agreed to, and the only cure was unsubscribing and subscribing again.
--
-- The cause is a difference in how the three clients sync a subscribed ICS
-- URL. Google and Apple re-read the whole document and reconcile against it,
-- so an event that stops appearing is deleted. Outlook merges: it adds events
-- it has not seen and updates ones it has, and an event that simply vanishes
-- from the source is left exactly where it is, forever. The feed only ever
-- contained approved leave, so cancelling was expressed as an absence -- the
-- one signal Outlook does not read.
--
-- The fix
-- -------
-- The feed now publishes withdrawals explicitly, as STATUS:CANCELLED entries
-- carrying the UID the calendar is holding. That is the only statement every
-- client acts on. Two things had to become true for it to work.
--
-- First, a cancellation has to out-rank the booking it revokes: same UID, and
-- a strictly higher SEQUENCE, or clients discard it as stale. Publishing an
-- approved request now advances ics_sequence whether or not an invitation is
-- emailed, so the feed and the invite always agree on the number, and every
-- withdrawal is guaranteed to sit above the copy the calendar holds.
--
-- Second, a subscribed calendar needs a per-event reason to replace what it
-- already has. LAST-MODIFIED was being derived from decided_at, which does not
-- move when an admin cancels approved leave -- so the entry that most needed
-- to look changed was the one that looked untouched.
--
-- Column notes:
--   leave_requests.ics_updated_at
--                      When this request last changed in a way the calendar
--                      cares about: published, re-published, or withdrawn.
--                      Written at the moment ics_sequence is advanced, and
--                      emitted as LAST-MODIFIED. Distinct from decided_at,
--                      which records an approval decision and stands still
--                      through a cancellation.
--
--                      Null on existing rows on purpose. The code falls back
--                      to decided_at and then created_at, which is exactly
--                      the behaviour those rows have today, so nothing that
--                      is already correct in somebody calendar is disturbed.
--
-- The backfill
-- ------------
-- ics_sequence is now also the answer to "was this ever published", which the
-- feed needs so it does not tombstone requests no calendar has ever seen.
-- Leave approved before the calendar integration existed still sits at 0 while
-- appearing in the feed, so it is lifted to 1. Harmless where a client already
-- holds a copy: same UID, one higher sequence, identical content, which every
-- client treats as a no-op update.
--
-- Safe to run on a live database. No apostrophes in these comments, on purpose
-- -- the Supabase SQL editor splits statements client-side and reads a lone
-- apostrophe as opening a string literal, which turns a harmless comment into
-- a syntax error.
--
-- Run this in the Supabase SQL editor (after 011).
-- =====================================================================

alter table public.leave_requests
  add column if not exists ics_updated_at timestamptz;

update public.leave_requests
   set ics_sequence = 1
 where status = 'approved'
   and ics_sequence = 0;
