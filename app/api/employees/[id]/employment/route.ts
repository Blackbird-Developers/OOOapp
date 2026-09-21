import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { isPoliciesMigrationMissing, MIGRATION_MISSING_MESSAGE } from "@/lib/leave-policies";

const schema = z.object({
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((d) => d >= "1950-01-01" && d <= "2100-12-31", "Start date looks wrong.")
    .nullable(),
  prior_experience_months: z.number().int().min(0).max(720),
});

/** A person's start date and previous work experience, for seniority and first-year leave. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const supabase = await createServerClient();
  const { error } = await supabase.from("employment_details").upsert({
    user_id: id,
    start_date: parsed.data.start_date,
    prior_experience_months: parsed.data.prior_experience_months,
    updated_by: admin.id,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    const message = isPoliciesMigrationMissing(error) ? MIGRATION_MISSING_MESSAGE : error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
