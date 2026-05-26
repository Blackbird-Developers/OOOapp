import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (id === me.id) {
    return NextResponse.json({ error: "You can't delete your own account." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: target, error: lookupErr } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", id)
    .maybeSingle();
  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 });
  if (!target) return NextResponse.json({ error: "User not found." }, { status: 404 });

  if (target.role === "admin") {
    const { count, error: countErr } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 });
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: "Can't delete the last admin. Promote another user first." },
        { status: 400 }
      );
    }
  }

  // Deleting the auth user cascades to profiles, and from there to
  // leave_requests.user_id rows. Other references are SET NULL by FK.
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
