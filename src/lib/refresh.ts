import { useEffect, useRef } from "react";

/**
 * Reload a page's data when the person comes back to the tab or window after a while (and every few
 * minutes while it stays open), so lists left open all day do not go stale. Typed-but-unsaved text is
 * safe: pages keep it in their own state, which a reload of the list does not reset.
 */
export function useRefreshOnReturn(reload: () => unknown, { minAwayMs = 45_000, everyMs = 3 * 60_000 } = {}) {
  const fn = useRef(reload);
  fn.current = reload;
  useEffect(() => {
    let last = Date.now();
    const run = (minAge: number) => {
      if (document.visibilityState !== "visible" || Date.now() - last < minAge) return;
      last = Date.now();
      fn.current();
    };
    const onShow = () => run(minAwayMs);
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    const timer = window.setInterval(() => run(everyMs), 30_000);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
      window.clearInterval(timer);
    };
  }, [minAwayMs, everyMs]);
}
