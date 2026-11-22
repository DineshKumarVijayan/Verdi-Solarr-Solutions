import { AnimatePresence } from "motion/react";
import { ArrowUpRight, ChevronDown, Languages, SendHorizontal, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { HelperAnswer, HelperLink, Lang } from "../../../shared/assistant";
import { m } from "../motion";

/* The chat panel shared by the website helper and the staff helper. It only shows answers worked out
 * in the browser from data the person may already see; it has no "send" to the server. */

interface Msg {
  id: number;
  me?: string;
  bot?: HelperAnswer;
}

const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

function LinkPill({ l, onNavigate }: { l: HelperLink; onNavigate: () => void }) {
  const cls = "inline-flex min-h-10 max-w-full items-center gap-1 rounded-full border border-verdi-200 bg-verdi-50 px-3.5 text-[13px] font-medium text-verdi-800 transition hover:border-verdi-400 hover:bg-verdi-100 max-lg:min-h-11";
  if (l.to.startsWith("/"))
    return (
      <Link to={l.to} className={cls} onClick={onNavigate} data-testid="helper-link">
        <span className="truncate">{l.label}</span>
      </Link>
    );
  const external = l.to.startsWith("http");
  return (
    <a href={l.to} className={cls} {...(external ? { target: "_blank", rel: "noopener" } : {})} data-testid="helper-link">
      <span className="truncate">{l.label}</span>
      {external && <ArrowUpRight className="size-3.5 shrink-0" />}
    </a>
  );
}

function Typing() {
  return (
    <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-paper-2 px-3.5 py-3 w-fit" aria-hidden="true" data-testid="helper-typing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted/70 motion-reduce:animate-none" style={{ animationDelay: `${i * 0.12}s`, animationDuration: "0.9s" }} />
      ))}
    </div>
  );
}

export function ChatShell({
  open,
  onClose,
  session,
  onEnd,
  title,
  subtitle,
  lang,
  setLang,
  welcome,
  answer,
  extras,
  note,
  testId,
  starter,
}: {
  open: boolean;
  /** minimise: hide the panel and keep the conversation */
  onClose: () => void;
  /** changes when the conversation is ended (the next opening starts afresh) */
  session: number;
  /** end the conversation and close */
  onEnd: () => void;
  title: string;
  subtitle: string;
  lang: Lang;
  setLang: (l: Lang) => void;
  welcome: () => HelperAnswer;
  answer: (q: string) => HelperAnswer;
  /** product cards, the person's own points/enquiries, My day… */
  extras?: (a: HelperAnswer, close: () => void) => ReactNode;
  note: string;
  testId: string;
  /** a question to ask as soon as the panel opens (from a hint) */
  starter?: string | null;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const seq = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [desktop, setDesktop] = useState(isDesktop);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setDesktop(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // minimising keeps the conversation; ending it (or switching language) starts afresh
  const welcomeRef = useRef(welcome);
  welcomeRef.current = welcome;
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    setTyping(false);
    setText("");
    setMsgs([{ id: ++seq.current, bot: welcomeRef.current() }]);
  }, [lang, session]);

  const ask = useCallback(
    (q: string) => {
      const v = q.trim().slice(0, 300);
      if (!v) return;
      setMsgs((ms) => [...ms, { id: ++seq.current, me: v }]);
      setText("");
      setTyping(true);
      if (timer.current) window.clearTimeout(timer.current);
      // a short, natural pause before the answer
      timer.current = window.setTimeout(() => {
        setTyping(false);
        setMsgs((ms) => [...ms, { id: ++seq.current, bot: answer(v) }]);
      }, 420);
    },
    [answer],
  );
  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);

  useEffect(() => {
    if (open && starter) ask(starter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, starter]);

  // keep the newest message in view
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  // focus, Escape, and no background scrolling on phones
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => input.current?.focus({ preventScroll: true }), 250);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const lock = !desktop;
    if (lock) document.documentElement.style.overflow = "hidden";
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      if (lock) document.documentElement.style.overflow = "";
    };
  }, [open, desktop, onClose]);

  const closeOnPhone = () => {
    if (!isDesktop()) onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {!desktop && <m.div key="backdrop" className="fixed inset-0 z-50 bg-ink/45 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden="true" />}
          <m.section
            key="panel"
            role="dialog"
            aria-modal={!desktop}
            aria-labelledby={titleId}
            className="fixed z-50 flex flex-col overflow-hidden border border-line bg-card shadow-[0_30px_80px_-20px_rgba(10,30,20,0.45)] max-lg:inset-x-0 max-lg:top-[6vh] max-lg:bottom-0 max-lg:rounded-t-[1.75rem] lg:right-24 lg:bottom-24 lg:h-[min(40rem,calc(100vh-8rem))] lg:w-[25rem] lg:origin-bottom-right lg:rounded-[1.75rem]"
            initial={desktop ? { opacity: 0, scale: 0.9, y: 18 } : { y: "100%" }}
            animate={desktop ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
            exit={desktop ? { opacity: 0, scale: 0.94, y: 12, transition: { duration: 0.18 } } : { y: "100%", transition: { duration: 0.25 } }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            data-testid={testId}
          >
            {/* header */}
            <header className="relative shrink-0 overflow-hidden bg-gradient-to-br from-verdi-700 via-verdi-600 to-emerald-500 px-4 pt-3 pb-4 text-white">
              <div className="pointer-events-none absolute -top-16 -right-10 size-40 rounded-full bg-sun-300/30 blur-2xl" aria-hidden="true" />
              <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/40 lg:hidden" aria-hidden="true" />
              <div className="relative flex items-center gap-3">
                <span className="relative grid size-11 shrink-0 place-items-center rounded-2xl bg-white/15 ring-1 ring-white/30 max-[379px]:hidden">
                  <Sparkles className="size-5" />
                  <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-verdi-600 bg-lime-300" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id={titleId} className="truncate text-base leading-tight font-semibold">
                    {title}
                  </h2>
                  <p className="truncate text-xs text-white/80">{subtitle}</p>
                </div>
                <div className="flex shrink-0 items-center rounded-full bg-white/15 p-0.5 text-xs ring-1 ring-white/25" role="group" aria-label="Language">
                  <Languages className="mx-1 size-3.5 opacity-80 max-[340px]:hidden" aria-hidden="true" />
                  {(["en", "ta"] as const).map((l) => (
                    <button key={l} type="button" onClick={() => setLang(l)} aria-pressed={lang === l} className={`min-h-9 rounded-full px-2.5 font-medium transition ${lang === l ? "bg-white text-verdi-800" : "text-white/85 hover:text-white"}`} data-testid={`helper-lang-${l}`}>
                      {l === "en" ? "EN" : "தமிழ்"}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-white/15" aria-label={lang === "ta" ? "சிறிதாக்கு (உரையாடல் இருக்கும்)" : "Minimise (keeps the conversation)"} title={lang === "ta" ? "சிறிதாக்கு" : "Minimise"} data-testid="helper-minimise">
                  <ChevronDown className="size-5" />
                </button>
                <button type="button" onClick={onEnd} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-white/15" aria-label={lang === "ta" ? "உரையாடலை முடி" : "End chat"} title={lang === "ta" ? "உரையாடலை முடி" : "End chat"} data-testid="helper-end">
                  <X className="size-5" />
                </button>
              </div>
            </header>

            {/* conversation */}
            <div ref={list} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-gradient-to-b from-paper/60 to-card px-3.5 py-4" aria-live="polite" data-testid="helper-messages">
              {msgs.map((msg) => (
                <m.div key={msg.id} initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 380, damping: 30 }} className={msg.me ? "flex justify-end" : ""}>
                  {msg.me ? (
                    <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-sm break-words text-paper" data-testid="helper-me">
                      {msg.me}
                    </p>
                  ) : (
                    <div className="space-y-2" data-testid="helper-bot" data-miss={msg.bot!.miss ? "1" : undefined}>
                      <p className="max-w-[92%] rounded-2xl rounded-bl-md border border-line/70 bg-card px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-line shadow-[0_1px_0_rgba(0,0,0,0.03)]">{msg.bot!.text}</p>
                      {extras?.(msg.bot!, closeOnPhone)}
                      {!!msg.bot!.links?.length && (
                        <div className="flex flex-wrap gap-1.5">
                          {msg.bot!.links.map((l) => (
                            <LinkPill key={l.to + l.label} l={l} onNavigate={closeOnPhone} />
                          ))}
                        </div>
                      )}
                      {!!msg.bot!.chips?.length && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5" data-testid="helper-chips">
                          {msg.bot!.chips.map((c, i) => (
                            <m.button
                              key={c}
                              type="button"
                              onClick={() => ask(c)}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.05 * i }}
                              className="min-h-10 max-w-full truncate rounded-full border border-line bg-card px-3.5 text-[13px] text-ink/85 shadow-sm transition hover:-translate-y-0.5 hover:border-verdi-400 hover:text-verdi-800 max-lg:min-h-11 motion-reduce:transform-none"
                              data-testid="helper-chip"
                            >
                              {c}
                            </m.button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </m.div>
              ))}
              {typing && <Typing />}
            </div>

            {/* question box */}
            <form
              className="shrink-0 border-t border-line bg-card px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] lg:pb-3"
              onSubmit={(e) => {
                e.preventDefault();
                ask(text);
              }}
            >
              <div className="flex items-center gap-2 rounded-full border border-line bg-paper px-1.5 py-1 focus-within:border-verdi-500 focus-within:ring-2 focus-within:ring-verdi-500/20">
                <input
                  ref={input}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={300}
                  className="min-h-10 min-w-0 flex-1 bg-transparent px-2.5 text-[16px] outline-none placeholder:text-subtle lg:text-sm"
                  placeholder={lang === "ta" ? "உங்கள் கேள்வியை தட்டச்சு செய்யுங்கள்…" : "Type your question…"}
                  aria-label={lang === "ta" ? "உங்கள் கேள்வி" : "Your question"}
                  enterKeyHint="send"
                  data-testid="helper-input"
                />
                <button type="submit" disabled={!text.trim()} className="grid size-10 shrink-0 place-items-center rounded-full bg-verdi-600 text-white transition hover:bg-verdi-700 disabled:opacity-40" aria-label={lang === "ta" ? "அனுப்பு" : "Ask"} data-testid="helper-send">
                  <SendHorizontal className="size-4.5" />
                </button>
              </div>
              <p className="mt-1.5 truncate text-center text-[11px] text-subtle">{note}</p>
            </form>
          </m.section>
        </>
      )}
    </AnimatePresence>
  );
}
