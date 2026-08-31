"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Field from "@/components/Field";
import Dialog from "@/components/Dialog";
import EmptyState from "@/components/EmptyState";

export type Person = { id: string; full_name: string; email: string };
export type Group = { id: string; name: string; members: Person[] };

export default function HierarchyManager({
  initialGroups,
  people,
}: {
  initialGroups: Group[];
  people: Person[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Group | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    const res = await fetch("/api/conflict-groups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setCreating(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setCreateError(j.error || "Couldn't create the group. Try again.");
      return;
    }
    setName("");
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const res = await fetch(`/api/conflict-groups?id=${deleting.id}`, { method: "DELETE" });
    setDeleteBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setDeleteError(j.error || "Couldn't delete the group. Try again.");
      return;
    }
    setDeleting(null);
    router.refresh();
  }

  return (
    <>
      <form onSubmit={createGroup} className="card p-4 sm:p-6 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-neutral-500">
          Create a group
        </h2>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <Field label="Group name">
              {(p) => (
                <input
                  {...p}
                  className="input"
                  required
                  maxLength={80}
                  placeholder="e.g. Core team, Design leads"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
            </Field>
          </div>
          <button className="btn-primary sm:w-auto" disabled={creating}>
            {creating ? "Creating…" : "Create group"}
          </button>
        </div>
        {createError && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {createError}
          </div>
        )}
      </form>

      {initialGroups.length === 0 ? (
        <div className="card p-4 sm:p-6 mt-6">
          <EmptyState
            title="No groups yet"
            description="Create a group and add the people who can't be on annual leave at the same time — for example everyone covering one core role."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {initialGroups.map((g) => (
            <GroupCard key={g.id} group={g} people={people} onDelete={() => setDeleting(g)} />
          ))}
        </div>
      )}

      <Dialog
        open={!!deleting}
        onClose={() => {
          if (deleteBusy) return;
          setDeleting(null);
          setDeleteError(null);
        }}
        title="Delete group?"
        description={
          deleting ? (
            <>
              <span className="font-medium text-neutral-900">{deleting.name}</span> will be removed
              and its members will be free to overlap annual leave again. Existing leave requests
              are not affected.
            </>
          ) : null
        }
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              disabled={deleteBusy}
              onClick={() => {
                setDeleting(null);
                setDeleteError(null);
              }}
            >
              Keep it
            </button>
            <button type="button" className="btn-danger" disabled={deleteBusy} onClick={confirmDelete}>
              {deleteBusy ? "Deleting…" : "Delete group"}
            </button>
          </>
        }
      >
        {deleteError && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {deleteError}
          </div>
        )}
      </Dialog>
    </>
  );
}

function GroupCard({
  group,
  people,
  onDelete,
}: {
  group: Group;
  people: Person[];
  onDelete: () => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState<string | null>(null); // user id being added/removed, or "add"
  const [error, setError] = useState<string | null>(null);

  const memberIds = new Set(group.members.map((m) => m.id));
  const addable = people.filter((p) => !memberIds.has(p.id));

  async function addMember(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy("add");
    setError(null);
    const res = await fetch("/api/conflict-groups/members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ group_id: group.id, user_id: selected }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't add them. Try again.");
      return;
    }
    setSelected("");
    router.refresh();
  }

  async function removeMember(userId: string) {
    setBusy(userId);
    setError(null);
    const res = await fetch(
      `/api/conflict-groups/members?group_id=${group.id}&user_id=${userId}`,
      { method: "DELETE" }
    );
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Couldn't remove them. Try again.");
      return;
    }
    router.refresh();
  }

  return (
    <section className="card p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-neutral-900 tracking-tight">{group.name}</h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            {group.members.length === 0
              ? "No members yet"
              : `${group.members.length} member${group.members.length === 1 ? "" : "s"} — annual leave can't overlap`}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 shrink-0 items-center px-2 text-xs font-medium text-rose-600 transition hover:text-rose-700"
          onClick={onDelete}
        >
          Delete group
        </button>
      </div>

      {group.members.length > 0 && (
        <ul className="flex flex-wrap gap-2 mb-4">
          {group.members.map((m) => (
            <li
              key={m.id}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 pl-3 pr-1.5 py-1 text-sm text-neutral-800"
            >
              <span>{m.full_name}</span>
              <button
                type="button"
                aria-label={`Remove ${m.full_name} from ${group.name}`}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-200 hover:text-neutral-700 disabled:opacity-50"
                disabled={busy === m.id}
                onClick={() => removeMember(m.id)}
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
                  <line x1="1" y1="1" x2="9" y2="9" />
                  <line x1="9" y1="1" x2="1" y2="9" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      {addable.length > 0 ? (
        <form onSubmit={addMember} className="flex flex-col sm:flex-row gap-2">
          <select
            className="input flex-1"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            aria-label={`Add a member to ${group.name}`}
          >
            <option value="">Add a person…</option>
            {addable.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name} — {p.email}
              </option>
            ))}
          </select>
          <button className="btn-secondary sm:w-auto" disabled={!selected || busy === "add"}>
            {busy === "add" ? "Adding…" : "Add"}
          </button>
        </form>
      ) : (
        <p className="text-xs text-neutral-500">Everyone is already in this group.</p>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}
    </section>
  );
}
