import { ArrowRight, Search } from "lucide-react";
import { AnimatePresence, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useCatalogue } from "../../lib/catalogue";
import { useSite } from "../../lib/site";
import { CountUp, m } from "../motion";
import { WhatsAppIcon } from "../WhatsAppIcon";

// Headline specs for the showcase card, in order of preference.
const KEY_SPECS = ["power_wp", "ac_power_w", "rated_input_w", "led_power_w", "max_efficiency_pct", "efficiency_pct", "phase", "cross_section_sqmm"];

// Rotating end of the headline: "Power your next …"
const ROTATE = ["rooftop.", "factory.", "EPC project.", "solar farm.", "big order."];

/** "A", "A and B", "A, B and C", or "N leading brands". */
function brandLine(names: string[]): string {
  if (names.length === 0) return "trusted manufacturers";
  if (names.length > 3) return `${names.length} leading brands`;
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// dust motes (deterministic positions so SSR/prerender & client agree)
const MOTES = Array.from({ length: 18 }, (_, i) => ({
  left: `${(i * 53) % 100}%`,
  top: `${55 + ((i * 29) % 40)}%`,
  size: 2 + (i % 3),
  d: `${7 + (i % 5) * 1.6}s`,
  delay: `${(i % 7) * 0.9}s`,
  dx: `${((i % 2 ? 1 : -1) * (20 + (i % 4) * 15))}px`,
}));

export function Hero({ stats }: { stats: { k: string; v: number }[] }) {
  const SITE = useSite();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const { data, brand } = useCatalogue();

  // Everything below comes from the live catalogue, so new brands/products/categories appear automatically.
  const showcase = useMemo(() => {
    const seen = new Set<string>();
    const out: { img: string; name: string; spec: string; to: string }[] = [];
    const products = [...(data?.products ?? [])].sort((x, y) => Number(y.featured) - Number(x.featured));
    for (const p of products) {
      const img = p.images[0]?.url;
      const key = p.seriesKey ?? String(p.id);
      if (!img || seen.has(key)) continue;
      seen.add(key);
      const spec = [brand(p.brandId)?.name, ...KEY_SPECS.map((k) => p.specs.find((x) => x.k === k)).filter((x) => !!x).slice(0, 2).map((x) => `${x!.v}${x!.u ? " " + x!.u : ""}`)].filter(Boolean).join(" · ");
      out.push({ img, name: p.seriesName ?? p.name, spec, to: `/products/${p.slug}` });
      if (out.length === 6) break;
    }
    return out;
  }, [data, brand]);
  const quick = useMemo(() => {
    const counts = new Map<number, number>();
    for (const p of data?.products ?? []) counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
    return (data?.categories ?? []).filter((c) => counts.get(c.id)).slice(0, 6);
  }, [data]);
  const brandText = brandLine((data?.brands ?? []).map((x) => x.name));

  const [idx, setIdx] = useState(0);
  const [word, setWord] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setIdx((i) => (showcase.length ? (i + 1) % showcase.length : 0));
      setWord((w) => (w + 1) % ROTATE.length);
    }, 3200);
    return () => clearInterval(id);
  }, [showcase.length]);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 50, damping: 20 });
  const sy = useSpring(my, { stiffness: 50, damping: 20 });
  // Looping light effects run only while the hero is on screen (saves work while scrolling the page).
  const heroRef = useRef<HTMLElement>(null);
  const [heroVisible, setHeroVisible] = useState(true);
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setHeroVisible(e.isIntersecting), { rootMargin: "0px 0px -15% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const bgX = useTransform(sx, (v) => v * -18);
  const bgY = useTransform(sy, (v) => v * -10);
  const cardX = useTransform(sx, (v) => v * 16);
  const cardY = useTransform(sy, (v) => v * 16);
  const item = showcase[Math.min(idx, Math.max(0, showcase.length - 1))];

  return (
    <section
      ref={heroRef}
      data-pause-offscreen
      className={`relative isolate flex min-h-[calc(100svh-4rem)] flex-col max-sm:min-h-0 overflow-hidden bg-ink text-paper ${heroVisible ? "" : "hero-paused"}`}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - r.left) / r.width - 0.5);
        my.set((e.clientY - r.top) / r.height - 0.5);
      }}
    >
      {/* HD photograph: aerial solar farm at golden hour (mirrored so the sun sits behind the content's right side) */}
      <m.div className="absolute -inset-6 -z-30" style={{ x: bgX, y: bgY }}>
        <m.picture initial={{ scale: 1.22, opacity: 0 }} animate={{ scale: 1.04, opacity: 1 }} transition={{ scale: { duration: 2.4, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 1.4 } }} className="block size-full">
          <source media="(max-width: 640px)" srcSet="/media/hero-solar-farm-golden-1200.webp" />
          <img src="/media/hero-solar-farm-golden-2400.webp" alt="" fetchPriority="high" className="size-full -scale-x-100 object-cover object-[46%_center] sm:object-[center_60%]" />
        </m.picture>
      </m.div>
      {/* sun glow + rotating rays at the sun's position */}
      <div className="pointer-events-none absolute top-[24%] left-1/2 -z-20 size-[620px] -translate-x-1/2 -translate-y-1/2 sm:top-[27%] sm:left-[57%] sm:size-[900px]" aria-hidden="true">
        <div className="sun-rays absolute inset-0 rounded-full" />
        <div className="sun-glow absolute inset-[38%] rounded-full bg-[radial-gradient(circle,rgba(255,236,190,0.9),rgba(249,162,27,0.35)_45%,transparent_70%)]" />
      </div>
      {/* panel glint sweep */}
      <div className="pointer-events-none absolute inset-x-[20%] top-[66%] bottom-[4%] -z-20 overflow-hidden" aria-hidden="true">
        <div className="hero-glint absolute inset-0 opacity-80" />
      </div>
      {/* dust motes */}
      <div className="pointer-events-none absolute inset-0 -z-20 hidden md:block" aria-hidden="true">
        {MOTES.map((p, i) => (
          <span
            key={i}
            className="mote absolute rounded-full bg-sun-200/80"
            style={{ left: p.left, top: p.top, width: p.size, height: p.size, ["--d" as string]: p.d, ["--delay" as string]: p.delay, ["--dx" as string]: p.dx }}
          />
        ))}
      </div>
      {/* legibility gradients */}
      {/* desktop/tablet: dark on the left behind the text */}
      <div className="absolute inset-0 -z-10 hidden bg-[linear-gradient(90deg,rgba(10,24,34,0.92)_0%,rgba(10,24,34,0.72)_38%,rgba(10,24,34,0.15)_68%,rgba(10,24,34,0.1)_100%)] sm:block" />
      <div className="absolute inset-0 -z-10 hidden bg-ink/35 sm:block xl:hidden" />
      <div className="absolute inset-0 -z-10 hidden bg-[linear-gradient(180deg,rgba(10,24,34,0.55)_0%,transparent_22%,transparent_60%,rgba(10,24,34,0.95)_100%)] sm:block" />
      {/* phones: clear sky and sun on top, text on a dark base below */}
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(10,24,34,0.35)_0%,rgba(10,24,34,0.05)_22%,rgba(10,24,34,0.35)_45%,rgba(10,24,34,0.88)_68%,rgba(10,24,34,0.98)_100%)] sm:hidden" />

      <div className="container-x relative flex flex-1 items-end pt-40 pb-8 max-sm:pt-24 max-sm:pb-5 sm:items-center sm:py-14">
        <div className="grid w-full grid-cols-1 items-end gap-10 xl:grid-cols-[1.25fr_1fr]">
          <div>
            <m.p className="eyebrow !text-sun-300" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              B2B solar supply · Chennai, Tamil Nadu
            </m.p>
            <h1 className="mt-3 text-[2.6rem] leading-[1.02] font-semibold drop-shadow-[0_4px_24px_rgba(0,0,0,0.45)] sm:mt-4 sm:text-6xl lg:text-[4.6rem]">
              {["Power", "your", "next"].map((w, i) => (
                <m.span
                  key={w}
                  className="mr-[0.22em] inline-block"
                  initial={{ opacity: 0, y: 36, filter: "blur(8px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ delay: 0.45 + i * 0.09, duration: 0.7, ease: [0.2, 0.7, 0.2, 1] }}
                >
                  {w}
                </m.span>
              ))}
              <span className="block min-h-[1.05em]">
                <span className="sr-only">solar project.</span>
                <AnimatePresence mode="wait" initial={false}>
                  <m.span
                    key={ROTATE[word]}
                    aria-hidden="true"
                    className="inline-block bg-linear-to-r from-sun-200 via-sun-300 to-sun-500 bg-clip-text pb-[0.08em] whitespace-nowrap text-transparent [filter:drop-shadow(0_2px_14px_rgba(0,0,0,0.75))]"
                    initial={{ y: 28, opacity: 0, filter: "blur(6px)" }}
                    animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                    exit={{ y: -24, opacity: 0, filter: "blur(6px)" }}
                    transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
                  >
                    {ROTATE[word]}
                  </m.span>
                </AnimatePresence>
              </span>
            </h1>
            <m.p className="mt-4 max-w-xl text-[15px] leading-relaxed text-paper/80 sm:mt-6 sm:text-lg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
              Solar panels, inverters, cables and every component in between, from {brandText}.<span className="max-sm:hidden"> Compare real manufacturer datasheets, see live prices and send your whole order in one WhatsApp message.</span>
            </m.p>
            <m.form
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.25 }}
              className="mt-6 flex max-w-xl items-center gap-2 rounded-full sm:mt-8 border border-white/20 bg-ink/75 p-1.5 pl-5 shadow-2xl focus-within:border-sun-300"
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                nav(`/products${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
              }}
            >
              <Search className="size-5 shrink-0 text-paper/60" />
              <label htmlFor="hero-q" className="sr-only">
                Search products
              </label>
              <input id="hero-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by wattage, kW, model or brand" className="min-w-0 flex-1 bg-transparent py-2 text-base text-paper outline-none placeholder:text-paper/50" />
              <button className="btn-sun" type="submit">
                Search
              </button>
            </m.form>
            <m.div className="scrollbar-none -mx-4 mt-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }}>
              {quick.map((c) => (
                <Link key={c.id} to={`/category/${c.slug}`} className="shrink-0 rounded-full border border-white/20 bg-ink/60 px-3 py-1 text-xs whitespace-nowrap text-paper/85 transition hover:border-sun-300 hover:text-paper">
                  {c.name}
                </Link>
              ))}
            </m.div>
            <m.div className="mt-6 flex gap-3 max-sm:hidden sm:mt-8 sm:flex-wrap" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}>
              <Link to="/products" className="btn-sun">
                Browse catalogue <ArrowRight className="size-4" />
              </Link>
              <a href={SITE.whatsappUrl} target="_blank" rel="noopener" className="btn-ghost-dark bg-ink/50">
                <WhatsAppIcon className="size-4" /> WhatsApp {SITE.phoneDisplay}
              </a>
            </m.div>
          </div>

          {/* floating glass product card cycling through real product cut-outs */}
          {item && (
          <m.div style={{ x: cardX, y: cardY }} className="hidden justify-self-end xl:block" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2, duration: 0.9 }}>
            <Link to={item.to} className="group block w-[340px] rounded-[2rem] border border-white/20 bg-ink/70 p-5 shadow-2xl transition hover:bg-ink/80">
              <div className="relative h-56">
                <div className="absolute inset-x-10 bottom-2 h-6 rounded-[50%] bg-black/40 blur-xl" />
                <AnimatePresence mode="wait">
                  <m.img
                    key={item.img}
                    src={item.img}
                    alt={item.name}
                    className="absolute inset-0 m-auto max-h-full max-w-[85%] object-contain drop-shadow-[0_20px_30px_rgba(0,0,0,0.5)]"
                    initial={{ opacity: 0, y: 30, rotate: -6, scale: 0.9 }}
                    animate={{ opacity: 1, y: [0, -8, 0], rotate: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -20, scale: 0.92, transition: { duration: 0.25 } }}
                    transition={{ opacity: { duration: 0.4 }, rotate: { duration: 0.6 }, scale: { duration: 0.6 }, y: { duration: 3.2, ease: "easeInOut" } }}
                  />
                </AnimatePresence>
              </div>
              <AnimatePresence mode="wait">
                <m.div key={item.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
                  <p className="font-mono text-[10px] tracking-[0.18em] text-sun-200 uppercase">In the catalogue</p>
                  <p className="mt-1 text-lg font-semibold">{item.name}</p>
                  <p className="num text-xs text-paper/70">{item.spec}</p>
                </m.div>
              </AnimatePresence>
              <div className="mt-4 flex gap-1.5">
                {showcase.map((s, k) => (
                  <span key={s.name} className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
                    {k === idx && <m.span className="block h-full bg-sun-300" initial={{ width: 0 }} animate={{ width: "100%" }} transition={{ duration: 3.6, ease: "linear" }} />}
                    {k < idx && <span className="block h-full bg-sun-300/60" />}
                  </span>
                ))}
              </div>
            </Link>
          </m.div>
          )}
        </div>
      </div>

      <div className="relative border-t border-white/10 bg-ink/85">
        <dl className="container-x grid grid-cols-4 divide-x divide-white/10">
          {stats.map((s) => (
            <div key={s.k} className="px-2 py-3 sm:px-6 sm:py-5 max-lg:flex max-lg:flex-col max-lg:justify-between">
              <dt className="font-mono text-[8px] leading-tight tracking-[0.1em] text-paper/55 uppercase sm:text-[10px] sm:tracking-[0.16em]">{s.k}</dt>
              <dd className="num mt-1 text-xl text-paper sm:text-3xl">
                <CountUp to={s.v} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
