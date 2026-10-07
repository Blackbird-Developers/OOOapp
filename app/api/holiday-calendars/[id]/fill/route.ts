import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { fillCalendarYear } from "@/lib/holiday-calendars";

const schema = z.object({ year: z.number().int().min(2000).max(2099) });

/**
 * Add a year of the calendar's country holidays. Dates it already has are
 * left alone, so this never undoes a rename, and a holiday removed on
 * purpose only comes back if the admin fills that year again.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a year." }, { status: 400 });

  const supabase = await createServerClient();
  const { data: calendar } = await supabase.from("holiday_calendars").select("preset").eq("id", id).maybeSingle();
  if (!calendar) return NextResponse.json({ error: "That calendar doesn't exist." }, { status: 404 });
  if (!calendar.preset) {
    return NextResponse.json({ error: "Pick the calendar's country first." }, { status: 400 });
  }

  const filled = await fillCalendarYear(supabase, admin.organization_id, id, calendar.preset, parsed.data.year);
  if (!filled.ok) return NextResponse.json({ error: filled.error }, { status: 502 });
  return NextResponse.json(filled);
}
