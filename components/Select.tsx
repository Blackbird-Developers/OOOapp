"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

/**
 * The app's dropdown. Replaces the native <select>, which can't show what a
 * choice means, can't be searched, and draws differently on every platform.
 *
 * The closed field is the same box as `.input`; the open list is the header
 * menu's panel (white, rounded-xl, hairline border, modal shadow, the same
 * 140ms drop-in). Selection is ink and a check mark, never lime: choosing an
 * option isn't a leave-creating moment.
 *
 * Built as the WAI-ARIA select-only combobox. Focus stays on the field while
 * arrow keys move through the options (aria-activedescendant), so it works
 * inside <Field> like any input: the label's `for` points at the field,
 * and the hint and error are read with it. With `searchable`, focus moves
 * into a filter box at the top of the list instead.
 *
 * The list renders in the browser's top layer (popover="manual") with fixed
 * coordinates, so no card, scroll area or modal dialog can clip it, and it
 * opens upwards when there isn't room below.
 */

export type SelectOption<V extends string = string> = {
  value: V;
  label: string;
  /** A quieter second line saying what choosing this means. */
  description?: string;
  /** Shown before the label, in the list and in the closed field (e.g. initials). */
  leading?: ReactNode;
  disabled?: boolean;
};

type SelectProps<V extends string> = {
  value: V | "" | null;
  onChange: (value: V) => void;
  options: readonly SelectOption<V>[];
  /** Shown while nothing is chosen. */
  placeholder?: string;
  /** Adds a filter box to the list. For long lists, like people. */
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
  /** Mirrors the value into a hidden input for plain form posts. */
  name?: string;
  className?: string;
  // Passed through by <Field>:
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  /** When there's no visible <Field> label. */
  "aria-label"?: string;
};

type Entry<V extends string> = { option: SelectOption<V>; index: number };

const MAX_HEIGHT = 320;
const MIN_HEIGHT = 140;
const GAP = 6; // same distance header menus hang below their trigger
const EDGE = 8;
const TYPEAHEAD_MS = 600;

// useLayoutEffect warns during server rendering; this component only needs
// it in the browser, where the list is measured before it paints.
const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function isPrintable(e: ReactKeyboardEvent) {
  return e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey;
}

/** Options whose label or description contains the query. */
function filterEntries<V extends string>(list: Entry<V>[], query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(({ option }) => `${option.label} ${option.description ?? ""}`.toLowerCase().includes(q));
}

/** First enabled position from `from`, walking by `step`; -1 if none. */
function enabledFrom<V extends string>(list: Entry<V>[], from: number, step: 1 | -1) {
  for (let i = from; i >= 0 && i < list.length; i += step) {
    if (!list[i].option.disabled) return i;
  }
  return -1;
}

/**
 * Type-to-jump. Typing "ma" lands on the first label starting with "ma";
 * pressing the same letter again moves on to the next label with it.
 */
function typeaheadMatch<V extends string>(list: Entry<V>[], after: number, text: string) {
  const lower = text.toLowerCase();
  const repeated = lower.length > 1 && [...lower].every((c) => c === lower[0]);
  const needle = repeated ? lower[0] : lower;
  const start = repeated || lower.length === 1 ? after + 1 : Math.max(after, 0);
  for (let k = 0; k < list.length; k++) {
    const i = (start + k) % list.length;
    const { option } = list[i];
    if (!option.disabled && option.label.toLowerCase().startsWith(needle)) return i;
  }
  return -1;
}

export default function Select<V extends string>({
  value,
  onChange,
  options,
  placeholder = "Choose…",
  searchable = false,
  searchPlaceholder = "Search",
  disabled = false,
  name,
  className = "",
  id,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  "aria-label": ariaLabel,
}: SelectProps<V>) {
  const uid = useId();
  const fieldId = id ?? `${uid}field`;
  const listId = `${uid}list`;
  const optionId = (position: number) => `${uid}option${position}`;

  const rootRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typed = useRef({ text: "", at: 0 });

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);

  const all = useMemo(() => options.map((option, index) => ({ option, index })), [options]);
  const visible = useMemo(() => (searchable ? filterEntries(all, query) : all), [all, query, searchable]);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  function openList(start: "selected" | "first" | "last" = "selected", typedChar?: string) {
    if (disabled) return;
    setQuery("");
    let position =
      start === "first"
        ? enabledFrom(all, 0, 1)
        : start === "last"
          ? enabledFrom(all, all.length - 1, -1)
          : selectedIndex >= 0 && !options[selectedIndex].disabled
            ? selectedIndex
            : enabledFrom(all, 0, 1);
    if (typedChar) {
      typed.current = { text: typedChar, at: Date.now() };
      const match = typeaheadMatch(all, selectedIndex, typedChar);
      if (match >= 0) position = match;
    }
    setActive(position);
    setOpen(true);
  }

  function close(restoreFocus = true) {
    setOpen(false);
    setQuery("");
    if (restoreFocus) fieldRef.current?.focus();
  }

  function choose(position: number) {
    const entry = visible[position];
    if (!entry || entry.option.disabled) return;
    close();
    if (entry.option.value !== value) onChange(entry.option.value);
  }

  function step(delta: number) {
    setActive((current) => {
      if (visible.length === 0) return -1;
      const direction = delta > 0 ? 1 : -1;
      const target = Math.min(visible.length - 1, Math.max(0, (current < 0 ? -1 : current) + delta));
      // Land on the nearest enabled option in the direction of travel,
      // or back the other way at the end of the list.
      const next = enabledFrom(visible, target, direction as 1 | -1);
      return next >= 0 ? next : enabledFrom(visible, target, (direction * -1) as 1 | -1);
    });
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLElement>) {
    const inSearch = e.currentTarget === searchRef.current;

    if (!open) {
      switch (e.key) {
        case "ArrowDown":
        case "ArrowUp":
        case "Enter":
        case " ":
          e.preventDefault();
          openList();
          return;
        case "Home":
          e.preventDefault();
          openList("first");
          return;
        case "End":
          e.preventDefault();
          openList("last");
          return;
      }
      if (isPrintable(e)) {
        e.preventDefault();
        if (searchable) {
          // The first letter typed on the closed field starts the search.
          openList();
          setQuery(e.key);
          setActive(enabledFrom(filterEntries(all, e.key), 0, 1));
        } else {
          openList("selected", e.key);
        }
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        step(1);
        return;
      case "ArrowUp":
        e.preventDefault();
        step(-1);
        return;
      case "PageDown":
        e.preventDefault();
        step(8);
        return;
      case "PageUp":
        e.preventDefault();
        step(-8);
        return;
      case "Home":
      case "End":
        // In the filter box these move the caret, as in any text field.
        if (inSearch) return;
        e.preventDefault();
        setActive(e.key === "Home" ? enabledFrom(visible, 0, 1) : enabledFrom(visible, visible.length - 1, -1));
        return;
      case "Enter":
        e.preventDefault();
        if (active >= 0) choose(active);
        return;
      case " ":
        if (inSearch) return;
        e.preventDefault();
        if (active >= 0) choose(active);
        return;
      case "Escape":
        // Also keeps a surrounding <dialog> from closing.
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      case "Tab":
        close(false);
        return;
    }

    if (!inSearch && isPrintable(e)) {
      e.preventDefault();
      const now = Date.now();
      const text = now - typed.current.at > TYPEAHEAD_MS ? e.key : typed.current.text + e.key;
      typed.current = { text, at: now };
      const match = typeaheadMatch(visible, active, text);
      if (match >= 0) setActive(match);
    }
  }

  /**
   * Pin the list to the field: below it, or above when that has more room.
   *
   * The height limit goes on the list itself, as a number worked out here,
   * rather than on the panel with the list flexing to fill it. Safari sizes
   * a flexing child of an auto-height panel to nothing, which left the list
   * a sliver under the search box while Chrome drew it fine.
   */
  const place = useCallback(() => {
    const field = fieldRef.current;
    const panel = panelRef.current;
    const list = listRef.current;
    if (!field || !panel || !list) return;

    const rect = field.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;

    panel.style.minWidth = `${rect.width}px`;
    const width = panel.offsetWidth;
    const left = Math.max(EDGE, Math.min(rect.left, viewportWidth - EDGE - width));

    // Everything in the panel that isn't the list: its borders, and the search box.
    const fixedPart = panel.offsetHeight - list.offsetHeight;
    const natural = fixedPart + list.scrollHeight;
    const below = viewportHeight - rect.bottom - GAP - EDGE;
    const above = rect.top - GAP - EDGE;
    const downwards = natural <= below || below >= above;
    const room = Math.max(MIN_HEIGHT, downwards ? below : above);
    const height = Math.min(natural, MAX_HEIGHT, room);

    list.style.maxHeight = `${height - fixedPart}px`;
    panel.style.left = `${left}px`;
    panel.style.top = `${downwards ? rect.bottom + GAP : rect.top - GAP - height}px`;
    panel.dataset.side = downwards ? "bottom" : "top";
  }, []);

  useBrowserLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    // Top layer where supported; plain fixed positioning otherwise.
    if (panel && typeof panel.showPopover === "function" && !panel.matches(":popover-open")) {
      try {
        panel.showPopover();
      } catch {
        // Already shown, or detached mid-render: positioning still applies.
      }
    }
    place();
    // Keyboard keeps working after opening with the mouse. Safari doesn't
    // focus a button when it's clicked, so the field wouldn't have focus yet.
    if (searchable) searchRef.current?.focus({ preventScroll: true });
    else fieldRef.current?.focus({ preventScroll: true });

    let frame = 0;
    const follow = (e?: Event) => {
      if (e && e.target === listRef.current) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    window.addEventListener("resize", follow);
    window.addEventListener("scroll", follow, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", follow);
      window.removeEventListener("scroll", follow, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, place, searchable]);

  // Filtering changes the list's height, so it may need to move.
  useBrowserLayoutEffect(() => {
    if (open) place();
  }, [open, visible.length, place]);

  useEffect(() => {
    if (!open || active < 0) return;
    // optionId only depends on the stable useId value, so it isn't a dependency.
    document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const activeId = open && active >= 0 && active < visible.length ? optionId(active) : undefined;

  return (
    <div
      ref={rootRef}
      className={`relative ${className}`}
      onBlur={(e) => {
        if (open && !rootRef.current?.contains(e.relatedTarget as Node | null)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <button
        ref={fieldRef}
        id={fieldId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={searchable ? undefined : activeId}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className="input group flex cursor-pointer items-center gap-2.5 text-left hover:border-neutral-300 aria-expanded:border-neutral-400 aria-expanded:ring-2 aria-expanded:ring-brand-ink/10 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-400 disabled:hover:border-neutral-200"
      >
        {selected?.leading && <span className="flex shrink-0 items-center">{selected.leading}</span>}
        <span className={`min-w-0 flex-1 truncate ${selected ? "" : "text-neutral-500"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="shrink-0 text-neutral-500 transition-transform duration-150 group-aria-expanded:rotate-180"
        >
          <polyline points="2,3.5 5,6.5 8,3.5" />
        </svg>
      </button>

      {name && <input type="hidden" name={name} value={value ?? ""} />}

      {open && (
        <div
          ref={panelRef}
          popover="manual"
          // Clicking inside the list must not move focus off the field (or
          // out of the filter box), or the blur above would close it first.
          onMouseDown={(e) => e.preventDefault()}
          style={{ width: "max-content", maxWidth: `min(22rem, calc(100vw - ${EDGE * 2}px))` }}
          className="select-panel menu-in fixed inset-auto m-0 h-auto overflow-hidden rounded-xl border border-neutral-200 bg-white p-0 text-neutral-900 shadow-2xl"
        >
          {searchable && (
            <div className="flex items-center gap-2 border-b border-neutral-100 px-3">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden className="shrink-0 text-neutral-500">
                <circle cx="6" cy="6" r="4.25" />
                <line x1="9.25" y1="9.25" x2="12.5" y2="12.5" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                role="combobox"
                aria-expanded
                aria-controls={listId}
                aria-activedescendant={activeId}
                aria-autocomplete="list"
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(enabledFrom(filterEntries(all, e.target.value), 0, 1));
                }}
                onKeyDown={onKeyDown}
                className="min-h-11 w-full bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-500"
              />
            </div>
          )}

          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={ariaLabel || !id ? undefined : `${id}-label`}
            aria-label={ariaLabel}
            className="overflow-y-auto overscroll-contain p-1.5"
          >
            {visible.map(({ option }, position) => {
              const isSelected = option.value === value;
              return (
                <li
                  key={option.value}
                  id={optionId(position)}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={option.disabled || undefined}
                  onMouseMove={() => {
                    if (!option.disabled && active !== position) setActive(position);
                  }}
                  onClick={() => choose(position)}
                  className={`flex min-h-11 select-none items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    option.disabled
                      ? "cursor-not-allowed text-neutral-400"
                      : `cursor-pointer ${active === position ? "bg-neutral-100 text-neutral-900" : "text-neutral-700"}`
                  }`}
                >
                  {option.leading && <span className="flex shrink-0 items-center">{option.leading}</span>}
                  <span className="min-w-0 flex-1">
                    <span className={`block ${isSelected ? "font-medium text-neutral-900" : ""}`}>{option.label}</span>
                    {option.description && (
                      <span className="mt-0.5 block text-xs leading-snug text-neutral-600">{option.description}</span>
                    )}
                  </span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                    className={`shrink-0 text-brand-ink ${isSelected ? "" : "invisible"}`}
                  >
                    <polyline points="2.5,7.5 5.5,10.25 11.5,3.75" />
                  </svg>
                </li>
              );
            })}
            {visible.length === 0 && (
              <li role="presentation" className="px-3 py-3 text-sm text-neutral-500">
                {searchable && query ? `No matches for "${query.trim()}"` : "Nothing to choose from"}
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/** A person's initials, for people pickers. Matches the avatar in the top bar. */
export function Initials({ name }: { name: string }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-neutral-100 text-[10px] font-semibold text-neutral-700 ring-1 ring-inset ring-neutral-200"
    >
      {letters}
    </span>
  );
}
