import { useEffect, useState } from "react";

const QUERY = "(min-width: 768px)";

/**
 * Tracks a discrete breakpoint crossing (matchMedia's change event), not raw
 * viewport pixels — checking innerWidth on every resize tick misfires during
 * an in-progress device rotation, when width and height briefly disagree.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const listener = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }, []);

  return isDesktop;
}
