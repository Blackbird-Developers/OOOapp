import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createSchema = z.object({
  // Required once migration 020 has run; before it there's only one list.
  calendar_id: z.string().uuid().optional(),
  date: DATE,
  name: z.string().trim().min(1).max(100),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  date: DATE,
  name: z.string().trim().min(1).max(100),
});

function duplicateMessage(error: { code?: string; message: string }): string {
  return error.code === "23505" ? "There's already a holiday on that date in this calendar." : error.message;
}

export async function POST(req: Request) {
  await requireAdmin();
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Give the holiday a date and a name." }, { status: 400 });
  const supabase = await createServerClient();
  const { error } = await supabase.from("public_holidays").insert(parsed.data);
  if (error) return NextResponse.json({ error: duplicateMessage(error) }, { status: error.code === "23505" ? 409 : 500 });
  return NextResponse.json({ ok: true });
}

/** Rename a holiday or move it to another date (when this year's Eid is announced, say). */
export async function PATCH(req: Request) {
  await requireAdmin();
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Give the holiday a date and a name." }, { status: 400 });
  const { id, ...changes } = parsed.data;
  const supabase = await createServerClient();
  const { data, error } = await supabase.from("public_holidays").update(changes).eq("id", id).select("id");
  if (error) return NextResponse.json({ error: duplicateMessage(error) }, { status: error.code === "23505" ? 409 : 500 });
  if (!data?.length) return NextResponse.json({ error: "That holiday doesn't exist any more." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** Remove one holiday (`?id=`), or a whole year of one calendar (`?calendar_id=&year=`). */
export async function DELETE(req: Request) {
  await requireAdmin();
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const calendarId = searchParams.get("calendar_id");
  const year = Number(searchParams.get("year"));
  const supabase = await createServerClient();

  if (id) {
    const { error } = await supabase.from("public_holidays").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (calendarId && Number.isInteger(year) && year >= 2000 && year <= 2099) {
    const { error } = await supabase
      .from("public_holidays")
      .delete()
      .eq("calendar_id", calendarId)
      .gte("date", `${year}-01-01`)
      .lte("date", `${year}-12-31`);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Missing id" }, { status: 400 });
}
