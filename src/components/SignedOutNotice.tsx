import { AnimatePresence } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { IDLE_MINUTES } from "../../shared/session";
import { m } from "./motion";

type Detail = { who: "customer" | "staff"; reason: "manual" | "idle" };

/**
 * A short, friendly "Signed out" card after anyone signs out (customer or staff), with a drawn tick.
 */
export function SignedOutNotice() {
  const [shown, setShown] = useState<Detail | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      setShown((e as CustomEvent<Detail>).detail ?? { who: "customer", reason: "manual" });
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setShown(null), (e as CustomEvent<Detail>).detail?.reason === "idle" ? 5000 : 2600);
    };
    window.addEventListener("vs:signed-out", on);
    return () => {
      window.removeEventListener("vs:signed-out", on);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  return (
    <AnimatePresence>
      {shown && (
        <m.div
          key="signed-out"
          className="fixed inset-x-0 top-20 z-[70] flex justify-center px-4 lg:top-24"
          initial={{ opacity: 0, y: -24, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.97, transition: { duration: 0.2 } }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
        >
          <button
            type="button"
            onClick={() => setShown(null)}
            role="status"
            aria-live="polite"
            className="flex w-full max-w-sm items-center gap-3.5 rounded-3xl border border-line bg-card/95 p-4 text-left shadow-[0_24px_60px_-18px_rgba(10,30,20,0.45)] backdrop-blur-md"
            data-testid="signed-out-notice"
          >
            <span className="relative grid size-12 shrink-0 place-items-center rounded-2xl bg-verdi-50 text-verdi-700">
              <svg viewBox="0 0 48 48" className="absolute inset-0 size-12" aria-hidden="true">
                <m.circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" initial={{ pathLength: 0, rotate: -90 }} animate={{ pathLength: 1 }} transition={{ duration: 0.55, ease: "easeOut" }} style={{ originX: "50%", originY: "50%" }} />
                <m.path d="M16 24.5l5.5 5.5L32.5 19" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.45, duration: 0.35, ease: "easeOut" }} />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{shown.reason === "idle" ? "Signed out for your safety" : "You're signed out"}</span>
              <span className="mt-0.5 block text-sm text-muted">
                {shown.reason === "idle" ? `No activity for ${IDLE_MINUTES} minutes. See you next time.` : "See you next time."}
              </span>
            </span>
          </button>
        </m.div>
      )}
    </AnimatePresence>
  );
}
