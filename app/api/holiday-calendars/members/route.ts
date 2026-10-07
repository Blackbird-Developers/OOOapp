import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { CALENDARS_MIGRATION_MISSING_MESSAGE, isCalendarsMigrationMissing } from "@/lib/holiday-calendars";

const schema = z.object({
  calendar_id: z.string().uuid(),
  user_id: z.string().uuid(),
});

/** Put someone on a calendar. A person follows one, so this moves them out of any other. */
export async function POST(req: Request) {
  await requireAdmin();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const supabase = await createServerClient();
  const { error } = await supabase
    .from("holiday_calendar_members")
    .upsert({ ...parsed.data, added_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) {
    const message = isCalendarsMigrationMissing(error) ? CALENDARS_MIGRATION_MISSING_MESSAGE : error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Take someone off their calendar, so they follow the default again. */
export async function DELETE(req: Request) {
  await requireAdmin();
  const userId = new URL(req.url).searchParams.get("user_id");
  if (!userId) return NextResponse.json({ error: "Missing user_id" }, { status: 400 });
  const supabase = await createServerClient();
  const { error } = await supabase.from("holiday_calendar_members").delete().eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
