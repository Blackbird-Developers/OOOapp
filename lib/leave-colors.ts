/**
 * Calendar colours per leave type. Annual keeps what it always had: brand
 * lime on the admin calendars, violet for your own on the dashboard. Sick
 * stays red. Every other type gets a hue well away from the rest, and types
 * admins add take the next unused colour from the pool in catalogue order.
 *
 * Class names are written out in full so Tailwind keeps them.
 */

export type LeaveColor = {
  /** Background and text of a calendar badge. */
  badge: string;
  /** The small dot inside a badge. Legend swatches use the badge colour. */
  dot: string;
};

const ANNUAL_ADMIN: LeaveColor = { badge: "bg-brand-accent text-neutral-900", dot: "bg-brand-ink" };
const ANNUAL_OWN: LeaveColor = { badge: "bg-violet-200 text-violet-900", dot: "bg-violet-500" };

// Spread around the colour wheel: red, orange, teal, sky, pink, plus a grey
// and a near-black for the two types that read best as "quiet".
const FIXED: Record<string, LeaveColor> = {
  sick: { badge: "bg-red-200 text-red-900", dot: "bg-red-500" },
  maternity: { badge: "bg-pink-300 text-pink-950", dot: "bg-pink-600" },
  paternity: { badge: "bg-sky-300 text-sky-950", dot: "bg-sky-700" },
  marriage: { badge: "bg-orange-300 text-orange-950", dot: "bg-orange-600" },
  bereavement: { badge: "bg-slate-700 text-white", dot: "bg-white" },
  blood_donation: { badge: "bg-teal-300 text-teal-950", dot: "bg-teal-700" },
  unpaid: { badge: "bg-stone-300 text-stone-900", dot: "bg-stone-600" },
};

// For types admins add: dark shades, so they can't be mistaken for the light
// built-in colours next to them.
const POOL: LeaveColor[] = [
  { badge: "bg-emerald-700 text-white", dot: "bg-white" },
  { badge: "bg-indigo-700 text-white", dot: "bg-white" },
  { badge: "bg-amber-800 text-white", dot: "bg-white" },
  { badge: "bg-fuchsia-700 text-white", dot: "bg-white" },
];

/** Once the pool runs out (or for a type missing from the catalogue). */
export const FALLBACK_COLOR: LeaveColor = { badge: "bg-neutral-200 text-neutral-900", dot: "bg-neutral-600" };

/**
 * A colour for every type in the catalogue, keyed by type key. `ownLeave`
 * is the dashboard, where the colours only ever mark the viewer's own leave.
 */
export function leaveColors(types: { key: string }[], ownLeave = false): Map<string, LeaveColor> {
  const fixed: Record<string, LeaveColor> = { ...FIXED, annual: ownLeave ? ANNUAL_OWN : ANNUAL_ADMIN };
  const out = new Map<string, LeaveColor>();
  let next = 0;
  for (const t of types) {
    if (fixed[t.key]) out.set(t.key, fixed[t.key]);
    else out.set(t.key, POOL[next++] ?? FALLBACK_COLOR);
  }
  // Built-ins a pre-migration catalogue doesn't list still get their colour.
  for (const [key, color] of Object.entries(fixed)) if (!out.has(key)) out.set(key, color);
  return out;
}
