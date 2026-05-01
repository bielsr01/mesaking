import { ReactNode, useEffect, useState } from "react";
import { ViewSkeleton } from "./ViewSkeleton";

/**
 * Wraps a tab's content. Shows a skeleton briefly so the user never sees a blank screen
 * before children mount and fetch their internal data.
 */
export function LazyView({
  viewKey,
  variant = "list",
  children,
  delayMs = 180,
}: {
  viewKey: string;
  variant?: "list" | "form" | "stats";
  children: ReactNode;
  delayMs?: number;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    const t = window.setTimeout(() => setReady(true), delayMs);
    return () => window.clearTimeout(t);
  }, [viewKey, delayMs]);

  if (!ready) return <ViewSkeleton variant={variant} />;
  return <div className="animate-fade-in">{children}</div>;
}
