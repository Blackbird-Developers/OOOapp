import { SkeletonBlock, SkeletonCard } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <SkeletonBlock className="h-3 w-32 mb-5" />
      <SkeletonCard className="h-96" />
    </main>
  );
}
