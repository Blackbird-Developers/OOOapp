---
name: BBM Leave
description: Internal leave tracker for Blackbird Marketing. Calm utility, lime accent, restraint as personality.
colors:
  brand-accent: "#D7FF36"
  brand-ink: "#0a0a0a"
  warm-paper: "#fafaf9"
  surface: "#ffffff"
  neutral-900: "#171717"
  neutral-800: "#262626"
  neutral-700: "#404040"
  neutral-600: "#525252"
  neutral-500: "#737373"
  neutral-400: "#a3a3a3"
  neutral-300: "#d4d4d4"
  neutral-200: "#e5e5e5"
  neutral-100: "#f5f5f5"
  neutral-50: "#fafafa"
  rose-700: "#be123c"
  rose-600: "#e11d48"
  rose-500: "#f43f5e"
  rose-300: "#fda4af"
  rose-200: "#fecdd3"
  rose-50: "#fff1f2"
typography:
  display:
    fontFamily: "'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: "1.15"
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: "1.25"
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.5"
    fontFeature: "'cv11', 'ss01'"
  body-small:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1.5"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    letterSpacing: "0.15em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  "2xl": "64px"
components:
  button-primary:
    backgroundColor: "{colors.brand-ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.neutral-800}"
  button-accent:
    backgroundColor: "{colors.brand-accent}"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.neutral-700}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.rose-600}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "44px"
  button-ghost:
    textColor: "{colors.neutral-600}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "44px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.neutral-900}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "24px"
  status-badge:
    backgroundColor: "{colors.neutral-100}"
    textColor: "{colors.neutral-800}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  empty-state:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "48px 24px"
  dialog:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "24px"
---

# Design System: BBM Leave

## 1. Overview

**Creative North Star: "The Quiet Tool"**

BBM Leave is internal software a small marketing agency opens once or twice a month. Its job is to disappear into the task: book leave in thirty seconds, approve in two clicks, close the tab. The visual system serves that disappearance. Generous space, a single saturated accent (lime) reserved for moments that matter, neutral everything else, no decoration that doesn't earn its place.

The system rejects, by name, the things PRODUCT.md rejects: enterprise HR software (BambooHR, Workday, ADP, Personio) with their corporate-blue chrome; the generic Tailwind/shadcn reflex (gray-on-white, `rounded-lg shadow-sm` on every container); cheery SaaS templates with pastel cards and gradient hero metrics; brand showcases where decoration obstructs the task.

What replaces them: lime (`#D7FF36`) and ink (`#0a0a0a`) over warm paper (`#fafaf9`), an editorial display face (Bricolage Grotesque) on h1/h2 only, Inter for everything else, a 44px touch-target floor on every interactive element, and a single principle: lime is a promise. It appears on the moments that are about leave itself, namely today's date, the four "request leave / log leave / submit / approve" CTAs, the "approved" status dot, and the "leave approved" banner. Nowhere else.

**Key Characteristics:**
- One brand color (lime), one negative color (rose), neutral everything else.
- Lime occupies less than 10% of any screen.
- Sharp craft over chrome: full borders, no side stripes, no glassmorphism beyond a purposeful sticky bar.
- Density is restrained. A tool used twice a month should breathe.
- Display font on headings only; body, labels, data, and buttons all Inter.

## 2. Colors: The Warm Paper Palette

A near-monochrome system warmed by `#fafaf9` paper and grounded by ink. The single accent is a saturated lime; the only other named color is rose, reserved for destructive and error states.

### Primary

- **Blackbird Lime** (`#D7FF36`, `oklch(0.95 0.21 121)`): the brand. Appears only on the today's-date marker in calendars, the four primary leave-creating CTAs ("Request leave", "Submit request", "Log leave for employee", "Approve"), the colored dot in the "approved" status pill, and the "Leave approved" banner. Never decorative.

### Secondary

- **Rose** (`#e11d48` / 600 with `#fecdd3` / 200 and `#fff1f2` / 50): danger and negative outcome. Reject, Cancel, Delete; validation error banners; the "Expired" invite badge; the colored dot in the "rejected" status pill.

### Neutral

- **Brand Ink** (`#0a0a0a`): primary text, primary buttons, focus rings (at 10% opacity), inputs and dialog headings. Tinted slightly off-pure-black per the no-`#000` rule.
- **Warm Paper** (`#fafaf9`): page background. Tinted warm to harmonize with lime.
- **Surface** (`#ffffff`): card, input, dialog, and table backgrounds. Permitted as a surface-contrast color over warm paper, not as a page background.
- **Neutral 700-800** (`#404040`, `#262626`): secondary text and primary-button hover.
- **Neutral 500** (`#737373`): tertiary text, meta labels, the WCAG AA contrast floor for body.
- **Neutral 400** (`#a3a3a3`): exempt-only use (disabled controls, out-of-month calendar cells, past dates).
- **Neutral 200** (`#e5e5e5`): borders, dividers.
- **Neutral 100** (`#f5f5f5`): muted backgrounds (status badge pill, disabled button surfaces).
- **Neutral 50** (`#fafafa`): table-row hover, table-head wash, weekend calendar cells.

### Named Rules

**The Lime Promise Rule.** Lime appears only on actions and moments that advance leave: today's date, the four leave-creating CTAs, the approved status dot, and the moment leave is approved. It does not appear on settled administrative state, decorative dividers, hover-only flourishes, or the brand logo. If lime would compete with a rose neighbor (Reject button), keep the neighbor and do not adjust either.

**The Two-Track Status Rule.** Status is communicated on two tracks: a colored dot (lime / rose / neutral; outlined ring for in-process) on top of a uniform neutral pill. The pill is always `bg-neutral-100`. Color carries state, never the pill. Type discriminators (annual / sick, etc.) live in the text label, never in color.

**The Tinted Neutral Rule.** `#000` and `#fff` are prohibited as Tailwind shortcuts. Use `bg-brand-ink` (`#0a0a0a`) and `bg-warm-paper` (`#fafaf9`). White is permitted only as a surface contrast inside cards, inputs, and dialogs over warm paper.

## 3. Typography

**Display Font:** Bricolage Grotesque (variable, weights 400-800), loaded via Next.js Google Fonts.
**Body Font:** Inter (variable), with `cv11` and `ss01` features enabled for tighter numerals and the alternate single-storey 'a'.
**Numeric:** Inter `tabular-nums` for dates, counts, and balances.

**Character:** Editorial display on headings, neutral sans for the rest. Bricolage's softer geometry plus Inter's contemporary clarity yields a pairing that's distinctly considered without reading "agency portfolio."

### Hierarchy

- **Display** (Bricolage 600, 1.875rem / 30px, line-height 1.15, letter-spacing -0.01em): page-level `<h1>`s. "Team availability", "My requests", "Employees", "Holidays".
- **Title** (Bricolage 600, 1rem / 16px, line-height 1.25, letter-spacing -0.01em): `<h2>`s inside cards. "Who's off", "Pending requests".
- **Section title** (Bricolage 500-600, 1.125-1.25rem / 18-20px): smaller surfaces (e.g. login screen `<h1>` reads at 1.5rem).
- **Body** (Inter 400, 0.875rem / 14px, line-height 1.5): default body, table rows, descriptions.
- **Body small** (Inter 400, 0.75rem / 12px): table headers, helper text, metadata. AA-safe at `text-neutral-500`.
- **Label** (Inter 700, 0.6875rem / 11px, uppercase, letter-spacing 0.15em): form labels via the `.label` class. Communicates "this is a category", not "this is data".

### Named Rules

**The Display-Headings-Only Rule.** Bricolage Grotesque appears on `<h1>` through `<h6>` only. Body, buttons, labels, and data use Inter. Display fonts in UI controls are forbidden.

**The 65-75ch Rule.** Body prose caps at 65-75 character width. Data tables may run wider; descriptions in empty states use `max-w-sm` (~28rem) to keep the read.

## 4. Elevation

Flat with two faint lifts. Surfaces are flat at rest. The `.card` and the `TodayStrip` carry a near-invisible double-layer shadow that registers as "this is a surface" without announcing itself; modal dialogs use a deeper shadow because they explicitly elevate above everything.

### Shadow Vocabulary

- **Card** (`box-shadow: 0 1px 2px rgba(0,0,0,0.03), 0 8px 24px -12px rgba(0,0,0,0.08)`): page-level cards. The double layer (1px ambient + 8px diffuse) gives just enough lift for the eye to read "container" without registering "drop shadow".
- **Subtle** (`box-shadow: 0 1px 2px rgba(15,23,42,0.04)`): used on the `TodayStrip`. Lighter than `.card` to acknowledge it sits above the page but below the calendar card.
- **Modal** (Tailwind `shadow-2xl`, `0 25px 50px -12px rgba(0,0,0,0.25)`): native `<dialog>` elements when open, and the header menus. The deeper shadow signals "this is layered above everything."

### Named Rules

**The Flat-By-Default Rule.** New surfaces ship without shadow. Reach for one of the three named shadows only when the surface genuinely needs separating from its background. Don't invent a fourth.

**The No-Side-Stripe Rule.** A colored `border-left` or `border-right` greater than 1px is forbidden as an accent. Use a full hairline border, a background tint, or a leading dot instead. (Restated from the shared design law because it's a recurring temptation.)

## 5. Components

### Buttons

**Shape:** Rounded 8px (`rounded-lg`), `min-h-11` (44px floor), `px-4 py-2`, `text-sm` `font-medium`, 1.5 unit gap for icon+label. Every variant inherits the floor.

- **Primary** (`btn-primary`): `bg-brand-ink` (`#0a0a0a`), white text, faint shadow. Hover background lifts to `neutral-800`. For routine administrative actions: Sign in, Save, Add holiday, Send invite.
- **Accent** (`btn-accent`): `bg-brand-accent` (lime), `text-brand-ink`, `font-bold`. Hover only adjusts brightness (no translate, no glow). For leave-creating actions and the approval payoff (see Lime Promise Rule).
- **Secondary** (`btn-secondary`): white background, 1px `neutral-200` border, `text-neutral-700`. Hover lifts to `neutral-50` background. For tertiary actions in dialogs (Keep pending, Keep it).
- **Danger** (`btn-danger`): `bg-rose-600`, white text. For destructive confirmations (Reject, Cancel request, Delete invite).
- **Ghost** (`btn-ghost`): transparent, `text-neutral-600`, hover to `neutral-100`. For top-bar Sign out and other recessive controls.

**Disabled state:** Per-variant muted surface and secondary text (not opacity). The label stays readable; the affordance reads "not now" via background.

### Inputs

- **Style:** white background, 1px `neutral-200` border, `rounded-lg` (8px), `min-h-11`, `text-sm`, `px-3 py-2`.
- **Placeholder:** `neutral-400` (decorative; never relied on for state).
- **Focus:** 2px focus ring at `brand-ink/10`, border darkens to `neutral-400`. No outline; the ring carries the focus.
- **Use through `<Field>`:** every form input must be wrapped in `components/Field`, which generates an ID via `useId`, associates the `<label>`, and threads `aria-describedby` for hint and error text.

### Cards

- **Corner:** `rounded-2xl` (16px). Larger than buttons / inputs so the hierarchy reads.
- **Background:** white over warm paper.
- **Shadow:** Card vocabulary (see Elevation).
- **Border:** 1px `neutral-200`.
- **Internal Padding:** `p-4 sm:p-6`. Card title and body are separated by a 5-unit gap and `border-b border-neutral-200`.

### Status Badges

- **Shape:** rounded-full pill, `px-2 py-0.5`, `text-[11px] font-medium`.
- **Background:** always `bg-neutral-100`. Never colored.
- **Dot:** 6px circle (`h-1.5 w-1.5`) preceding the text. Color encodes state: lime (approved), rose (rejected), neutral-400 (cancelled), neutral outline ring (pending).
- **Text:** lowercase; cancelled state uses muted `text-neutral-500`. All other states use `text-neutral-800`.

### Empty States

- **Shape:** `rounded-xl` (12px) container, `px-6 py-12`, centered text.
- **Info variant:** dashed `neutral-300` border. Title (Bricolage 600 16px) + max-w-sm description (Inter 14px `neutral-500`) + optional action slot.
- **Positive variant:** solid `neutral-200` border, leading lime dot, no action slot. Used for "you're caught up" states.

### Dialog (Modal)

- **Element:** native `<dialog>` opened via `showModal()`. Inherits focus trap, Escape, `aria-modal` for free.
- **Shape:** `rounded-2xl`, `max-w-md`, white background, 1px `neutral-200` border, modal shadow.
- **Backdrop:** `bg-neutral-900/50 backdrop-blur-[2px]`. Click closes.
- **Animation:** 140ms fade + 2% scale-up on open, exponential ease-out `cubic-bezier(.2 .7 .3 1)`.
- **Content slots:** title (h2), description (sm muted prose), children (form / message), footer (button row, sm:flex-row, reversed on mobile so primary button sits right).
- **Use through `<Dialog>`:** never call `window.alert/confirm/prompt`. Always wrap in `components/Dialog`.

### TodayStrip (signature component)

A one-line status bar above each calendar. Shows "Everyone's in today" / "Public holiday" / "N people off today" / upcoming-fortnight summary. A 10px dot encodes activity: lime if today is noteworthy (people off, public holiday), neutral otherwise.

### Calendar (LeaveCalendar + DateRangePicker)

- **Container:** `rounded-xl` (12px), 1px `neutral-200` border, hidden overflow.
- **Header row:** `bg-neutral-50/60`, day labels uppercase Inter 600 10px tracked at 0.1em.
- **Grid:** `grid-cols-7 gap-px bg-neutral-100` (the gap shows the background as 1px hairlines).
- **Cell:** `min-h-[68px]` mobile, `min-h-[104px]` desktop. Weekend cells get a `bg-neutral-50/40` wash. Out-of-month and past cells dim to `text-neutral-400`.
- **Today marker:** lime pill (`bg-brand-accent text-brand-ink`), 20-24px, with `aria-label="Today, [date]"`.
- **Event badge:** lime background for approved (`bg-brand-accent` for self, `bg-brand-accent/40` for peers); neutral background with dashed border for pending. Type discriminator carried by `· A` / `· S` suffix in label, not by color.
- **DateRangePicker keyboard:** roving tabindex, arrow keys move focus by day, PageUp/Down by month, Shift+PageUp/Down by year, Home/End to week edges. `role="grid"` on the cell container.

### Navigation (TopBar)

- **Desktop:** sticky `h-14`, `border-b neutral-200`, white-with-blur backdrop (`bg-white/80 supports-[backdrop-filter]:bg-white/70 backdrop-blur`). Three zones: logo + Inter 700 10px "Leave" tag on the left, page links in the middle, account on the right. From `lg` a `1fr auto 1fr` grid puts the links on the page's true center; between `md` and `lg` they center in the space between logo and account. The logo is the only link home (Overview for admins, Team availability for staff); neither nav repeats it. Staff links: Request leave, My requests, Account, Help; their account zone is the initials avatar, name (truncated past 10rem, full name on hover) and ghost Sign-out. Both roles switch from the drawer to the bar at `md`.
- **Admin desktop:** only the pages admins open most sit on the bar: Who's off and Requests (with its pending badge). The rest wait one click away in two menus, **People** (Employees, Hierarchy, Invites) and **Workspace** (Holidays, Integrations, Settings), and the avatar on the right opens an account menu (name, email, Account, Sign out).
- **Header menus:** the trigger looks like a bar link plus a 10px chevron, which flips and keeps the `neutral-100` wash while open. The panel is white, `rounded-xl`, 1px `neutral-200` border, modal shadow, hung 6px below the bar, with `rounded-lg` `px-3 py-2` rows. Built as a disclosure (an `aria-expanded` button over plain links), not `role="menu"`: Tab walks the links, arrow keys move between them, and Escape (focus returns to the trigger), a click outside, tabbing away or following a link closes it.
- **Mobile:** hamburger triggers a right-side drawer (`w-[78vw] max-w-xs`, `h-dvh`, `inert` when closed, focus trapped when open). Returns focus to the hamburger on close. The drawer stays one flat list, admin menu pages included.

## 6. Do's and Don'ts

### Do:

- **Do** use lime (`brand-accent`) only on today's date marker, the four leave-creating CTAs (Request leave, Submit request, Log leave for employee, Approve), the "approved" status dot, and the approval banner. Nowhere else.
- **Do** route every form input through `<Field>` so `htmlFor` and `aria-describedby` are guaranteed.
- **Do** route every confirm / destructive interaction through `<Dialog>`, never `window.confirm/alert/prompt`.
- **Do** use `bg-brand-ink` (`#0a0a0a`) instead of `bg-black`, and `text-brand-ink` instead of `text-black`. Same for opacity modifiers (`bg-brand-ink/10`).
- **Do** use `text-neutral-500` as the contrast floor for body and meta text. `neutral-400` is for genuinely decorative or `aria-disabled` content only.
- **Do** keep buttons and inputs at the `min-h-11` (44px) touch floor. Inherit from `.btn` and `.input`; don't override below.
- **Do** give every interactive element a visible `focus-visible` state (ring or border shift).
- **Do** respect `prefers-reduced-motion`. Every animation listed in `globals.css` already opts out.

### Don't:

- **Don't** look like enterprise HR software. No corporate blue, no stock photography, no nested tabs, no cluttered chrome. Specifically: not BambooHR, not Workday, not ADP, not Personio.
- **Don't** ship the generic Tailwind / shadcn reflex: gray-on-white, `neutral-500` everywhere, `rounded-lg shadow-sm` on every container. Nothing should signal "stock template".
- **Don't** use `slate-*` anywhere. The codebase is `neutral-*` only. The two families differ in hue; mixing produces low-grade tonal noise.
- **Don't** use `red-*` for danger. Use `rose-*`.
- **Don't** use pure black (`#000`) or pure white (`#fff`). Use `brand-ink` and white surfaces over `warm-paper`.
- **Don't** use side-stripe borders (`border-left` or `border-right` > 1px as a colored accent). Use full borders, background tints, or leading dots.
- **Don't** use gradient text (`background-clip: text`). Use solid colors. Emphasis via weight or size.
- **Don't** use glassmorphism decoratively. The sticky `TopBar` blur is the only sanctioned use.
- **Don't** ship the hero-metric template (big number, small label, supporting stats, gradient accent). `BalanceCards` was deliberately refactored away from this pattern; keep it inline.
- **Don't** use `window.alert/confirm/prompt`. Ever.
- **Don't** use emerald, amber, indigo, sky, violet, teal, cyan. The status palette is lime + rose + neutral, period.
- **Don't** use em dashes (`—` or `--`). Use commas, colons, semicolons, periods, or parentheses.
- **Don't** apply hover effects that stack translate + scale + colored glow. The `btn-accent` hover is brightness-only by design.
- **Don't** wrap text in `<label>` siblings to inputs without `htmlFor`. Always use `<Field>`.
