import { SkeletonCard, SkeletonHeader } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <SkeletonHeader />
      <SkeletonCard className="h-72" />
    </main>
  );
}
