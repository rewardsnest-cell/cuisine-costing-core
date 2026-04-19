import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface PortalListSkeletonProps {
  /** Number of skeleton cards to show */
  count?: number;
  /** Optional sr-only label announced to screen readers */
  label?: string;
}

/**
 * Skeleton placeholder used by portal list pages (My Quotes, My Events,
 * Dashboard recent items) while data is loading. Matches the visual rhythm
 * of a stack of cards so layout doesn't shift when real data arrives.
 */
export function PortalListSkeleton({ count = 3, label = "Loading content" }: PortalListSkeletonProps) {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-16 rounded-full" />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <div className="space-y-2 text-right">
                <Skeleton className="h-5 w-20 ml-auto" />
                <Skeleton className="h-3 w-16 ml-auto" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
