import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import { decideLeaveRequest } from "@/lib/leave-decision";

const schema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().max(1000).optional().nullable(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await decideLeaveRequest({
    supabase: await createServerClient(),
    admin,
    id,
    action: parsed.data.action,
    note: parsed.data.note,
  });

  if (!result.ok) {
    return NextResponse.json(
      result.conflict ? { error: result.error, conflict: true } : { error: result.error },
      { status: result.status }
    );
  }
  return NextResponse.json({ ok: true });
}
