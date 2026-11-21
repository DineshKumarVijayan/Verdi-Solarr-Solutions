import { ArrowRight, ArrowUpRight } from "lucide-react";
import { AnimatePresence, useMotionTemplate, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import type { PublicCategory, PublicProduct } from "../../../shared/types";
import { useCatalogue } from "../../lib/catalogue";
import { m, Reveal } from "../motion";

type Visual = { src: string; cutout: boolean }[];

/** Up to three photos for a category: the primary photo of different product families (featured first). */
function visualsFor(products: PublicProduct[]): Visual {
  const seen = new Set<string>();
  const out: Visual = [];
  for (const p of [...products].sort((x, y) => Number(y.featured) - Number(x.featured))) {
    const img = p.images[0];
    const key = p.seriesKey ?? String(p.id);
    if (!img || seen.has(key)) continue;
    seen.add(key);
    out.push({ src: img.url, cutout: true });
    if (out.length === 3) break;
  }
  return out;
}

/** Highlights from the products' own specifications (ranges of the most common numeric specs) and brands. */
function highlights(products: PublicProduct[], brandName: (id: number) => string | undefined): string[] {
  const keys = new Map<string, { l: string; u: string | null; vals: number[]; first: number }>();
  products.forEach((p) =>
    p.specs.forEach((sp, i) => {
      const n = Number(String(sp.v).replace(/,/g, ""));
      if (!Number.isFinite(n) || sp.v === "") return;
      const e = keys.get(sp.k) ?? { l: sp.l, u: sp.u, vals: [], first: i };
      e.vals.push(n);
      keys.set(sp.k, e);
    }),
  );
  const need = Math.max(1, Math.ceil(products.length * 0.6));
  const ranges = [...keys.values()]
    .filter((e) => e.vals.length >= need)
    .sort((a, b) => b.vals.length - a.vals.length || a.first - b.first)
    .slice(0, 2)
    .map((e) => {
      const lo = Math.min(...e.vals);
      const hi = Math.max(...e.vals);
      // a short symbol in brackets reads better on a chip: "Nominal maximum power (Pmax)" -> "Pmax"
      const sym = e.l.match(/\(([^()]{1,6})\)/)?.[1];
      return `${sym ?? e.l}: ${lo === hi ? lo : `${lo}–${hi}`}${e.u ? " " + e.u : ""}`;
    });
  const brands = [...new Set(products.map((p) => brandName(p.brandId)).filter(Boolean))] as string[];
  return [...ranges, ...(brands.length ? [brands.slice(0, 3).join(" · ")] : [])];
}

export function CatalogueShowcase() {
  const { data, countByCategory, brand } = useCatalogue();
  const brandName = (id: number) => brand(id)?.name;
  const cats = (data?.categories ?? []).filter((c) => (countByCategory.get(c.id) ?? 0) > 0);
  const upcoming = (data?.categories ?? []).filter((c) => (countByCategory.get(c.id) ?? 0) === 0);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const active = cats[Math.min(i, Math.max(cats.length - 1, 0))];

  useEffect(() => {
    if (paused || cats.length < 2 || !window.matchMedia("(min-width: 1024px)").matches) return;
    const id = setTimeout(() => setI((x) => (x + 1) % cats.length), 5200);
    return () => clearTimeout(id);
  }, [i, paused, cats.length]);

  const products = useMemo(() => (data?.products ?? []).filter((p) => p.categoryId === active?.id), [data, active]);
  const chips = active ? highlights(products, brandName) : [];
  const visuals = active ? visualsFor(products) : [];
  const withSheets = products.filter((p) => p.datasheet).length;

  // 3D tilt + spotlight
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [7, -7]), { stiffness: 120, damping: 18 });
  const ry = useSpring(useTransform(px, [0, 1], [-9, 9]), { stiffness: 120, damping: 18 });
  const spot = useMotionTemplate`radial-gradient(420px circle at ${useTransform(px, (v) => `${v * 100}%`)} ${useTransform(py, (v) => `${v * 100}%`)}, rgba(249,162,27,0.22), transparent 60%)`;

  if (!active) return null;
  return (
    <section className="relative overflow-hidden py-12 sm:py-20" data-pause-offscreen onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="container-x">
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="eyebrow">The catalogue</p>
            <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">Everything between the sun and the switchboard.</h2>
          </div>
          <Link to="/products" className="btn-ghost">
            All {data?.products.length} products <ArrowRight className="size-4" />
          </Link>
        </Reveal>

        <MobileCatalogue cats={cats} products={data?.products ?? []} count={(id) => countByCategory.get(id) ?? 0} />

        <div className="mt-10 hidden gap-6 lg:grid lg:grid-cols-[360px_1fr]">
          {/* category rail */}
          <div className="grid content-start gap-2" role="tablist" aria-label="Product categories">
            {cats.map((c, k) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={k === i}
                onClick={() => setI(k)}
                onMouseEnter={() => setI(k)}
                className="group relative overflow-hidden rounded-2xl px-5 py-4 text-left"
              >
                {k === i && <m.span layoutId="cat-active" className="absolute inset-0 rounded-2xl bg-ink" transition={{ type: "spring", stiffness: 300, damping: 30 }} />}
                <span className="relative flex items-center gap-4">
                  <span className={`num text-sm ${k === i ? "text-sun-300" : "text-subtle"}`}>{String(k + 1).padStart(2, "0")}</span>
                  <span className="flex-1">
                    <span className={`block text-lg font-semibold transition ${k === i ? "text-paper" : "text-ink group-hover:translate-x-1"}`}>{c.name}</span>
                    <span className={`num block text-xs ${k === i ? "text-paper/60" : "text-muted"}`}>{countByCategory.get(c.id)} models</span>
                  </span>
                  <ArrowUpRight className={`size-5 transition ${k === i ? "rotate-45 text-sun-300" : "text-subtle opacity-0 group-hover:opacity-100"}`} />
                </span>
                {k === i && !paused && <m.span key={`p${i}`} className="absolute bottom-0 left-0 h-0.5 bg-sun-400" initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 5.2, ease: "linear" }} />}
              </button>
            ))}
          </div>

          {/* stage */}
          <m.div
            style={{ rotateX: rx, rotateY: ry, transformPerspective: 1400 }}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              px.set((e.clientX - r.left) / r.width);
              py.set((e.clientY - r.top) / r.height);
            }}
            onPointerLeave={() => {
              px.set(0.5);
              py.set(0.5);
            }}
            className="relative min-h-[460px] overflow-hidden rounded-[2.2rem] bg-[radial-gradient(120%_100%_at_70%_20%,#183142_0%,#0a1822_60%)] text-paper shadow-[var(--shadow-lift)]"
          >
            <div className="absolute inset-0 grid-bg" aria-hidden="true" />
            <m.div className="absolute inset-0" style={{ background: spot }} aria-hidden="true" />
            {/* giant ghost label */}
            <AnimatePresence mode="wait">
              <m.p
                key={active.slug + "-ghost"}
                className="pointer-events-none absolute -bottom-4 left-6 font-display text-[clamp(3rem,9vw,7.5rem)] leading-none font-bold whitespace-nowrap text-white/[0.05]"
                initial={{ x: 80, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -80, opacity: 0 }}
                transition={{ duration: 0.6 }}
                aria-hidden="true"
              >
                {active.name}
              </m.p>
            </AnimatePresence>
            {/* orbit ring */}
            <div className="absolute top-1/2 right-[18%] size-[380px] -translate-y-1/2" aria-hidden="true">
              <div className="size-full rounded-full border border-dashed border-white/10 will-change-transform motion-safe:animate-[spin_60s_linear_infinite]">
                <span className="absolute -top-1.5 left-1/2 size-3 rounded-full bg-sun-400 shadow-[0_0_18px_#f9a21b]" />
              </div>
            </div>

            <div className="relative grid h-full gap-6 p-7 sm:p-10 md:grid-cols-[1fr_1.1fr]">
              <AnimatePresence mode="wait">
                <m.div key={active.slug} className="flex flex-col justify-center" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.45 }}>
                  <p className="font-mono text-[10px] tracking-[0.2em] text-sun-300 uppercase">{countByCategory.get(active.id)} model{countByCategory.get(active.id) === 1 ? "" : "s"}{withSheets ? " · datasheets included" : ""}</p>
                  <h3 className="mt-2 text-3xl font-semibold sm:text-4xl">{active.name}</h3>
                  <p className="mt-3 max-w-sm text-paper/70">{active.description}</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {chips.map((c, k) => (
                      <m.span key={c} className="num rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs" initial={{ opacity: 0, scale: 0.7, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ delay: 0.15 + k * 0.08, type: "spring", stiffness: 260, damping: 18 }}>
                        {c}
                      </m.span>
                    ))}
                  </div>
                  <Link to={`/category/${active.slug}`} className="btn-sun mt-7 self-start">
                    Explore {active.name.toLowerCase()} <ArrowRight className="size-4" />
                  </Link>
                </m.div>
              </AnimatePresence>

              <div className="relative min-h-[280px] [transform-style:preserve-3d]">
                <AnimatePresence>
                  {visuals.map((v, k) => {
                    const n = visuals.length;
                    const offset = (k - (n - 1) / 2) * (n > 2 ? 26 : 34);
                    return v.cutout ? (
                      <m.img
                        key={active.slug + v.src}
                        src={v.src}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 m-auto max-h-[78%] max-w-[62%] rounded-2xl object-contain drop-shadow-[0_30px_40px_rgba(0,0,0,0.55)]"
                        style={{ zIndex: n - Math.abs(k - (n - 1) / 2) }}
                        initial={{ opacity: 0, x: 120, rotate: 12, scale: 0.8 }}
                        animate={{ opacity: 1, x: `${offset}%`, rotate: (k - (n - 1) / 2) * 5, scale: k === Math.floor(n / 2) ? 1 : 0.86 }}
                        exit={{ opacity: 0, x: -120, rotate: -10, scale: 0.8, transition: { duration: 0.35 } }}
                        transition={{ type: "spring", stiffness: 90, damping: 16, delay: k * 0.08 }}
                      />
                    ) : (
                      <m.div
                        key={active.slug + v.src}
                        className="absolute inset-0 m-auto h-[78%] w-[86%] overflow-hidden rounded-3xl border border-white/15 shadow-2xl"
                        style={{ zIndex: k + 1 }}
                        initial={{ opacity: 0, x: 120, rotate: 8 }}
                        animate={{ opacity: 1, x: `${offset * 0.6}%`, rotate: n > 1 ? (k ? 4 : -4) : -3 }}
                        exit={{ opacity: 0, x: -120, transition: { duration: 0.35 } }}
                        transition={{ type: "spring", stiffness: 90, damping: 16, delay: k * 0.1 }}
                      >
                        <img src={v.src} alt="" loading="lazy" className="size-full object-cover" />
                        <div className="hero-glint absolute inset-0" />
                      </m.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>
          </m.div>
        </div>

        {/* BOS marquee */}
        {upcoming.length > 0 && (
          <Reveal className="marquee fade-edges mt-8 overflow-hidden rounded-2xl border border-line bg-card py-4 [--fade-to:var(--color-card)]">
            <div className="marquee-track flex gap-3" style={{ ["--marquee-duration" as string]: "38s" }}>
              {[...upcoming, ...upcoming].map((c, k) => (
                <Link key={k} to={`/category/${c.slug}`} className="chip shrink-0 !px-4 !py-2 !text-sm transition hover:-translate-y-0.5 hover:!border-verdi-500" tabIndex={k >= upcoming.length ? -1 : 0} aria-hidden={k >= upcoming.length}>
                  <span className="size-1.5 rounded-full bg-sun-400" /> {c.name} <span className="text-subtle">· on enquiry</span>
                </Link>
              ))}
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}

/**
 * Phones & tablets: one swipeable card per category (snap carousel). The centred card is full size,
 * its picture zooms in and floats and its highlights slide in; neighbours shrink and dim. Every card
 * sizes to its content, so nothing is cut off.
 */
function MobileCatalogue({ cats, products, count }: { cats: PublicCategory[]; products: PublicProduct[]; count: (id: number) => number }) {
  const { brand: brandOf } = useCatalogue();
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.i));
      },
      { root, threshold: 0.6 },
    );
    root.querySelectorAll("[data-i]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [cats.length]);

  const go = (k: number) => {
    const root = ref.current;
    const card = root?.querySelector<HTMLElement>(`[data-i="${k}"]`);
    if (root && card) root.scrollTo({ left: card.offsetLeft - (root.clientWidth - card.clientWidth) / 2, behavior: "smooth" });
  };

  return (
    <div className="mt-8 lg:hidden" data-testid="catalogue-cards">
      <div ref={ref} className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-[8%] pt-1 pb-3 sm:px-[20%]" aria-label="Product categories">
        {cats.map((c, k) => {
          const on = k === active;
          const mine = products.filter((p) => p.categoryId === c.id);
          const pic = visualsFor(mine)[0];
          const chips = highlights(mine, (id) => brandOf(id)?.name).slice(0, 3);
          return (
            <Link
              key={c.id}
              data-i={k}
              to={`/category/${c.slug}`}
              className={`group relative w-[84%] shrink-0 snap-center overflow-hidden rounded-[1.75rem] bg-[radial-gradient(120%_100%_at_70%_10%,#1d3a4d_0%,#0a1822_65%)] text-paper shadow-[var(--shadow-lift)] flex flex-col transition-transform duration-500 ease-out active:scale-[0.98] sm:w-[60%] ${on ? "scale-100" : "scale-[0.93]"}`}
              data-testid="catalogue-card"
            >
              {/* picture */}
              <div className="relative h-48 overflow-hidden">
                <div className="absolute inset-0 grid-bg opacity-60" aria-hidden="true" />
                <div className={`absolute top-1/2 left-1/2 size-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(249,162,27,0.35),transparent_65%)] transition-opacity duration-700 ${on ? "opacity-100" : "opacity-0"}`} aria-hidden="true" />
                {pic && (
                  <div className={`absolute inset-0 transition-transform duration-[1200ms] ease-out ${on ? "scale-100" : "scale-[0.88]"}`}>
                    <img
                      src={pic.src}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className={`size-full ${pic.cutout ? "object-contain p-5 drop-shadow-[0_18px_24px_rgba(0,0,0,0.55)]" : "object-cover"} ${on && pic.cutout ? "float-y" : ""}`}
                    />
                  </div>
                )}
                {!pic?.cutout && <div className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-[#0a1822] to-transparent" aria-hidden="true" />}
                <span className="num absolute top-3 left-3 rounded-full bg-ink/70 px-2.5 py-1 text-[11px] text-sun-300">
                  {String(k + 1).padStart(2, "0")} / {String(cats.length).padStart(2, "0")}
                </span>
              </div>
              {/* side cards: dimmed with a dark veil (keeps them dark instead of greyed-out) */}
              <span className={`pointer-events-none absolute inset-0 z-10 rounded-[1.75rem] bg-[#0a1822] transition-opacity duration-500 ${on ? "opacity-0" : "opacity-50"}`} aria-hidden="true" />
              {/* text */}
              <div className="flex flex-1 flex-col p-5 pt-3">
                <p className="num text-[11px] tracking-[0.14em] text-sun-300 uppercase">{count(c.id)} models · datasheets</p>
                <h3 className="mt-1 text-2xl leading-tight font-semibold">{c.name}</h3>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {chips.map((t, j) => (
                    <li
                      key={t}
                      className={`num rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] transition duration-500 ease-out ${on ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
                      style={{ transitionDelay: on ? `${150 + j * 90}ms` : "0ms" }}
                    >
                      {t}
                    </li>
                  ))}
                </ul>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-semibold text-sun-300">
                  Explore <ArrowRight className="size-4 transition group-active:translate-x-1" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
      {/* position dots */}
      <div className="mt-2 flex justify-center gap-1.5" role="tablist" aria-label="Choose a category">
        {cats.map((c, k) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={k === active}
            aria-label={c.name}
            onClick={() => go(k)}
            className={`h-2 rounded-full transition-all duration-300 ${k === active ? "w-6 bg-ink" : "w-2 bg-line hover:bg-subtle"}`}
          />
        ))}
      </div>
    </div>
  );
}
