"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Field from "@/components/Field";
import Dialog from "@/components/Dialog";
import Select, { Initials } from "@/components/Select";

export type Person = { id: string; full_name: string; email: string; memberOf: string | null };
export type Template = {
  id: string;
  name: string;
  isDefault: boolean;
  /** One-line summaries of the annual rules and the other types it allows. */
  annual: string;
  others: string;
  members: Person[];
};

const PRESETS = [
  {
    value: "kosovo",
    label: "Full company policy",
    hint: "Every leave type in the company policy, with seniority and first-year leave on.",
  },
  { value: "blank", label: "Blank", hint: "20 annual days and 20 sick days, nothing else." },
] as const;

export default function PolicyManager({
  templates,
  people,
  followingDefault,
}: {
  templates: Template[];
  people: Person[];
  followingDefault: Person[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<(typeof PRESETS)[number]["value"]>("kosovo");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const defaultTemplate = templates.find((t) => t.isDefault);

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    const res = await fetch("/api/leave-policies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, preset }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setCreating(false);
      setCreateError(json.error || "Couldn't create the template. Try again.");
      return;
    }
    // Straight into its rules: a new template is rarely right as it comes.
    router.push(`/admin/policies/${json.id}`);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const res = await fetch(`/api/leave-policies/${deleting.id}`, { method: "DELETE" });
    setDeleteBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setDeleteError(j.error || "Couldn't delete the template. Try again.");
      return;
    }
    setDeleting(null);
    router.refresh();
  }

  return (
    <>
      <form onSubmit={createTemplate} className="card p-4 sm:p-6 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-neutral-500">
          Create a template
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Template name">
            {(p) => (
              <input
                {...p}
                className="input"
                required
                maxLength={80}
                placeholder="e.g. Kosovo, Ireland"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
          </Field>
          <Field label="Start from" hint={PRESETS.find((o) => o.value === preset)?.hint}>
            {(p) => (
              <Select
                {...p}
                value={preset}
                onChange={setPreset}
                options={PRESETS.map((o) => ({ value: o.value, label: o.label, description: o.hint }))}
              />
            )}
          </Field>
        </div>
        <button className="btn-primary w-full sm:w-auto" disabled={creating}>
          {creating ? "Creating…" : "Create template"}
        </button>
        {createError && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {createError}
          </div>
        )}
      </form>

      <div className="mt-6 space-y-4">
        {templates.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            people={people}
            templates={templates}
            followingDefault={t.isDefault ? followingDefault : []}
            onDelete={() => setDeleting(t)}
          />
        ))}
      </div>

      <Dialog
        open={!!deleting}
        onClose={() => {
          if (deleteBusy) return;
          setDeleting(null);
          setDeleteError(null);
        }}
        title="Delete template?"
        description={
          deleting ? (
            <>
              <span className="font-medium text-neutral-900">{deleting.name}</span> will be removed.{" "}
              {deleting.members.length > 0
                ? `The ${deleting.members.length === 1 ? "person" : `${deleting.members.length} people`} on it will follow ${defaultTemplate?.name ?? "the default template"} instead. `
                : ""}
              Leave that's already booked isn't changed.
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
              {deleteBusy ? "Deleting…" : "Delete template"}
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

function TemplateCard({
  template,
  people,
  templates,
  followingDefault,
  onDelete,
}: {
  template: Template;
  people: Person[];
  templates: Template[];
  followingDefault: Person[];
  onDelete: () => void;
}) {
  const router = useRouter();
  // user id being added/removed, "add", or "default"
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const templateName = new Map(templates.map((t) => [t.id, t.name]));
  const addable = people.filter((p) => p.memberOf !== template.id);

  async function send(url: string, init: RequestInit, key: string, fallback: string) {
    setBusy(key);
    setError(null);
    const res = await fetch(url, init);
    setBusy(null);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || fallback);
      return false;
    }
    router.refresh();
    return true;
  }

  // Picking someone adds them straight away; a mistake is one click on their chip.
  async function addMember(userId: string) {
    await send(
      "/api/leave-policies/members",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ policy_id: template.id, user_id: userId }),
      },
      "add",
      "Couldn't add them. Try again."
    );
  }

  return (
    <section className="card p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-neutral-900 tracking-tight">{template.name}</h2>
            {template.isDefault && (
              <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-800">
                Default
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-500 mt-1">{template.annual}</p>
          <p className="text-xs text-neutral-500 mt-0.5">{template.others}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1 -mx-2 sm:mx-0">
          <Link
            href={`/admin/policies/${template.id}`}
            className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-neutral-700 transition hover:text-neutral-900"
          >
            Edit rules
          </Link>
          {!template.isDefault && (
            <>
              <button
                type="button"
                className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-neutral-600 transition hover:text-neutral-900 disabled:text-neutral-400"
                disabled={busy === "default"}
                onClick={() =>
                  send(
                    `/api/leave-policies/${template.id}/default`,
                    { method: "POST" },
                    "default",
                    "Couldn't make it the default. Try again."
                  )
                }
              >
                {busy === "default" ? "Saving…" : "Make default"}
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-rose-600 transition hover:text-rose-700"
                onClick={onDelete}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {template.members.length > 0 && (
        <ul className="flex flex-wrap gap-2 mb-4">
          {template.members.map((m) => (
            <li
              key={m.id}
              className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 pl-3 pr-1.5 py-1 text-sm text-neutral-800"
            >
              <span>{m.full_name}</span>
              <button
                type="button"
                aria-label={`Remove ${m.full_name} from ${template.name}`}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-700 disabled:opacity-50"
                disabled={busy === m.id}
                onClick={() =>
                  send(
                    `/api/leave-policies/members?user_id=${m.id}`,
                    { method: "DELETE" },
                    m.id,
                    "Couldn't remove them. Try again."
                  )
                }
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

      {template.isDefault && (
        <p className="text-xs text-neutral-500 mb-4">
          {followingDefault.length === 0
            ? "Everyone has been added to a template, so nobody follows this one by default."
            : `Also applies to everyone not added to a template: ${followingDefault.map((p) => p.full_name).join(", ")}.`}
        </p>
      )}
      {!template.isDefault && template.members.length === 0 && (
        <p className="text-xs text-neutral-500 mb-4">Nobody is on this template yet.</p>
      )}

      {addable.length > 0 ? (
        <Select
          value=""
          aria-label={`Add a person to ${template.name}`}
          placeholder={busy === "add" ? "Adding…" : "Add a person…"}
          disabled={busy === "add"}
          searchable
          searchPlaceholder="Search people"
          options={addable.map((p) => ({
            value: p.id,
            label: p.full_name,
            description: p.memberOf ? `Moves from ${templateName.get(p.memberOf) ?? "another template"}` : p.email,
            leading: <Initials name={p.full_name} />,
          }))}
          onChange={addMember}
        />
      ) : (
        <p className="text-xs text-neutral-500">Everyone is already on this template.</p>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}
    </section>
  );
}
