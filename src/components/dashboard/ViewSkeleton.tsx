import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ViewSkeleton({ variant = "list" }: { variant?: "list" | "form" | "stats" }) {
  if (variant === "stats") {
    return (
      <div className="grid gap-4 md:grid-cols-3 animate-fade-in">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6 flex items-center gap-4">
              <Skeleton className="w-12 h-12 rounded-xl" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (variant === "form") {
    return (
      <div className="space-y-4 max-w-3xl animate-fade-in">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // list
  return (
    <div className="space-y-3 animate-fade-in">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-4 flex items-center gap-4">
            <Skeleton className="w-12 h-12 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-8 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
