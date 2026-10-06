import { NextResponse } from "next/server";
import { z } from "zod";
import { checkWorkEmail } from "@/lib/registration";

const schema = z.object({ email: z.string().trim().email() });

/**
 * Whether an address can create a company, checked on the first step of the
 * sign-up so nobody fills in three steps to be turned away at the end. Says
 * only what's wrong with the address as typed, never whether it has an
 * account. Public.
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const problem = await checkWorkEmail(parsed.data.email);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  return NextResponse.json({ ok: true });
}
