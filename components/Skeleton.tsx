export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200/70 ${className}`} />;
}

export function SkeletonHeader({
  width = "w-56",
  subWidth = "w-72",
}: {
  width?: string;
  subWidth?: string;
}) {
  return (
    <header className="mb-6">
      <SkeletonBlock className={`h-8 ${width}`} />
      <SkeletonBlock className={`mt-2 h-4 ${subWidth}`} />
    </header>
  );
}

export function SkeletonCard({ className = "h-64" }: { className?: string }) {
  return (
    <section className="card p-4 sm:p-6">
      <SkeletonBlock className={className} />
    </section>
  );
}

export function SkeletonTable({ rows = 4 }: { rows?: number }) {
  return (
    <section className="card p-4 sm:p-6">
      <SkeletonBlock className="h-4 w-32 mb-5" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <SkeletonBlock className="h-4 w-1/4" />
            <SkeletonBlock className="h-4 w-1/4" />
            <SkeletonBlock className="h-4 w-1/3" />
            <SkeletonBlock className="h-4 w-16 ml-auto" />
          </div>
        ))}
      </div>
    </section>
  );
}
