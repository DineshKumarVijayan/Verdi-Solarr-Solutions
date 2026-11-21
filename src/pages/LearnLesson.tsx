import { ArrowLeft, ArrowRight, CheckCircle2, Clock, Lightbulb } from "lucide-react";
import { useScroll, useSpring } from "motion/react";
import { Suspense, useEffect } from "react";
import { Link, useParams } from "react-router";
import { m, Reveal } from "../components/motion";
import { ProductCard } from "../components/ProductCard";
import { ProductRow } from "../components/ProductRow";
import { ActionBar } from "../components/mobile/kit";
import { Spinner } from "../components/ui";
import { useCatalogue } from "../lib/catalogue";
import { usePageMeta } from "../lib/seo";
import { GROUP_STYLE, GROUPS, ICONS, LESSON_COMPONENTS, LESSONS, markDone } from "./learn/registry";
import NotFound from "./NotFound";

export default function LearnLesson() {
  const { lesson = "" } = useParams();
  const meta = LESSONS.find((l) => l.slug === lesson);
  usePageMeta(meta ? `${meta.title} — Solar Learning Hub` : "Lesson", meta?.summary);
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  const { data, categoryBySlug } = useCatalogue();

  useEffect(() => {
    if (!meta) return;
    const unsub = scrollYProgress.on("change", (v) => v > 0.85 && markDone(meta.slug));
    const t = setTimeout(() => document.documentElement.scrollHeight <= window.innerHeight * 1.2 && markDone(meta.slug), 8000);
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, [meta, scrollYProgress]);

  if (!meta) return <NotFound />;
  const Comp = LESSON_COMPONENTS[meta.slug];
  const idx = LESSONS.indexOf(meta);
  const prev = LESSONS[idx - 1];
  const next = LESSONS[idx + 1];
  const g = GROUPS.find((x) => x.id === meta.group)!;
  const Icon = ICONS[meta.icon] ?? Lightbulb;

  const relatedProducts = (() => {
    const cats = meta.related.map((s) => categoryBySlug(s)?.id).filter(Boolean);
    const seen = new Set<string>();
    return (data?.products ?? [])
      .filter((p) => cats.includes(p.categoryId))
      .filter((p) => {
        const k = p.seriesKey ?? String(p.id);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 3);
  })();

  return (
    <div key={meta.slug}>
      <m.div className="fixed inset-x-0 top-16 z-40 h-1 origin-left max-lg:top-14 bg-linear-to-r from-sun-400 to-verdi-500" style={{ scaleX: progress }} aria-hidden="true" />
      <header className="relative overflow-hidden bg-ink text-paper">
        <div className="absolute inset-0 grid-bg" aria-hidden="true" />
        <div className="container-x relative py-12 max-sm:py-5">
          <Link to="/learn" className="inline-flex items-center gap-1.5 text-sm text-paper/60 hover:text-paper">
            <ArrowLeft className="size-4" /> Learning Hub
          </Link>
          <div className="mt-6 flex flex-col gap-5 max-sm:mt-3 max-sm:flex-row max-sm:items-center max-sm:gap-3 sm:flex-row sm:items-center">
            <m.span className={`grid size-16 shrink-0 place-items-center rounded-3xl max-sm:size-12 max-sm:rounded-2xl bg-linear-to-br ${GROUP_STYLE[g.color]}`} initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 160 }}>
              <Icon className="size-8" />
            </m.span>
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-paper/60 uppercase">
                Lesson {idx + 1} · {g.name} · <Clock className="size-3.5" /> {meta.minutes} min
              </p>
              <m.h1 className="mt-1 text-3xl font-semibold max-sm:text-xl max-sm:leading-tight sm:text-5xl" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                {meta.title}
              </m.h1>
              <p className="mt-2 max-w-2xl text-paper/70 max-sm:hidden">{meta.summary}</p>
            </div>
          </div>
        </div>
      </header>

      <article className="container-x py-12 max-lg:pt-5 max-lg:pb-24">
        <Suspense
          fallback={
            <div className="flex min-h-60 items-center justify-center text-muted">
              <Spinner />
            </div>
          }
        >
          <Comp />
        </Suspense>

        <Reveal className="mt-14 rounded-[var(--radius-card)] border border-verdi-200 bg-verdi-50 p-6">
          <p className="flex items-center gap-2 font-semibold">
            <Lightbulb className="size-5 text-sun-500" /> Key takeaways
          </p>
          <ul className="mt-3 grid gap-2">
            {meta.takeaways.map((t) => (
              <li key={t} className="flex gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-verdi-600" />
                {t}
              </li>
            ))}
          </ul>
        </Reveal>

        {relatedProducts.length > 0 && (
          <Reveal className="mt-14">
            <h2 className="text-2xl font-semibold">Products related to this lesson</h2>
            <div className="mt-5 grid gap-4 max-lg:hidden sm:grid-cols-2 lg:grid-cols-3">
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
            <ul className="mt-2 divide-y divide-line/70 lg:hidden">
              {relatedProducts.map((p) => (
                <ProductRow key={p.id} product={p} />
              ))}
            </ul>
          </Reveal>
        )}

        <nav aria-label="Lesson navigation" className="mt-14 grid gap-4 max-lg:hidden sm:grid-cols-2">
          {prev ? (
            <Link to={`/learn/${prev.slug}`} className="group card p-5 transition hover:-translate-y-0.5">
              <p className="text-xs text-muted">← Previous</p>
              <p className="mt-1 font-semibold group-hover:text-verdi-700">{prev.title}</p>
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link to={`/learn/${next.slug}`} className="group card p-5 text-right transition hover:-translate-y-0.5" data-testid="next-lesson">
              <p className="text-xs text-muted">Next lesson →</p>
              <p className="mt-1 inline-flex items-center gap-2 font-semibold group-hover:text-verdi-700">
                {next.title} <ArrowRight className="size-4" />
              </p>
            </Link>
          )}
        </nav>
        <ActionBar testId="lesson-bar">
          {prev ? (
            <Link to={`/learn/${prev.slug}`} className="btn-ghost tap min-w-0 flex-1" aria-label={`Previous lesson: ${prev.title}`}>
              <ArrowLeft className="size-4 shrink-0" /> <span className="truncate">Previous</span>
            </Link>
          ) : (
            <Link to="/learn" className="btn-ghost tap min-w-0 flex-1">
              <ArrowLeft className="size-4 shrink-0" /> All lessons
            </Link>
          )}
          {next ? (
            <Link to={`/learn/${next.slug}`} className="btn-primary tap min-w-0 flex-[1.4]" aria-label={`Next lesson: ${next.title}`} data-testid="m-next-lesson">
              <span className="truncate">Next lesson</span> <ArrowRight className="size-4 shrink-0" />
            </Link>
          ) : (
            <Link to="/learn" className="btn-primary tap min-w-0 flex-[1.4]">
              Back to the hub
            </Link>
          )}
        </ActionBar>
      </article>
    </div>
  );
}
