import { SkeletonCard, SkeletonHeader } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <SkeletonHeader />
      <div className="space-y-6">
        <SkeletonCard className="h-24" />
        <SkeletonCard className="h-72" />
        <SkeletonCard className="h-48" />
      </div>
    </main>
  );
}
