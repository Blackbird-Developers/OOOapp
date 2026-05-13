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
    return <p className="text-sm text-slate-500">No requests yet.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 border-b border-slate-200">
            <tr>
              <th className="py-2">Type</th>
              <th>Dates</th>
              <th>Days</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => {
              const isRejected = r.status === "rejected";
              return (
                <tr
                  key={r.id}
                  onClick={isRejected ? () => setOpenId(r.id) : undefined}
                  className={`border-b border-slate-100 ${
                    isRejected ? "cursor-pointer hover:bg-rose-50" : ""
                  }`}
                >
                  <td className="py-2 capitalize">{r.type}</td>
                  <td>{r.start_date} → {r.end_date}</td>
                  <td>{r.days_count}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="text-right">
                    {isRejected && (
                      <span className="text-xs text-rose-700 underline">View reason</span>
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
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
          onClick={() => setOpenId(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Request rejected</h3>
                <p className="text-xs text-slate-500 mt-0.5 capitalize">
                  {open.type} · {open.start_date} → {open.end_date} · {open.days_count} day{open.days_count === 1 ? "" : "s"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="text-slate-400 hover:text-slate-700 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {open.reason && (
              <div className="mb-4">
                <div className="text-xs font-medium text-slate-500 mb-1">Your reason</div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{open.reason}</p>
              </div>
            )}

            <div>
              <div className="text-xs font-medium text-slate-500 mb-1">Comment from admin</div>
              {open.decision_note ? (
                <p className="text-sm text-slate-800 whitespace-pre-wrap bg-rose-50 border border-rose-100 rounded p-3">
                  {open.decision_note}
                </p>
              ) : (
                <p className="text-sm text-slate-500 italic">No comment was left.</p>
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
