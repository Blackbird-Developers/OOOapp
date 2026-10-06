import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { verifyDomain } from "@/lib/verification";

/** Check the company's DNS for its verification record. See lib/verification.ts. */
export async function POST() {
  const me = await requireAdmin();
  const result = await verifyDomain(me.organization_id, me.email);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
