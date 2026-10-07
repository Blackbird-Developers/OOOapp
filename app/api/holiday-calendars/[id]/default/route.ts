import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { CALENDARS_MIGRATION_MISSING_MESSAGE, isCalendarsMigrationMissing } from "@/lib/holiday-calendars";

/**
 * Make a calendar the default: the one everyone not added to a calendar
 * follows. The database function swaps it in one transaction.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("set_default_holiday_calendar", { calendar: id });
  if (error) {
    const missing = isCalendarsMigrationMissing(error) || /set_default_holiday_calendar/.test(error.message);
    return NextResponse.json({ error: missing ? CALENDARS_MIGRATION_MISSING_MESSAGE : error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
