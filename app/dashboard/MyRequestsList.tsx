"use client";

import { useEffect, useState } from "react";
import StatusBadge from "@/components/StatusBadge";

type Request = {
  id: string;
  type: "annual" | "sick";
  start_date: string;
  end_date: string;
  days_count: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decision_note: string | null;
  reason?: string | null;
  created_at: string;
};

export default function MyRequestsList({ requests }: { requests: Request[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = requests.find((r) => r.id === openId) ?? null;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (requests.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 px-6 py-10 text-center">
        <p className="text-sm text-slate-500">No requests yet.</p>
        <p className="text-xs text-slate-400 mt-1">Submit one from the Request leave page.</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/60 text-slate-500 border-b border-slate-200">
              <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Type</th>
              <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Dates</th>
              <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Days</th>
              <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em]">Status</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const isRejected = r.status === "rejected";
              return (
                <tr
                  key={r.id}
                  onClick={isRejected ? () => setOpenId(r.id) : undefined}
                  className={`border-b border-slate-100 last:border-b-0 transition-colors ${
                    isRejected ? "cursor-pointer hover:bg-rose-50/40" : ""
                  }`}
                >
                  <td className="py-3 px-4">
                    <span className="capitalize text-slate-700">{r.type}</span>
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap text-slate-700">
                    {r.start_date} <span className="text-slate-400">→</span> {r.end_date}
                  </td>
                  <td className="py-3 px-4 text-slate-700">{r.days_count}</td>
                  <td className="py-3 px-4"><StatusBadge status={r.status} /></td>
                  <td className="py-3 px-4 text-right">
                    {isRejected && (
                      <span className="text-xs font-medium text-rose-700">View reason →</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {open && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-50 flex items-center justify-center p-4"
          onClick={() => setOpenId(null)}
        >
          <div
            className="card max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between mb-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">Rejected</span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 tracking-tight">Request not approved</h3>
                <p className="text-xs text-slate-500 mt-1 capitalize">
                  {open.type} leave · {open.start_date} → {open.end_date} · {open.days_count} day{open.days_count === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="rounded-md w-7 h-7 inline-flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {open.reason && (
              <div className="mb-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Your reason</div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{open.reason}</p>
              </div>
            )}

            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Comment from admin</div>
              {open.decision_note ? (
                <p className="text-sm text-slate-800 whitespace-pre-wrap rounded-md border border-rose-100 bg-rose-50/60 p-3 leading-relaxed">
                  {open.decision_note}
                </p>
              ) : (
                <p className="text-sm text-slate-400 italic">No comment was left.</p>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button type="button" className="btn-secondary" onClick={() => setOpenId(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
