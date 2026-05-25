# Product

## Register

product

## Users

Blackbird Marketing employees and admins. A small agency team (~10-30 people). Employees open the app once or twice a month to check their balance, request leave, or look at the team calendar. Admins use it more often to approve requests, log leave on behalf of others, manage public holidays, and send invites — but it is still not their primary daily tool.

Context: opened from a WordPress menu link or bookmark, on a desktop browser at work, with the goal of completing one specific task and closing the tab.

## Product Purpose

Internal leave and sick-day tracker. Replaces ad-hoc email and spreadsheet tracking with a single source of truth for balances, requests, approvals, and the team's "who's off" calendar.

Success looks like: an employee can book leave in under thirty seconds, an admin can clear pending approvals in one short sitting, and no one ever has to ask "how many days do I have left." The app is invisible most of the time and unmistakably useful when opened.

## Brand Personality

Calm, fast, out of the way. Quiet utility in the spirit of Linear, Stripe, and Vercel — but rendered in Blackbird's existing identity: black, near-black ink, and a single lime accent (`#D7FF36`). Restraint is the personality. The lime is a promise reserved for primary actions, confirmations, and the present moment on the calendar — never decoration.

A small amount of delight is allowed at the moment of payoff (the approval celebration already in the code is correct). Default state everywhere else is silence.

## Anti-references

- **Enterprise HR software** (BambooHR, Workday, ADP, Personio). Heavy chrome, cluttered nav, corporate blue, stock photography, tabs nested in tabs. Everything we are not.
- The generic Tailwind / shadcn reflex: gray-on-white, `neutral-500` everywhere, `rounded-lg shadow-sm` on every card. Nothing that signals Blackbird.
- Cheery SaaS templates: pastel cards, gradient hero metrics, identical card grids, illustrated empty states with cartoon characters.
- Brand showcase as obstacle: animations that delay the task, oversized type that hurts density, branding louder than the action.

## Design Principles

1. **The task in seconds.** Every screen optimizes for the one primary action a user came to do. Secondary information is reachable, not in the way.
2. **Lime is a promise, not decoration.** The accent appears only on primary CTAs, confirmation states, and the "today" marker. If it shows up everywhere, it means nothing.
3. **Restraint over richness.** A tool used twice a month should feel generous with space and ruthless with elements. Density and dashboards are not the goal.
4. **Distinctly Blackbird, never enterprise.** Display typography, sharp craft, monochrome plus the single lime. The opposite of BambooHR in every visible choice.
5. **Quiet by default, expressive at payoff.** Default state is silence. Reserve delight for the small set of moments that genuinely matter (approval landing, request submitted, year resets) and never inflate them.

## Accessibility & Inclusion

WCAG AA baseline:
- Body text contrast at or above 4.5:1; large text at or above 3:1.
- Full keyboard navigation across forms, calendar, and admin tables. Visible focus rings on every interactive element.
- All interactive controls reachable via Tab, with logical order. No keyboard traps.
- Every form input has a programmatic label; errors are announced and visible.
- Lime should not be the sole signal for status — pair color with text, icon, or shape so colorblind users do not depend on the accent.

No known specific user needs beyond standard AA.
