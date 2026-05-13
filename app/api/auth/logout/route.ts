import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  // 303 forces the browser to do a GET on the next request. A 307 (the
  // default) would replay the POST against /login and crash the middleware
  // because /login has no POST handler.
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
