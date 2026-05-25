"use client";

import { useEffect, useRef, type ReactNode } from "react";

export default function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  initialFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer: ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  // Sync open prop with the native dialog's modal state.
  // showModal() gives us focus trap, Esc handling, and aria-modal for free.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      // Focus the requested element if provided, else let the browser pick
      // the first focusable inside the dialog (default <dialog> behavior).
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      }
    } else if (!open && el.open) {
      el.close();
    }
  }, [open, initialFocusRef]);

  // Esc fires the dialog's "cancel" event; intercept so React state stays
  // in sync. Backdrop click closes too.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    function handleCancel(e: Event) {
      e.preventDefault();
      onClose();
    }
    function handleClick(e: MouseEvent) {
      if (e.target === el) onClose();
    }
    el.addEventListener("cancel", handleCancel);
    el.addEventListener("click", handleClick);
    return () => {
      el.removeEventListener("cancel", handleCancel);
      el.removeEventListener("click", handleClick);
    };
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className="m-auto w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-neutral-200 bg-white p-0 shadow-2xl backdrop:bg-neutral-900/50 backdrop:backdrop-blur-[2px] open:animate-[dialog-in_140ms_cubic-bezier(.2,.7,.3,1)]"
    >
      <div className="p-5 sm:p-6">
        <h2 className="text-base font-semibold tracking-tight text-neutral-900">
          {title}
        </h2>
        {description && (
          <p className="mt-1.5 text-sm text-neutral-600">{description}</p>
        )}
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {footer}
        </div>
      </div>
    </dialog>
  );
}
