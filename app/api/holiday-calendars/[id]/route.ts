import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { isPresetKey } from "@/lib/holiday-calendars";

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  preset: z.string().refine(isPresetKey).nullable(),
});

/** Rename a calendar, or change which country it's filled from. Holidays already in it stay. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Give the calendar a name." }, { status: 400 });

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("holiday_calendars")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: "That calendar doesn't exist." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/**
 * Delete a calendar and its holidays. Its people go back to the default
 * calendar. Leave already booked keeps the days it was counted at.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: calendar } = await supabase.from("holiday_calendars").select("is_default").eq("id", id).maybeSingle();
  if (!calendar) return NextResponse.json({ ok: true });
  if (calendar.is_default) {
    return NextResponse.json(
      { error: "This is the default calendar. Make another calendar the default before deleting it." },
      { status: 400 }
    );
  }
  const { error } = await supabase.from("holiday_calendars").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
