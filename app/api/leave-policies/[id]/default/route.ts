import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { isPoliciesMigrationMissing, MIGRATION_MISSING_MESSAGE } from "@/lib/leave-policies";

/**
 * Make a template the default: the one everyone not added to a template
 * follows. The database function clears the old default and sets the new one
 * in a single transaction, so there is never a moment with two or none.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createServerClient();
  const { error } = await supabase.rpc("set_default_leave_policy", { policy: id });
  if (error) {
    const missing = isPoliciesMigrationMissing(error) || /set_default_leave_policy/.test(error.message);
    return NextResponse.json({ error: missing ? MIGRATION_MISSING_MESSAGE : error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
