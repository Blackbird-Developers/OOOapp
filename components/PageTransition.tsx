"use client";

import { usePathname } from "next/navigation";

export default function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Keying on the path forces React to remount on navigation, which
  // re-fires the CSS keyframe animation defined on `.page-fade`.
  return (
    <div key={pathname} className="page-fade">
      {children}
    </div>
  );
}
