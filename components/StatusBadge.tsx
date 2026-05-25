type Tone = "lime" | "rose" | "neutral";
type Shape = "solid" | "outline";

const STATES: Record<string, { tone: Tone; shape: Shape }> = {
  pending:   { tone: "neutral", shape: "outline" },
  approved:  { tone: "lime",    shape: "solid" },
  rejected:  { tone: "rose",    shape: "solid" },
  cancelled: { tone: "neutral", shape: "solid" },
};

export default function StatusBadge({ status }: { status: string }) {
  const spec = STATES[status] ?? { tone: "neutral", shape: "solid" };
  const muted = status === "cancelled";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium ${
        muted ? "text-neutral-500" : "text-neutral-800"
      }`}
    >
      <Dot tone={spec.tone} shape={spec.shape} />
      {status}
    </span>
  );
}

function Dot({ tone, shape }: { tone: Tone; shape: Shape }) {
  if (shape === "outline") {
    const ring =
      tone === "rose" ? "ring-rose-500" :
      "ring-neutral-500";
    return <span aria-hidden className={`h-1.5 w-1.5 rounded-full bg-transparent ring-[1.5px] ring-inset ${ring}`} />;
  }
  const fill =
    tone === "lime" ? "bg-brand-accent" :
    tone === "rose" ? "bg-rose-500" :
    "bg-neutral-400";
  return <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${fill}`} />;
}
