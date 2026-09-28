import Image from "next/image";
import type { ReactNode } from "react";

/** The logo-over-card frame the sign-in, invite and sign-up pages share. */
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="bg-app min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
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
