import { NextResponse } from "next/server";
import { z } from "zod";
import { completeSignup } from "@/lib/registration";

const schema = z.object({
  token: z.string().regex(/^[a-f0-9]{48}$/),
  password: z.string().min(8),
});

/** Follow the emailed sign-up link: creates the account (and company). Public. */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await completeSignup(parsed.data.token, parsed.data.password);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, email: result.email });
}
