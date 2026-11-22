import { Check, GitCompareArrows, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import lessonData from "../../../data/lessons.json";
import { reply, welcome, type HelperAnswer, type HelperContext, type Lang } from "../../../shared/assistant";
import { formatPaise } from "../../../shared/money";
import type { EnquiryView, PublicProduct, RewardEntry } from "../../../shared/types";
import { useAccount } from "../../lib/account";
import { api } from "../../lib/api";
import { useBasket } from "../../lib/basket";
import { useCatalogue } from "../../lib/catalogue";
import { useCompare } from "../../lib/compare";
import { STATUS_LABEL } from "../../lib/enquiry-status";
import { useSite } from "../../lib/site";
import { ProductVisual } from "../ProductVisual";
import { OfferTag, StockPill } from "../StockBadge";
import { ChatShell } from "./ChatShell";

const LESSONS = (lessonData as { lessons: { slug: string; title: string; summary: string }[] }).lessons.map(({ slug, title, summary }) => ({ slug, title, summary }));

export function ProductCards({ ids, onNavigate, canAdd = true }: { ids: number[]; onNavigate: () => void; canAdd?: boolean }) {
  const { byId, category, data } = useCatalogue();
  const basket = useBasket();
  const items = ids.map(byId).filter((p): p is PublicProduct => !!p);
  if (!items.length) return null;
  return (
    <div className="scrollbar-none -mx-3.5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-3.5 pb-1" data-testid="helper-products">
      {items.map((p) => {
        const added = basket.has(p.id);
        return (
          <article key={p.id} className="flex w-44 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-sm" data-testid="helper-product">
            <Link to={`/products/${p.slug}`} onClick={onNavigate} className="block" aria-label={p.name}>
              <div className="relative">
                <ProductVisual product={p} categorySlug={category(p.categoryId)?.slug ?? ""} size="card" />
              </div>
            </Link>
            <div className="flex flex-1 flex-col gap-1 p-2.5">
              <Link to={`/products/${p.slug}`} onClick={onNavigate} className="line-clamp-2 text-[13px] leading-snug font-medium hover:text-verdi-700">
                {p.name}
              </Link>
              <p className="num text-sm font-semibold">{p.price.sellingPaise != null ? formatPaise(p.price.sellingPaise) : <span className="text-xs font-normal text-muted">Price on request</span>}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <StockPill stock={p.stock ?? "in_stock"} compact />
                <OfferTag product={p} small />
              </div>
              {canAdd && (<button
                type="button"
                disabled={p.stock === "out_of_stock" && !added}
                onClick={() => !added && basket.add(p.id, 1, { sellingPaise: p.price.sellingPaise, version: data?.version ?? 0 })}
                className={`mt-auto inline-flex min-h-10 items-center justify-center gap-1 rounded-full text-xs font-semibold transition max-lg:min-h-11 ${added ? "bg-verdi-50 text-verdi-800" : "bg-ink text-paper hover:bg-ink-3 disabled:opacity-40"}`}
                data-testid="helper-add"
              >
                {added ? <Check className="size-3.5" /> : <Plus className="size-3.5" />} {added ? "In enquiry" : "Add to enquiry"}
              </button>)}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function CompareButton({ ids, onNavigate }: { ids: number[]; onNavigate: () => void }) {
  const compare = useCompare();
  const nav = useNavigate();
  return (
    <button
      type="button"
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-ink px-3.5 text-[13px] font-medium text-paper hover:bg-ink-3 max-lg:min-h-11"
      onClick={() => {
        for (const id of ids) if (!compare.has(id)) compare.toggle(id);
        onNavigate();
        nav("/compare");
      }}
      data-testid="helper-compare"
    >
      <GitCompareArrows className="size-4" /> Compare side by side
    </button>
  );
}

/** The signed-in customer's own points or enquiries (read only, from their own account). */
function MyData({ need, lang }: { need: "points" | "enquiries"; lang: Lang }) {
  const [state, setState] = useState<{ balance?: number; entries?: RewardEntry[]; enquiries?: EnquiryView[]; error?: boolean } | null>(null);
  useEffect(() => {
    const path = need === "points" ? "/api/account/rewards" : "/api/account/enquiries";
    api<{ balance?: number; entries?: RewardEntry[]; enquiries?: EnquiryView[] }>(path)
      .then(setState)
      .catch(() => setState({ error: true }));
  }, [need]);
  if (!state) return <div className="h-16 animate-pulse rounded-2xl bg-paper-2" />;
  if (state.error) return <p className="text-xs text-danger">{lang === "ta" ? "இப்போது ஏற்ற முடியவில்லை." : "Couldn't load that right now."}</p>;
  if (need === "points")
    return (
      <div className="rounded-2xl border border-sun-200 bg-gradient-to-br from-sun-100 to-card p-3.5" data-testid="helper-points">
        <p className="num text-3xl font-semibold">{(state.balance ?? 0).toLocaleString("en-IN")}</p>
        <p className="text-xs text-muted">{lang === "ta" ? "புள்ளிகள்" : "points"}</p>
        {!!state.entries?.length && (
          <ul className="mt-2 space-y-1 text-xs">
            {state.entries.slice(0, 3).map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span className="truncate text-muted">{e.reason}</span>
                <span className={`num shrink-0 font-medium ${e.points < 0 ? "text-danger" : "text-verdi-700"}`}>{e.points > 0 ? "+" : ""}{e.points}</span>
              </li>
            ))}
          </ul>
        )}
        <Link to="/account" className="mt-2 inline-flex min-h-10 items-center text-xs font-medium text-verdi-700 hover:underline">{lang === "ta" ? "என் கணக்கு" : "My account"}</Link>
      </div>
    );
  const list = state.enquiries ?? [];
  return (
    <div className="rounded-2xl border border-line bg-card p-3" data-testid="helper-enquiries">
      {list.length === 0 ? (
        <p className="text-xs text-muted">{lang === "ta" ? "இன்னும் விசாரணைகள் இல்லை." : "No enquiries yet."}</p>
      ) : (
        <ul className="divide-y divide-line text-xs">
          {list.slice(0, 4).map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 py-1.5">
              <span className="min-w-0">
                <span className="num block truncate font-medium">{e.reference}</span>
                <span className="text-muted">{new Date(e.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
              </span>
              <span className="shrink-0 rounded-full bg-paper-2 px-2 py-0.5 font-medium">{STATUS_LABEL[e.status]}</span>
            </li>
          ))}
        </ul>
      )}
      <Link to="/account" className="mt-1 inline-flex min-h-10 items-center text-xs font-medium text-verdi-700 hover:underline">{lang === "ta" ? "அனைத்தையும் பார்" : "See all"}</Link>
    </div>
  );
}

export default function CustomerHelper({ open, onClose, onEnd, session, lang, setLang, starter }: { open: boolean; onClose: () => void; onEnd: () => void; session: number; lang: Lang; setLang: (l: Lang) => void; starter: string | null }) {
  const { data, index, bySlug } = useCatalogue();
  const SITE = useSite();
  const { customer } = useAccount();
  const loc = useLocation();
  const slug = loc.pathname.match(/^\/products\/([^/]+)/)?.[1];
  const focus = slug ? (bySlug(decodeURIComponent(slug)) ?? null) : null;

  const ctx = useMemo<HelperContext | null>(
    () =>
      data
        ? {
            cat: data,
            index,
            lang,
            lessons: LESSONS,
            signedIn: !!customer,
            focus,
            site: {
              phoneDisplay: SITE.phoneDisplay,
              phoneHref: SITE.phoneHref,
              whatsappUrl: SITE.whatsappUrl,
              email: SITE.email,
              address: SITE.address,
              hours: SITE.businessHours,
              social: [
                ["Instagram", SITE.instagramUrl],
                ["Facebook", SITE.facebookUrl],
                ["YouTube", SITE.youtubeUrl],
                ["LinkedIn", SITE.linkedinUrl],
              ]
                .filter(([, u]) => !!u)
                .map(([label, to]) => ({ label: label!, to: to! })),
            },
          }
        : null,
    [data, index, lang, customer, focus, SITE],
  );

  const answer = useCallback((q: string): HelperAnswer => (ctx ? reply(q, ctx) : { text: lang === "ta" ? "ஏற்றுகிறது…" : "Loading the catalogue…" }), [ctx, lang]);
  const hello = useCallback((): HelperAnswer => (ctx ? welcome(ctx) : { text: lang === "ta" ? "வணக்கம்!" : "Hi!" }), [ctx, lang]);

  return (
    <ChatShell
      open={open}
      onClose={onClose}
      onEnd={onEnd}
      session={session}
      title="VERDI Helper"
      subtitle={lang === "ta" ? "உடனடி பதில்கள் · எங்கள் நேரடி பட்டியலிலிருந்து" : "Instant answers from our live catalogue"}
      lang={lang}
      setLang={setLang}
      welcome={hello}
      answer={answer}
      starter={starter}
      note={lang === "ta" ? "பதில்கள் எங்கள் பட்டியல் மற்றும் தகவல்களிலிருந்து மட்டுமே." : "Answers come only from our catalogue and business details."}
      testId="customer-helper"
      extras={(a, close) => (
        <>
          {a.products && <ProductCards ids={a.products} onNavigate={close} />}
          {a.compare && a.compare.length >= 2 && <CompareButton ids={a.compare} onNavigate={close} />}
          {(a.need === "points" || a.need === "enquiries") && <MyData need={a.need} lang={lang} />}
        </>
      )}
    />
  );
}
