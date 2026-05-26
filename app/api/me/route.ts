import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  first_name: z.string().trim().min(1, "First name is required").max(60),
  last_name: z.string().trim().min(1, "Last name is required").max(60),
});

export async function PATCH(req: Request) {
  const me = await requireUser();
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const full_name = `${parsed.data.first_name} ${parsed.data.last_name}`.replace(/\s+/g, " ").trim();

  // RLS only permits admins to update profiles, but users editing their own
  // name is safe — gate it at the API layer with the service-role client.
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ full_name }).eq("id", me.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, full_name });
}
