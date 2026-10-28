import type { ReactNode } from "react";

/**
 * Legacy compatibility wrapper.
 * The deployment frontend is public, informative and read-only; it does not
 * mount the starter dashboard or provide an authentication entry point.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
