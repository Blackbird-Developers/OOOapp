import { SkeletonHeader, SkeletonTable } from "@/components/Skeleton";

export default function Loading() {
  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <SkeletonHeader />
      <SkeletonTable rows={6} />
    </main>
  );
}
