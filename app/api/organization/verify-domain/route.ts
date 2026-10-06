import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { z } from "zod";
import { changeDomain, verifyDomain } from "@/lib/verification";

/** Check the company's DNS for its verification record. See lib/verification.ts. */
export async function POST() {
  const me = await requireAdmin();
  const result = await verifyDomain(me.organization_id, me.email);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}

/** Change which domain an unverified company will verify. */
export async function PATCH(req: Request) {
  const me = await requireAdmin();
  const parsed = z.object({ domain: z.string().max(253) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a domain." }, { status: 400 });
  const result = await changeDomain(me.organization_id, parsed.data.domain);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
