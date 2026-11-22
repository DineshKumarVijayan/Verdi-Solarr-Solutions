import { ChevronDown, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { bestFaq } from "../../shared/assistant";
import { WhatsAppIcon } from "../components/WhatsAppIcon";
import { useCatalogue } from "../lib/catalogue";
import { usePageMeta } from "../lib/seo";
import { useSite } from "../lib/site";
import { readStore, writeStore } from "../lib/storage";

/** Opens the website helper (the floating "Ask VERDI" button listens for this). */
export const openHelper = (question?: string) => window.dispatchEvent(new CustomEvent("vs:helper-open", { detail: question ?? null }));

/** Questions & answers written by the owner (Admin → Settings), in English or Tamil. */
export default function Faq() {
  const { data, loading } = useCatalogue();
  const SITE = useSite();
  const faqs = data?.faqs ?? [];
  const [lang, setLangState] = useState<"en" | "ta">(() => (readStore<string>("verdi.helper.lang", "en") === "ta" ? "ta" : "en"));
  const setLang = (l: "en" | "ta") => (setLangState(l), writeStore("verdi.helper.lang", l));
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState("");
  usePageMeta("Questions & answers", faqs.length ? `Answers from VERDI SOLARR SOLUTION: ${faqs.slice(0, 3).map((f) => f.q).join(" · ")}` : "Questions about solar products? Ask VERDI SOLARR SOLUTION.");
  const hasTamil = faqs.some((f) => f.qTa);
  const ta = lang === "ta" && hasTamil;
  const topics = [...new Set(faqs.map((f) => f.topic))];
  const shown = useMemo(() => {
    let list = topic ? faqs.filter((f) => f.topic === topic) : faqs;
    const s = q.trim();
    if (s) {
      const low = s.toLowerCase();
      list = list.filter((f) => [f.q, f.a, f.qTa ?? "", f.aTa ?? "", f.k].some((x) => x.toLowerCase().includes(low)) || (bestFaq([f], s, lang)?.score ?? 0) >= 0.5);
    }
    return list;
  }, [faqs, topic, q, lang]);

  return (
    <div className="container-x py-12 max-lg:py-5">
      <p className="eyebrow">{ta ? "கேள்வி பதில்கள்" : "Help"}</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-4xl font-semibold max-sm:text-2xl sm:text-5xl">{ta ? "கேள்விகளும் பதில்களும்" : "Questions & answers"}</h1>
        {hasTamil && (
          <div className="flex rounded-full border border-line bg-card p-0.5 text-sm" role="group" aria-label="Language">
            {(["en", "ta"] as const).map((l) => (
              <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={`tap rounded-full px-3.5 font-medium ${lang === l ? "bg-ink text-paper" : "text-muted"}`} data-testid={`faq-lang-${l}`}>
                {l === "en" ? "English" : "தமிழ்"}
              </button>
            ))}
          </div>
        )}
      </div>

      {faqs.length > 0 && (
        <div className="mt-6 max-w-3xl space-y-3">
          <label className="relative block">
            <span className="sr-only">Search questions</span>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
            <input value={q} onChange={(e) => setQ(e.target.value)} className="field !pl-10" placeholder={ta ? "கேள்விகளில் தேடு…" : "Search the questions…"} data-testid="faq-search" />
          </label>
          {topics.length > 1 && (
            <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-wrap lg:px-0">
              {["", ...topics].map((t) => (
                <button key={t || "all"} type="button" onClick={() => setTopic(t)} className={`${topic === t ? "chip chip-on" : "chip"} max-lg:tap shrink-0`}>
                  {t || (ta ? "அனைத்தும்" : "All")}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 max-w-3xl space-y-2.5" data-testid="faq-list">
        {shown.map((f) => (
          <details key={f.id} className="group card overflow-hidden open:shadow-[var(--shadow-soft)]" data-testid="faq-item">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 font-medium [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 break-words">{ta && f.qTa ? f.qTa : f.q}</span>
              <ChevronDown className="size-5 shrink-0 text-muted transition group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <div className="border-t border-line/70 px-5 py-4 text-sm leading-relaxed break-words whitespace-pre-line text-ink/85">{ta && f.aTa ? f.aTa : f.a}</div>
          </details>
        ))}
        {!loading && faqs.length > 0 && shown.length === 0 && <p className="text-sm text-muted">{ta ? "பொருந்தும் கேள்வி இல்லை." : "No question matches that."}</p>}
        {!loading && faqs.length === 0 && <p className="text-muted">{ta ? "கேள்விகள் விரைவில் சேர்க்கப்படும்." : "Answers to common questions are on their way."}</p>}
      </div>

      <div className="mt-10 flex max-w-3xl flex-wrap items-center gap-3 rounded-3xl bg-gradient-to-br from-verdi-50 to-card p-5 ring-1 ring-line max-lg:mt-6">
        <p className="min-w-0 flex-1 basis-60 font-medium">{ta ? "உங்கள் கேள்வி இங்கே இல்லையா?" : "Didn't find your question?"}</p>
        <button type="button" onClick={() => openHelper()} className="btn-primary max-lg:tap" data-testid="faq-ask">
          <Sparkles className="size-4" /> {ta ? "உதவியாளரிடம் கேளுங்கள்" : "Ask VERDI Helper"}
        </button>
        <a href={SITE.whatsappUrl} target="_blank" rel="noopener" className="btn-ghost max-lg:tap">
          <WhatsAppIcon className="size-4" /> WhatsApp
        </a>
      </div>
    </div>
  );
}
