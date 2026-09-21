import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import {
  getLeaveSetup,
  isPoliciesMigrationMissing,
  MIGRATION_MISSING_MESSAGE,
  POLICY_PRESETS,
  policySettingsRow,
  ruleRow,
} from "@/lib/leave-policies";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  preset: z.enum(["kosovo", "blank"]),
});

/** Create a template from a starting point; the editor takes it from there. */
export async function POST(req: Request) {
  const admin = await requireAdmin();
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Give the template a name." }, { status: 400 });

  const setup = await getLeaveSetup();
  if (!setup.ready) return NextResponse.json({ error: MIGRATION_MISSING_MESSAGE }, { status: 409 });

  const preset = POLICY_PRESETS[parsed.data.preset];
  const supabase = await createServerClient();
  const { data: row, error } = await supabase
    .from("leave_policies")
    .insert({
      name: parsed.data.name,
      // Only if there's somehow no default at all; otherwise switching the
      // default is always a deliberate step.
      is_default: setup.defaultPolicy === null,
      created_by: admin.id,
      ...policySettingsRow(preset),
    })
    .select("id")
    .single();
  if (error) {
    const message = isPoliciesMigrationMissing(error) ? MIGRATION_MISSING_MESSAGE : error.message;
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Only types still in the catalogue: an admin may have deleted one the preset names.
  const known = new Set(setup.types.map((t) => t.key));
  const rules = Object.entries(preset.rules)
    .filter(([type]) => known.has(type))
    .map(([type, rule]) => ruleRow(row.id, type, rule));
  const { error: rulesError } = await supabase.from("leave_policy_rules").insert(rules);
  if (rulesError) {
    await supabase.from("leave_policies").delete().eq("id", row.id);
    return NextResponse.json({ error: rulesError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: row.id });
}
