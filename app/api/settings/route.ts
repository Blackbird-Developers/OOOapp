import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { ANNUAL_MIN_NOTICE_KEY } from "@/lib/settings";

const schema = z.object({
  annual_min_notice_days: z.number().int().min(0).max(365),
});

export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const supabase = await createServerClient();
  const { error } = await supabase.from("app_settings").upsert({
    key: ANNUAL_MIN_NOTICE_KEY,
    value: parsed.data.annual_min_notice_days,
    updated_at: new Date().toISOString(),
    updated_by: admin.id,
  });
  if (error) {
    const msg = /app_settings/.test(error.message)
      ? "Settings storage isn't set up yet — run supabase/migrations/008_app_settings.sql first."
      : error.message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
