import { SkeletonCard, SkeletonHeader, SkeletonTable } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <SkeletonHeader />
      <SkeletonCard className="h-40" />
      <div className="mt-8">
        <SkeletonTable rows={4} />
      </div>
    </main>
  );
}
