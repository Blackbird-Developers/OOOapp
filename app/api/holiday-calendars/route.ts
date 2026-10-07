import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import {
  CALENDARS_MIGRATION_MISSING_MESSAGE,
  fillCalendarYear,
  isCalendarsMigrationMissing,
  isPresetKey,
  startingYears,
} from "@/lib/holiday-calendars";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  /** Which country's holidays to start with; null starts empty. */
  preset: z.string().refine(isPresetKey).nullable(),
});

/**
 * Create a holiday calendar, filled with this year's and next year's
 * holidays for the chosen country. If a year can't be filled (Nager.Date is
 * down, say) the calendar is still made: the admin can fill it from its page.
 */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Give the calendar a name and pick a country." }, { status: 400 });

  const supabase = await createServerClient();
  const { data: existing, error: countError } = await supabase
    .from("holiday_calendars")
    .select("id")
    .eq("organization_id", admin.organization_id)
    .limit(1);
  if (countError) {
    const missing = isCalendarsMigrationMissing(countError);
    return NextResponse.json(
      { error: missing ? CALENDARS_MIGRATION_MISSING_MESSAGE : countError.message },
      { status: missing ? 409 : 500 }
    );
  }

  const { data: row, error } = await supabase
    .from("holiday_calendars")
    .insert({
      name: parsed.data.name,
      preset: parsed.data.preset,
      // Only when there's somehow no calendar at all; otherwise switching the
      // default is always a deliberate step.
      is_default: (existing ?? []).length === 0,
      created_by: admin.id,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let warning: string | null = null;
  if (parsed.data.preset) {
    for (const year of startingYears()) {
      const filled = await fillCalendarYear(supabase, admin.organization_id, row.id, parsed.data.preset, year);
      if (!filled.ok) warning = filled.error;
    }
  }

  return NextResponse.json({ ok: true, id: row.id, warning });
}
