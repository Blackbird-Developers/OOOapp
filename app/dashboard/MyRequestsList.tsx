"use client";

import { useState } from "react";
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
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200">
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
              const isOpen = openId === r.id;
              return (
                <DesktopRow
                  key={r.id}
                  r={r}
                  isRejected={isRejected}
                  isOpen={isOpen}
                  toggle={() => setOpenId(isOpen ? null : r.id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {requests.map((r) => {
          const isRejected = r.status === "rejected";
          const isOpen = openId === r.id;
          return (
            <MobileCard
              key={r.id}
              r={r}
              isRejected={isRejected}
              isOpen={isOpen}
              toggle={() => setOpenId(isOpen ? null : r.id)}
            />
          );
        })}
      </div>
    </>
  );
}

function DesktopRow({
  r, isRejected, isOpen, toggle,
}: {
  r: Request;
  isRejected: boolean;
  isOpen: boolean;
  toggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={isRejected ? toggle : undefined}
        className={`border-b border-slate-100 transition-colors ${
          isRejected ? "cursor-pointer hover:bg-rose-50/40" : ""
        } ${isOpen ? "bg-rose-50/30" : ""}`}
      >
        <td className="py-3 px-4 capitalize text-slate-700">{r.type}</td>
        <td className="py-3 px-4 whitespace-nowrap text-slate-700">
          {r.start_date} <span className="text-slate-400">→</span> {r.end_date}
        </td>
        <td className="py-3 px-4 text-slate-700">{r.days_count}</td>
        <td className="py-3 px-4"><StatusBadge status={r.status} /></td>
        <td className="py-3 px-4 text-right">
          {isRejected && (
            <span className="text-xs font-medium text-rose-700">
              {isOpen ? "Hide" : "View"} reason {isOpen ? "↑" : "↓"}
            </span>
          )}
        </td>
      </tr>
      {isOpen && isRejected && (
        <tr className="border-b border-slate-100 bg-rose-50/30">
          <td colSpan={5} className="px-4 pb-4 pt-1">
            <RejectionDetail reason={r.reason} note={r.decision_note} />
          </td>
        </tr>
      )}
    </>
  );
}

function MobileCard({
  r, isRejected, isOpen, toggle,
}: {
  r: Request;
  isRejected: boolean;
  isOpen: boolean;
  toggle: () => void;
}) {
  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white p-3 transition-colors ${
        isRejected ? "cursor-pointer" : ""
      } ${isOpen ? "border-rose-200 bg-rose-50/30" : ""}`}
      onClick={isRejected ? toggle : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium capitalize text-slate-900">{r.type}</span>
            <StatusBadge status={r.status} />
          </div>
          <div className="mt-1 text-sm text-slate-600 tabular-nums">
            {r.start_date} <span className="text-slate-400">→</span> {r.end_date}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {r.days_count} {r.days_count === 1 ? "day" : "days"}
          </div>
        </div>
        {isRejected && (
          <span className="text-xs font-medium text-rose-700 shrink-0">
            {isOpen ? "Hide ↑" : "View ↓"}
          </span>
        )}
      </div>
      {isOpen && isRejected && (
        <div className="mt-3 pt-3 border-t border-rose-100">
          <RejectionDetail reason={r.reason} note={r.decision_note} />
        </div>
      )}
    </div>
  );
}

function RejectionDetail({
  reason, note,
}: {
  reason?: string | null;
  note: string | null;
}) {
  return (
    <div className="space-y-3 text-sm">
      {reason && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Your reason</div>
          <p className="text-slate-700 whitespace-pre-wrap">{reason}</p>
        </div>
      )}
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-rose-700 mb-1">Comment from admin</div>
        {note ? (
          <p className="text-slate-800 whitespace-pre-wrap leading-relaxed">{note}</p>
        ) : (
          <p className="text-slate-400 italic">Admin didn't leave a comment.</p>
        )}
      </div>
    </div>
  );
}
