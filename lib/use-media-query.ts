"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query from React.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: the server has no
 * viewport, so it renders the `false` branch, and this hook corrects the client
 * during hydration without the mismatch warning a state-based version produces.
 *
 * Only for cases where the two layouts are genuinely different components. Any
 * difference CSS can express belongs in a Tailwind breakpoint, which costs no
 * JavaScript and no remount.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query]
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  );
}

/** Tailwind's `md` breakpoint — where the notebook stops being one column. */
export const useIsDesktop = () => useMediaQuery("(min-width: 768px)");
