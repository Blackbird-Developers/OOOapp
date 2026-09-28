import { NextResponse } from "next/server";
import { z } from "zod";
import { requestSignup } from "@/lib/registration";

const schema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("create"),
    company_name: z.string().trim().min(1).max(80),
    full_name: z.string().trim().min(1).max(120),
    email: z.string().trim().email(),
  }),
  z.object({
    mode: z.literal("join"),
    code: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
    full_name: z.string().trim().min(1).max(120),
    email: z.string().trim().email(),
  }),
]);

/**
 * Start a sign-up: create a company, or join one through its link. Public.
 * Answers "check your inbox" whatever the address — see lib/registration.ts.
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please fill in every field." }, { status: 400 });
  const input = parsed.data;

  const result = await requestSignup(
    input.mode === "create"
      ? { mode: "create", companyName: input.company_name, fullName: input.full_name, email: input.email }
      : { mode: "join", code: input.code, fullName: input.full_name, email: input.email }
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
