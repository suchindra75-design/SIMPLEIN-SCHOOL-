import type { TransitionStartFunction } from "react";

/**
 * "Try again" for error boundaries. `reset()` alone re-renders the boundary from
 * the cached server payload, so a failed server render fails again. Refreshing
 * first re-requests the route segment; both run in one transition so the
 * boundary resets once the fresh payload arrives.
 */
export function retryAfterRefresh(
  startTransition: TransitionStartFunction,
  refresh: () => void,
  reset: () => void,
): void {
  startTransition(() => {
    refresh();
    reset();
  });
}
