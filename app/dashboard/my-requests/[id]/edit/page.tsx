import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { getBalance } from "@/lib/balances";
import { datesInRange } from "@/lib/days";
import BalanceCards from "@/components/BalanceCards";
import RequestLeaveForm from "../../../RequestLeaveForm";

export default async function EditRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireUser();
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: request } = await supabase
    .from("leave_requests")
    .select("id, user_id, type, start_date, end_date, half_start, half_end, reason, status")
    .eq("id", id)
    .single();

  const todayISO = new Date().toISOString().slice(0, 10);
  const editable =
    request &&
    request.user_id === profile.id &&
    (request.status === "pending" || request.status === "approved") &&
    request.start_date >= todayISO;

  if (!editable) redirect("/dashboard/my-requests");

  const [balance, { data: holidays }, { data: existing }] = await Promise.all([
    getBalance(profile.id),
    supabase.from("public_holidays").select("date, name").order("date"),
    supabase
      .from("leave_requests")
      .select("id, start_date, end_date")
      .eq("user_id", profile.id)
      .in("status", ["approved", "pending"]),
  ]);

  // Other active requests block their dates; this request's own dates stay open.
  const blockedDates = Array.from(
    new Set(
      (existing ?? [])
        .filter((r: { id: string }) => r.id !== id)
        .flatMap((r: { start_date: string; end_date: string }) =>
          datesInRange(r.start_date, r.end_date)
        )
    )
  );

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <Link
        href="/dashboard/my-requests"
        className="inline-flex min-h-11 items-center gap-1 px-2 -mx-2 mb-3 text-xs font-medium text-neutral-500 transition hover:text-neutral-900"
      >
        ← Back to my requests
      </Link>

      <section className="card p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between pb-5 mb-6 border-b border-neutral-200">
          <h1 className="text-xl font-semibold tracking-tight text-neutral-900">Edit leave request</h1>
          <BalanceCards balance={balance} />
        </div>

        <RequestLeaveForm
          holidays={holidays ?? []}
          balance={balance}
          blockedDates={blockedDates}
          calendarHref="/dashboard/my-requests"
          edit={{
            id: request.id,
            type: request.type,
            start: request.start_date,
            end: request.end_date,
            halfStart: request.half_start,
            halfEnd: request.half_end,
            reason: request.reason ?? "",
            status: request.status,
          }}
        />
      </section>
    </main>
  );
}
