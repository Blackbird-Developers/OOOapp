import Image from "next/image";
import type { ReactNode } from "react";

/** The logo-over-card frame the sign-in, invite and sign-up pages share. */
const WIDTHS = { sm: "max-w-sm", md: "max-w-md", "3xl": "max-w-3xl" } as const;

/**
 * `wide` (or `width="md"`) for forms with more on them than a couple of
 * fields, like creating a company; `width="3xl"` for its policy editor.
 */
export default function AuthShell({
  children,
  wide = false,
  width,
}: {
  children: ReactNode;
  wide?: boolean;
  width?: keyof typeof WIDTHS;
}) {
  return (
    <div className="bg-app min-h-screen flex items-center justify-center p-4">
      <div className={`w-full ${WIDTHS[width ?? (wide ? "md" : "sm")]}`}>
        <div className="flex flex-col items-center gap-2 mb-8">
          <Image
            src="/blackbird-logo.svg"
            alt="Blackbird"
            width={140}
            height={24}
            priority
            className="h-6 w-auto"
          />
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500">Leave</span>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A dead end with one sentence of explanation: an expired link, a closed join link. */
export function AuthNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <AuthShell>
      <div className="card p-8 space-y-2 text-center">
        <h1 className="text-xl font-bold tracking-tight text-brand-ink">{title}</h1>
        <p className="text-sm text-neutral-500">{children}</p>
      </div>
    </AuthShell>
  );
}
