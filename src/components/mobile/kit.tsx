import { ChevronDown, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/* Mobile-app building blocks. They are meant for screens below lg (1024 px); the desktop
 * layout never renders them, or hides them with lg:hidden, so desktop stays unchanged. */

/**
 * Bottom sheet on the native <dialog> (focus trap, Escape, focus returns to the opener).
 * Slides up from the bottom; drag the handle down (or tap the backdrop) to close.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  testId,
  full = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
  /** take the whole screen (search, long editors) */
  full?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const titleId = useId();
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const [dy, setDy] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCloseEvt = () => {
      document.documentElement.style.overflow = "";
      setDy(0);
      const el = opener.current as HTMLElement | null;
      if (el && typeof el.focus === "function") el.focus({ preventScroll: true });
    };
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    d.addEventListener("close", onCloseEvt);
    d.addEventListener("cancel", onCancel);
    return () => {
      d.removeEventListener("close", onCloseEvt);
      d.removeEventListener("cancel", onCancel);
    };
  }, [onClose]);

  useEffect(() => () => void (document.documentElement.style.overflow = ""), []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      data-testid={testId}
      className={`sheet motion-safe:open:animate-[sheet-up_0.28s_cubic-bezier(0.2,0.8,0.2,1)] ${full ? "h-[100dvh] max-h-[100dvh] rounded-none" : ""}`}
      style={dy ? { transform: `translateY(${dy}px)` } : undefined}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <div className={`flex max-h-[inherit] flex-col ${full ? "h-full" : ""}`}>
          <div
            className="touch-none px-5 pt-2"
            onPointerDown={(e) => (drag.current = { y: e.clientY, dy: 0 })}
            onPointerMove={(e) => {
              if (!drag.current) return;
              drag.current.dy = Math.max(0, e.clientY - drag.current.y);
              setDy(drag.current.dy);
            }}
            onPointerUp={() => {
              const moved = drag.current?.dy ?? 0;
              drag.current = null;
              if (moved > 90) onClose();
              else setDy(0);
            }}
            onPointerCancel={() => ((drag.current = null), setDy(0))}
          >
            <span aria-hidden className="mx-auto block h-1.5 w-10 rounded-full bg-line" />
            <div className="flex items-center justify-between gap-3 py-2">
              <h2 id={titleId} className="truncate text-lg font-semibold">
                {title}
              </h2>
              <button type="button" onClick={onClose} className="tap -mr-2 grid place-items-center rounded-full text-muted" aria-label="Close">
                <X className="size-5" />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
          {footer && <div className="border-t border-line/70 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/** A titled group of big tap tiles inside a "More" sheet. */
export function SheetGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 first:mt-1">
      <h3 className="eyebrow mb-2 !text-subtle">{title}</h3>
      <div className="grid grid-cols-3 gap-2">{children}</div>
    </section>
  );
}

/** Compact list row: thumbnail, one-line title, grey subtitle, something on the right. */
export function ListRowBody({ thumb, title, subtitle, right }: { thumb?: ReactNode; title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <>
      {thumb}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-xs text-muted">{subtitle}</span>}
      </span>
      {right && <span className="shrink-0">{right}</span>}
    </>
  );
}

/** One-tap filter chips in a sideways row (the page itself never scrolls sideways). */
export function ChipRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div role="group" aria-label={label} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 py-1">
      {children}
    </div>
  );
}

/**
 * Tabs on phones, everything stacked on desktop. All panels stay in the HTML (hidden only with
 * CSS below lg), so search engines and desktop visitors still get every section.
 */
export function MobileTabs({ tabs, initial, top = "top-14", testId }: { tabs: { id: string; label: ReactNode; dot?: boolean; panel: ReactNode }[]; initial?: string; top?: string; testId?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id);
  const base = useId();
  return (
    <div data-testid={testId}>
      <div role="tablist" className={`m-tabs ${top} lg:hidden`}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${base}-${t.id}-tab`}
            aria-controls={`${base}-${t.id}`}
            aria-selected={active === t.id}
            className="m-tab relative"
            onClick={() => setActive(t.id)}
          >
            {t.label}
            {t.dot && <span aria-label="needs attention" className="absolute top-2.5 right-0.5 size-2 rounded-full bg-sun-500" />}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} id={`${base}-${t.id}`} role="tabpanel" aria-labelledby={`${base}-${t.id}-tab`} className={active === t.id ? "" : "max-lg:hidden"}>
          {t.panel}
        </div>
      ))}
    </div>
  );
}

/** Native <details> accordion: content is always in the HTML. */
export function Accordion({ title, children, open, className = "" }: { title: ReactNode; children: ReactNode; open?: boolean; className?: string }) {
  return (
    <details className={`m-acc group ${className}`} open={open}>
      <summary>
        <span className="min-w-0 font-semibold">{title}</span>
        <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180" />
      </summary>
      <div className="pb-3">{children}</div>
    </details>
  );
}

/** Sticky bottom action bar (sits above the tab bar) for the main action on a page. Phones only. */
export function ActionBar({ children, testId, aboveTabs = true }: { children: ReactNode; testId?: string; aboveTabs?: boolean }) {
  return (
    <div className={`action-bar lg:hidden ${aboveTabs ? "" : "!bottom-0 pb-[calc(0.625rem+env(safe-area-inset-bottom))]"}`} data-testid={testId}>
      {children}
    </div>
  );
}

/**
 * Pull-to-refresh for data lists on touch phones: pull down at the top of the page past 70 px.
 * Returns an indicator to render at the top of the list.
 */
export function usePullToRefresh(onRefresh: () => unknown) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;
  useEffect(() => {
    if (!window.matchMedia("(max-width: 1023.98px) and (pointer: coarse)").matches) return;
    let start: number | null = null;
    let dist = 0;
    const down = (e: TouchEvent) => {
      start = window.scrollY <= 0 && !document.querySelector("dialog[open]") ? e.touches[0].clientY : null;
      dist = 0;
    };
    const move = (e: TouchEvent) => {
      if (start === null) return;
      dist = Math.max(0, Math.min(110, e.touches[0].clientY - start));
      setPull(dist);
    };
    const up = async () => {
      if (start !== null && dist > 70) {
        setBusy(true);
        try {
          await cb.current();
        } finally {
          setBusy(false);
        }
      }
      start = null;
      setPull(0);
    };
    window.addEventListener("touchstart", down, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("touchstart", down);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", up);
    };
  }, []);
  const indicator =
    pull > 10 || busy ? (
      <div className="flex justify-center py-2 lg:hidden" role="status" aria-live="polite">
        <span className="rounded-full bg-card px-3 py-1 text-xs font-medium text-muted shadow-[var(--shadow-soft)]">{busy ? "Refreshing…" : pull > 70 ? "Release to refresh" : "Pull to refresh"}</span>
      </div>
    ) : null;
  return indicator;
}

/** True below lg (1024 px). Lets a page pick a bottom sheet on phones and its usual modal on desktop. */
export function useIsPhone() {
  const q = "(max-width: 1023.98px)";
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setPhone(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return phone;
}

/** Swipe a list row left to remove it (phones). Spread the returned props onto the row element. */
export function useSwipeToRemove(onRemove: () => void) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => void (start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }),
    onTouchMove: (e: React.TouchEvent) => {
      if (!start.current) return;
      const x = e.touches[0].clientX - start.current.x;
      const y = e.touches[0].clientY - start.current.y;
      if (Math.abs(y) > Math.abs(x)) return; // vertical scroll wins
      setDx(Math.min(0, x));
    },
    onTouchEnd: () => {
      start.current = null;
      if (dx < -110) onRemove();
      setDx(0);
    },
    style: dx ? { transform: `translateX(${dx}px)`, opacity: Math.max(0.35, 1 + dx / 220) } : undefined,
  };
}

/** Intro text clamped to 2 lines on phones with "Show more"; full text on desktop. */
export function ClampText({ children, className = "" }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <div className={open ? "" : "max-lg:line-clamp-2"}>{children}</div>
      {!open && (
        <button type="button" className="mt-1 text-sm font-semibold text-verdi-700 lg:hidden" onClick={() => setOpen(true)}>
          Show more
        </button>
      )}
    </div>
  );
}
