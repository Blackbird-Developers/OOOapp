import { createServerClient } from "@/lib/supabase/server";
import { yearBounds } from "@/lib/days";

export type Balance = {
  annual_used: number;
  annual_pending: number;
  annual_allowance: number;
  annual_remaining: number;
  sick_used: number;
  sick_pending: number;
  sick_allowance: number;
  sick_remaining: number;
};

export async function getBalance(userId: string, year?: number): Promise<Balance> {
  const supabase = await createServerClient();
  const { from, to } = yearBounds(year);

  const [{ data: profile }, { data: rows }] = await Promise.all([
    supabase
      .from("profiles")
      .select("annual_allowance, sick_allowance")
      .eq("id", userId)
      .single(),
    supabase
      .from("leave_requests")
      .select("type, days_count, status")
      .eq("user_id", userId)
      .in("status", ["approved", "pending"])
      .gte("start_date", from)
      .lte("start_date", to),
  ]);

  const allowance = {
    annual: Number(profile?.annual_allowance ?? 20),
    sick: Number(profile?.sick_allowance ?? 20),
  };

  let annual_used = 0, annual_pending = 0, sick_used = 0, sick_pending = 0;
  for (const r of rows ?? []) {
    const d = Number(r.days_count);
    if (r.type === "annual") {
      if (r.status === "approved") annual_used += d;
      else if (r.status === "pending") annual_pending += d;
    } else if (r.type === "sick") {
      if (r.status === "approved") sick_used += d;
      else if (r.status === "pending") sick_pending += d;
    }
  }

  return {
    annual_used,
    annual_pending,
    annual_allowance: allowance.annual,
    annual_remaining: +(allowance.annual - annual_used - annual_pending).toFixed(1),
    sick_used,
    sick_pending,
    sick_allowance: allowance.sick,
    sick_remaining: +(allowance.sick - sick_used - sick_pending).toFixed(1),
  };
}
