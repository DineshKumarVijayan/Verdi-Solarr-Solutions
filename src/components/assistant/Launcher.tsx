import { AnimatePresence } from "motion/react";
import { MessageCircleQuestion, Sparkles, X } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router";
import type { Lang } from "../../../shared/assistant";
import { useCatalogue } from "../../lib/catalogue";
import { readStore, writeStore } from "../../lib/storage";
import { m } from "../motion";

// The panel and its engine load only when someone first opens the helper.
const CustomerHelper = lazy(() => import("./CustomerHelper"));
const StaffHelper = lazy(() => import("../../pages/admin/StaffHelper"));

const LANG_KEY = "verdi.helper.lang";
const HINT_KEY = "verdi.helper.hint";

function sessionFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return true; // no storage: never nag
  }
}
function setSessionFlag(key: string) {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}
/** Automated browsers (tests, screenshots) get no surprise pop-ups unless a test turns hints on. */
const hintsAllowed = () => typeof navigator === "undefined" || !navigator.webdriver || readStore<string>("verdi.helper.hints", "") === "on";

/** The floating "Ask VERDI" button (website) or "Helper" button (admin), with an optional one-time hint. */
export function HelperLauncher({ kind }: { kind: "customer" | "staff" }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [lang, setLangState] = useState<Lang>(() => (readStore<string>(LANG_KEY, "en") === "ta" ? "ta" : "en"));
  const [hint, setHint] = useState<{ text: string; starter: string | null } | null>(null);
  const [starter, setStarter] = useState<string | null>(null);
  const loc = useLocation();
  const { data, bySlug } = useCatalogue();
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    writeStore(LANG_KEY, l);
  }, []);

  // one gentle hint per visit: about the product on screen, or today's offers
  const slug = loc.pathname.match(/^\/products\/([^/]+)/)?.[1];
  const product = slug ? bySlug(decodeURIComponent(slug)) : undefined;
  const offers = data?.products.filter((p) => p.offer).length ?? 0;
  useEffect(() => {
    if (kind !== "customer" || open || sessionFlag(HINT_KEY) || !hintsAllowed()) return;
    const ta = lang === "ta";
    const next = product
      ? { text: ta ? "இந்த பொருள் பற்றி கேள்வியா? விலை, கையிருப்பு, datasheet — கேளுங்கள்." : "Questions about this product? Ask me for the price, stock or datasheet.", starter: null }
      : offers > 0
        ? { text: ta ? `இன்று ${offers} பொருட்களுக்கு சலுகை உள்ளது.` : `${offers} product${offers === 1 ? " is" : "s are"} on offer today.`, starter: ta ? "இன்றைய சலுகைகள்" : "Today's offers" }
        : null;
    if (!next) return;
    const t = window.setTimeout(() => setHint(next), 7000);
    return () => window.clearTimeout(t);
  }, [kind, open, lang, product, offers]);

  // other parts of the site can open the helper (e.g. "Ask VERDI Helper" on the FAQ page)
  useEffect(() => {
    if (kind !== "customer") return;
    const onOpen = (e: Event) => {
      setLoaded(true);
      setHint(null);
      setStarter((e as CustomEvent<string | null>).detail ?? null);
      setOpen(true);
    };
    window.addEventListener("vs:helper-open", onOpen);
    return () => window.removeEventListener("vs:helper-open", onOpen);
  }, [kind]);

  const dismissHint = () => {
    setHint(null);
    setSessionFlag(HINT_KEY);
  };
  const toggle = (withStarter: string | null = null) => {
    setLoaded(true);
    if (hint) dismissHint();
    setStarter(open ? null : withStarter);
    setOpen((o) => !o);
  };
  const close = useCallback(() => {
    setOpen(false);
    setStarter(null);
  }, []);

  const label = kind === "staff" ? (lang === "ta" ? "உதவி" : "Helper") : lang === "ta" ? "கேளுங்கள்" : "Ask VERDI";
  const Panel = kind === "staff" ? StaffHelper : CustomerHelper;

  return (
    <>
      <div className="helper-fab flex flex-col items-end gap-2" data-testid={`${kind}-helper-fab`}>
        <AnimatePresence>
          {hint && !open && (
            <m.div
              key="hint"
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.97 }}
              className="relative w-60 max-w-[calc(100vw-2rem)] rounded-2xl rounded-br-md border border-line bg-card p-3 pr-9 text-sm text-ink shadow-[var(--shadow-lift)]"
              role="status"
              data-testid="helper-hint"
            >
              <button type="button" className="text-left" onClick={() => toggle(hint.starter)}>
                {hint.text}
              </button>
              <button type="button" onClick={dismissHint} className="absolute top-1 right-1 grid size-8 place-items-center rounded-full text-muted hover:bg-paper-2" aria-label="Dismiss">
                <X className="size-4" />
              </button>
            </m.div>
          )}
        </AnimatePresence>
        <m.button
          type="button"
          onClick={() => toggle()}
          aria-expanded={open}
          aria-label={open ? "Close helper" : kind === "staff" ? "Open the staff helper" : "Ask VERDI: quick answers about products, prices and contact"}
          className="group relative flex size-13 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-verdi-600 to-emerald-500 font-semibold text-white shadow-[0_12px_30px_-8px_rgba(16,120,70,0.6)] ring-1 ring-white/30 lg:h-13 lg:w-auto lg:px-5"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.94 }}
          data-testid={`${kind}-helper-open`}
        >
          <span className="helper-glow pointer-events-none absolute -inset-1 -z-10 rounded-full bg-emerald-400/40 blur-md" aria-hidden="true" />
          <AnimatePresence mode="wait" initial={false}>
            <m.span key={open ? "x" : "s"} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.18 }} className="grid place-items-center">
              {open ? <X className="size-6 lg:size-5" /> : kind === "staff" ? <MessageCircleQuestion className="size-6 lg:size-5" /> : <Sparkles className="size-6 lg:size-5" />}
            </m.span>
          </AnimatePresence>
          <span className="hidden text-sm lg:inline">{label}</span>
        </m.button>
      </div>
      {loaded && (
        <Suspense fallback={null}>
          <Panel open={open} onClose={close} lang={lang} setLang={setLang} starter={starter} />
        </Suspense>
      )}
    </>
  );
}
