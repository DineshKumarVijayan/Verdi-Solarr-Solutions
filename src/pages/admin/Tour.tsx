import { AnimatePresence } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import type { AdminIdentity } from "../../../shared/types";
import { m } from "../../components/motion";
import { readStore, writeStore } from "../../lib/storage";
import { ADMIN_NAV, navAllowed } from "./nav";

/*
 * First-visit guided tour of the admin. A spotlight glides from feature to feature and a card explains
 * what it is and why it helps. Steps follow the person's role (sales staff never hear about owner pages)
 * and the screen (phone tab bar vs desktop menu). Skip at any step; replay with "Take the tour".
 * Seen-state is per person per device (localStorage). Automated browsers (tests, video capture) never get
 * it unless a test sets verdi.tour = "on".
 */

const SEEN = (id: number) => `verdi.tour.v1.${id}`;
export const startTour = () => window.dispatchEvent(new Event("vs:tour-start"));

type Step = { id: string; title: string; body: string; target?: string[] };

const isPhone = () => window.matchMedia("(max-width: 1023.98px)").matches;
const navLink = (to: string) => (isPhone() ? [`[data-testid="admin-tab-bar"] a[href^="${to}"]`, `[data-testid="admin-tab-more"]`] : [`nav[aria-label="Admin"] a[href^="${to}"]`]);

function stepsFor(admin: AdminIdentity): Step[] {
  const allowed = (to: string) => {
    const n = ADMIN_NAV.find((x) => x.to === to);
    return !!n && navAllowed(n, admin.role);
  };
  const mgr = admin.role === "owner" || admin.role === "admin";
  const first = admin.displayName?.split(" ")[0];
  const s: Step[] = [
    { id: "welcome", title: `Welcome${first ? `, ${first}` : ""}!`, body: "A one-minute tour of where everything is. You can skip it now and replay it any time from “Take the tour”." },
    { id: "myday", title: "My day", body: "Your to-do list for today: overdue follow-ups, calls due today, new enquiries nobody has taken and quotations about to expire. Tap a counter to open that exact list.", target: ['[data-testid="my-day"]'] },
  ];
  if (isPhone()) s.push({ id: "log", title: "Log an enquiry", body: "A customer called or messaged? Record it here in under a minute so it never gets lost.", target: ['[data-testid="m-log-enquiry"]'] });
  s.push(
    { id: "enquiries", title: "Enquiries", body: "Every customer request in one place. Each moves New → Contacted → Quoted → Won or Not won, with follow-up dates and ready WhatsApp messages.", target: navLink("/admin/enquiries") },
    { id: "quotes", title: "Quotations", body: "Build a quotation from the catalogue in a few taps. Prices come from the system, and it becomes a professional PDF you can send on WhatsApp.", target: navLink("/admin/quotations") },
    { id: "products", title: "Products", body: mgr ? "Add or edit products, photos, datasheets, stock and offers. Changes reach the website straight away." : "Look up any product: specifications, datasheets, stock and offers, to answer customers quickly.", target: navLink("/admin/products") },
  );
  if (allowed("/admin/prices")) {
    // only owner, admin and price editors may change prices (the server enforces this too)
    const edits = mgr || admin.role === "price_editor";
    s.push({
      id: "prices",
      title: "Prices",
      body: edits
        ? "Set selling price and MRP. Every change is kept in the price history, so you always know who changed what."
        : "See the current selling price and MRP of every product, to answer customers quickly. Prices are set by the owner or an admin.",
      target: navLink("/admin/prices"),
    });
  }
  if (allowed("/admin/performance")) s.push({ id: "performance", title: "Performance & bonus", body: "See each staff member’s enquiries, quotations and wins, and approve and pay their sales bonus.", target: navLink("/admin/performance") });
  if (allowed("/admin/customers")) s.push({ id: "customers", title: "Customers & loyalty", body: "Registered customers, their enquiries and the loyalty points they earn on every sale.", target: navLink("/admin/customers") });
  if (allowed("/admin/my-bonus")) s.push({ id: "mybonus", title: "My bonus", body: "What you earned on every sale you won, and when it was paid.", target: navLink("/admin/my-bonus") });
  if (allowed("/admin/users")) s.push({ id: "staff", title: "Staff", body: "Add staff with a mobile number and a temporary password, choose their role, or switch an account off.", target: navLink("/admin/users") });
  s.push(
    { id: "helper", title: "Stuck? Ask the helper", body: "Ask things like “how do I send a quotation” or “my day”. It explains the steps and opens the right page, and only shows what your role allows.", target: ['[data-testid="staff-helper-open"]'] },
    { id: "done", title: "You’re all set!", body: "That’s the tour. Hover over any icon to see what it does, and replay this tour any time from “Take the tour”." },
  );
  return s;
}

function visibleTarget(sel?: string[]): HTMLElement | null {
  for (const q of sel ?? []) {
    for (const el of document.querySelectorAll<HTMLElement>(q)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden") return el;
    }
  }
  return null;
}

type Box = { x: number; y: number; w: number; h: number };
const PAD = 8;

export function AdminTour({ admin }: { admin: AdminIdentity }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const steps = useMemo(() => (open ? stepsFor(admin) : []), [open, admin]);
  const step = steps[i];
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(220);

  // first visit to the dashboard: start once (per person, per device)
  useEffect(() => {
    if (pathname !== "/admin" || readStore<string>(SEEN(admin.id), "")) return;
    if (navigator.webdriver && readStore<string>("verdi.tour", "") !== "on") return;
    const t = window.setTimeout(() => (setI(0), setOpen(true)), 900); // let the dashboard settle first
    return () => window.clearTimeout(t);
  }, [pathname, admin.id]);

  // "Take the tour" from the header or the More sheet
  useEffect(() => {
    const go = () => (setI(0), setOpen(true));
    window.addEventListener("vs:tour-start", go);
    return () => window.removeEventListener("vs:tour-start", go);
  }, []);

  const close = useCallback(() => {
    writeStore(SEEN(admin.id), "1");
    setOpen(false);
  }, [admin.id]);

  // measure the highlighted feature (and follow scrolling / resizing)
  useLayoutEffect(() => {
    if (!open || !step) return;
    let raf = 0;
    const el = visibleTarget(step.target);
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.height > window.innerHeight * 0.5) window.scrollTo({ top: Math.max(0, r.top + window.scrollY - 72), behavior: "smooth" }); // tall: show its top
      else if (r.top < 70 || r.bottom > window.innerHeight - 90) el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setVp({ w: window.innerWidth, h: window.innerHeight });
        const t = visibleTarget(step.target);
        if (!t) return setBox(null);
        const r = t.getBoundingClientRect();
        setBox({ x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 });
      });
    };
    measure();
    const late = window.setTimeout(measure, 450); // after smooth scrolling
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(late);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, step]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [i, open, box]);

  // keyboard: → next, ← back, Esc skip
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") setI((n) => Math.min(n + 1, steps.length - 1));
      else if (e.key === "ArrowLeft") setI((n) => Math.max(n - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, steps.length]);

  if (!open || !step) return null;
  const last = i === steps.length - 1;
  const underMore = !!step.target && step.target.length > 1 && isPhone() && !visibleTarget([step.target[0]]);
  const centred = !box;
  const cardW = Math.min(360, vp.w - 32);
  // card next to the spotlight: below when there is room, otherwise above; centred when nothing to point at
  let top = vp.h / 2 - cardH / 2;
  let left = vp.w / 2 - cardW / 2;
  if (box && box.h > vp.h * 0.5) {
    // a tall feature fills the screen: the card docks at the bottom, the feature's top stays visible
    top = vp.h - cardH - 16;
    left = vp.w / 2 - cardW / 2;
  } else if (box) {
    const below = box.y + box.h + 14;
    top = below + cardH < vp.h - 12 ? below : Math.max(12, box.y - cardH - 14);
    if (top + cardH > vp.h - 12 && box.y < vp.h / 2) top = Math.max(12, vp.h - cardH - 12);
    left = Math.min(Math.max(16, box.x + box.w / 2 - cardW / 2), vp.w - cardW - 16);
  }

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-labelledby="tour-title" data-testid="admin-tour">
      {/* blocks the page while touring; the dimming comes from the spotlight's shadow */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
      <m.div
        aria-hidden="true"
        className="pointer-events-none absolute rounded-2xl"
        initial={false}
        animate={
          box
            ? { left: box.x, top: box.y, width: box.w, height: box.h, opacity: 1, boxShadow: "0 0 0 9999px rgba(10,24,34,0.62)" }
            : { left: vp.w / 2, top: vp.h / 2, width: 0, height: 0, opacity: 1, boxShadow: "0 0 0 9999px rgba(10,24,34,0.7)" }
        }
        transition={{ type: "spring", stiffness: 170, damping: 24 }}
      >
        {box && <span className="tour-ring absolute -inset-1 rounded-[20px] ring-2 ring-sun-400" />}
      </m.div>

      <AnimatePresence mode="wait">
        <m.div
          key={step.id}
          ref={cardRef}
          className="absolute overflow-hidden rounded-3xl bg-card text-ink shadow-[0_30px_70px_-20px_rgba(10,24,34,0.6)] ring-1 ring-black/5"
          style={{ width: cardW, left, top }}
          initial={{ opacity: 0, y: 14, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.14 } }}
          transition={{ type: "spring", stiffness: 260, damping: 24 }}
        >
          {/* progress */}
          <div className="h-1 bg-paper-2">
            <m.div className="h-full bg-gradient-to-r from-verdi-600 to-emerald-400" initial={false} animate={{ width: `${((i + 1) / steps.length) * 100}%` }} transition={{ duration: 0.35 }} />
          </div>
          <div className="p-5">
            <div className="flex items-start gap-3">
              <m.span
                className={`grid size-10 shrink-0 place-items-center rounded-2xl ${last ? "bg-verdi-600 text-white" : centred ? "bg-gradient-to-br from-verdi-600 to-emerald-500 text-white" : "bg-verdi-50 text-verdi-700"}`}
                initial={{ rotate: -12, scale: 0.7 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.05 }}
              >
                {last ? <Check className="size-5" /> : centred ? <Sparkles className="size-5" /> : <span className="num text-sm font-semibold">{i}</span>}
              </m.span>
              <div className="min-w-0 flex-1">
                <h2 id="tour-title" className="text-lg leading-snug font-semibold">
                  {step.title}
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {step.body}
                  {underMore && <span className="font-medium text-ink"> On your phone it is under More.</span>}
                </p>
              </div>
              <button type="button" onClick={close} className="tap -mt-2 -mr-2 grid shrink-0 place-items-center rounded-full text-muted hover:bg-paper-2 lg:size-9 lg:min-h-0" aria-label="Close the tour" data-testid="tour-close">
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <div className="flex flex-1 items-center gap-1" aria-label={`Step ${i + 1} of ${steps.length}`}>
                {steps.map((s, k) => (
                  <span key={s.id} className={`h-1.5 rounded-full transition-all duration-300 ${k === i ? "w-5 bg-verdi-600" : k < i ? "w-1.5 bg-verdi-300" : "w-1.5 bg-line"}`} />
                ))}
              </div>
              {i === 0 ? (
                <button type="button" onClick={close} className="btn-ghost btn-sm max-lg:tap" data-testid="tour-skip">
                  Not now
                </button>
              ) : (
                <button type="button" onClick={() => setI(i - 1)} className="btn-ghost btn-sm max-lg:tap" aria-label="Back">
                  <ArrowLeft className="size-4" />
                </button>
              )}
              <button type="button" onClick={() => (last ? close() : setI(i + 1))} className="btn-primary btn-sm max-lg:tap" data-testid="tour-next" autoFocus>
                {i === 0 ? "Start tour" : last ? "Finish" : "Next"} {!last && <ArrowRight className="size-4" />}
              </button>
            </div>
            {i > 0 && !last && (
              <button type="button" onClick={close} className="mt-2 text-xs font-medium text-muted underline-offset-2 hover:underline max-lg:min-h-9" data-testid="tour-skip">
                Skip tour
              </button>
            )}
          </div>
        </m.div>
      </AnimatePresence>
    </div>
  );
}
