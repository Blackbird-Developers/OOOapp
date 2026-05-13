import { SkeletonBlock, SkeletonHeader, SkeletonTable } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <SkeletonHeader width="w-48" subWidth="w-0" />
      <div className="flex gap-3 pb-5 mb-5 border-b border-slate-200">
        <SkeletonBlock className="h-16 w-40" />
        <SkeletonBlock className="h-16 w-40" />
      </div>
      <SkeletonTable rows={5} />
    </main>
  );
}
