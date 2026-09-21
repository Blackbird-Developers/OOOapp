import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import {
  CORE_TYPES,
  getLeaveSetup,
  leaveTypeKey,
  LEAVE_TYPE_KEY,
  MIGRATION_MISSING_MESSAGE,
  policySettingsRow,
  ruleRow,
} from "@/lib/leave-policies";

const NEW_TYPE_REF = /^new:[a-z0-9-]{1,40}$/;

const ruleSchema = z.object({
  /** A catalogue key, or the `ref` of a type in `newTypes`. */
  type: z.string().refine((t) => LEAVE_TYPE_KEY.test(t) || NEW_TYPE_REF.test(t)),
  enabled: z.boolean(),
  limit: z.enum(["per_year", "per_request", "unlimited"]),
  days: z.number().min(0).max(1000).nullable(),
  unit: z.enum(["working", "calendar"]),
  note: z.string().max(400).nullable(),
});

const schema = z.object({
  name: z.string().trim().min(1).max(80),
  seniority: z.object({
    enabled: z.boolean(),
    everyYears: z.number().int().min(1).max(50),
    extraDays: z.number().positive().max(30),
  }),
  firstYear: z.object({
    enabled: z.boolean(),
    daysPerMonth: z.number().positive().max(31),
  }),
  carryOver: z.object({
    enabled: z.boolean(),
    maxDays: z.number().positive().max(366),
    expires: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).nullable(),
  }),
  rules: z.array(ruleSchema).max(200),
  newTypes: z
    .array(z.object({ ref: z.string().regex(NEW_TYPE_REF), name: z.string().trim().min(1).max(60) }))
    .max(20),
  /** Types to remove from the catalogue, and so from every template. */
  deleteTypes: z.array(z.string().regex(LEAVE_TYPE_KEY)).max(50).default([]),
});

/** A month-day that exists in a leap year (so 02-29 is fine, 04-31 isn't). */
function realMonthDay(monthDay: string): boolean {
  const [m, d] = monthDay.split("-").map(Number);
  return d <= new Date(Date.UTC(2024, m, 0)).getUTCDate();
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

/** Save a template's settings and what it allows for each leave type. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireAdmin();
  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Some of the values aren't valid." }, { status: 400 });
  const input = parsed.data;

  const setup = await getLeaveSetup();
  if (!setup.ready) return NextResponse.json({ error: MIGRATION_MISSING_MESSAGE }, { status: 409 });
  if (!setup.policies.some((p) => p.id === id)) {
    return NextResponse.json({ error: "That template no longer exists." }, { status: 404 });
  }
  if (input.carryOver.expires && !realMonthDay(input.carryOver.expires)) {
    return NextResponse.json({ error: "Pick a real date for carried days to expire." }, { status: 400 });
  }

  // Every rule has to make sense on its own before anything is written.
  const refs = new Set(input.newTypes.map((t) => t.ref));
  const known = new Set(setup.types.map((t) => t.key));
  for (const rule of input.rules) {
    if (!known.has(rule.type) && !refs.has(rule.type)) {
      return NextResponse.json({ error: "One of the leave types no longer exists. Reload and try again." }, { status: 400 });
    }
    if (rule.type === "annual" && rule.limit !== "per_year") {
      return NextResponse.json({ error: "Annual leave is always a yearly allowance." }, { status: 400 });
    }
    if (rule.limit !== "unlimited" && rule.days === null) {
      return NextResponse.json({ error: "Every limited leave type needs a number of days." }, { status: 400 });
    }
    if (rule.limit === "per_request" && rule.enabled && (rule.days ?? 0) <= 0) {
      return NextResponse.json({ error: "A limit per occasion has to be more than 0 days." }, { status: 400 });
    }
    if (rule.days !== null && Math.round(rule.days * 2) !== rule.days * 2) {
      return NextResponse.json({ error: "Days go in steps of half a day." }, { status: 400 });
    }
  }

  // New types can't take a name already in the catalogue.
  const takenNames = new Set(setup.types.map((t) => t.name.trim().toLowerCase()));
  for (const t of input.newTypes) {
    if (takenNames.has(t.name.toLowerCase())) {
      return NextResponse.json({ error: `There's already a leave type called "${t.name}".` }, { status: 400 });
    }
    takenNames.add(t.name.toLowerCase());
  }

  if (input.deleteTypes.some((key) => CORE_TYPES.has(key))) {
    return NextResponse.json({ error: "Annual and sick leave can't be deleted." }, { status: 400 });
  }
  if (input.rules.some((rule) => input.deleteTypes.includes(rule.type))) {
    return NextResponse.json({ error: "A leave type can't be both deleted and saved." }, { status: 400 });
  }

  const supabase = await createServerClient();

  // 1. Deletions first, so a type that turns out to be in use stops the save
  // before anything else is written. Past leave has to keep saying what it
  // was: a type that has been booked can be switched off, never deleted.
  if (input.deleteTypes.length) {
    const { error } = await supabase.from("leave_types").delete().in("key", input.deleteTypes);
    if (error) {
      const inUse = error.code === "23503";
      return NextResponse.json(
        {
          error: inUse
            ? "Leave has already been booked as one of the types you deleted, so it can't be deleted. Switch it off instead."
            : error.message,
        },
        { status: inUse ? 409 : 500 }
      );
    }
  }

  // 2. Add the new types to the catalogue, so rules can point at them.
  const keyForRef = new Map<string, string>();
  if (input.newTypes.length) {
    const takenKeys = new Set(known);
    const nextSort = Math.max(0, ...setup.types.map((t) => t.sortOrder)) + 10;
    const rows = input.newTypes.map((t, i) => {
      const key = leaveTypeKey(t.name, takenKeys);
      takenKeys.add(key);
      keyForRef.set(t.ref, key);
      return { key, name: t.name, sort_order: nextSort + i * 10 };
    });
    const { error } = await supabase.from("leave_types").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 3. The template's own settings.
  const { error: policyError } = await supabase
    .from("leave_policies")
    .update({
      name: input.name,
      ...policySettingsRow({
        seniority: { ...input.seniority, extraDays: round(input.seniority.extraDays, 1) },
        firstYear: { ...input.firstYear, daysPerMonth: round(input.firstYear.daysPerMonth, 2) },
        carryOver: { ...input.carryOver, maxDays: round(input.carryOver.maxDays, 1) },
      }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (policyError) return NextResponse.json({ error: policyError.message }, { status: 500 });

  // 4. Its rule for every type it was sent.
  const rules = input.rules.map((rule) =>
    ruleRow(id, keyForRef.get(rule.type) ?? rule.type, {
      // Annual leave is what the whole template is built around: always on.
      enabled: rule.type === "annual" ? true : rule.enabled,
      limit: rule.limit,
      days: rule.days,
      unit: rule.unit,
      note: rule.note,
    })
  );
  if (rules.length) {
    const { error } = await supabase
      .from("leave_policy_rules")
      .upsert(rules, { onConflict: "policy_id,leave_type" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The keys new types were given, so the editor can keep editing them.
  return NextResponse.json({ ok: true, keys: Object.fromEntries(keyForRef) });
}

/** Delete a template. Its people go back to following the default. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireAdmin();
  const { id } = await params;
  const setup = await getLeaveSetup();
  if (!setup.ready) return NextResponse.json({ error: MIGRATION_MISSING_MESSAGE }, { status: 409 });

  const policy = setup.policies.find((p) => p.id === id);
  if (!policy) return NextResponse.json({ ok: true });
  if (policy.isDefault) {
    return NextResponse.json(
      { error: "This is the default template. Make another template the default before deleting it." },
      { status: 400 }
    );
  }

  const supabase = await createServerClient();
  const { error } = await supabase.from("leave_policies").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
