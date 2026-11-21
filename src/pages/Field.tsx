import { ChevronLeft, ChevronRight, Droplets, Flame, Wind } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useEffect, useState, useRef } from "react";
import { Link } from "react-router";
import { m, Reveal } from "../components/motion";
import { Modal } from "../components/ui";
import { WhatsAppIcon } from "../components/WhatsAppIcon";
import { fallbackToOriginal, srcSetFor } from "../lib/img";
import { usePageMeta } from "../lib/seo";
import { useFieldPhotos, useSite } from "../lib/site";

export default function Field() {
  const SITE = useSite();
  usePageMeta("In the field — solar hardware on Indian rooftops", "Photos of solar modules, inverters, junction boxes and mounting in real rooftop installations, plus manufacturer quality testing.");
  const photos = useFieldPhotos();
  const TAGS = ["All", ...Array.from(new Set(photos.map((f) => f.tag)))];
  const [tag, setTag] = useState("All");
  const [open, setOpen] = useState<number | null>(null);
  const touchX = useRef<number | null>(null); // swipe between photos in the full-screen viewer
  const list = photos.filter((f) => tag === "All" || f.tag === tag);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setOpen((o) => (o === null ? o : (o + 1) % list.length));
      if (e.key === "ArrowLeft") setOpen((o) => (o === null ? o : (o - 1 + list.length) % list.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, list.length]);

  const cur = open !== null ? list[open] : null;
  return (
    <div>
      <section className="relative overflow-hidden bg-ink text-paper">
        <img src="/media/rooftop-array-aerial-poster.webp" alt="" className="absolute inset-0 size-full object-cover opacity-35" />
        <div className="absolute inset-0 bg-linear-to-t from-ink via-ink/60 to-ink/30" />
        <div className="container-x relative py-16 max-sm:py-7">
          <m.p className="eyebrow !text-sun-300" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            In the field
          </m.p>
          <m.h1 className="mt-3 max-w-3xl text-4xl font-semibold max-sm:text-[1.8rem] sm:text-6xl" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            Hardware that lives on Indian rooftops.
          </m.h1>
          <p className="mt-4 max-w-xl text-paper/70 max-lg:mt-2 max-lg:line-clamp-2 max-lg:text-sm">Heat, monsoon rain, coastal air. See how modules, inverters, junction boxes and mounting look installed and in stock.</p>
        </div>
      </section>

      <div className="container-x py-12 max-lg:py-4">
        <div className="flex flex-wrap gap-2 max-sm:scrollbar-none max-sm:-mx-4 max-sm:flex-nowrap max-sm:overflow-x-auto max-sm:px-4" role="tablist" aria-label="Filter photos">
          {TAGS.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tag === t} onClick={() => setTag(t)} className={`relative rounded-full px-4 py-1.5 text-sm font-medium ${tag === t ? "text-paper" : "text-ink/70 hover:text-ink"}`}>
              {tag === t && <m.span layoutId="field-tab" className="absolute inset-0 rounded-full bg-ink" />}
              <span className="relative">{t}</span>
            </button>
          ))}
        </div>
        <m.div layout className="mt-8 columns-1 gap-4 max-sm:mt-3 max-sm:columns-2 max-sm:gap-2 sm:columns-2 lg:columns-3">
          <AnimatePresence mode="popLayout">
            {list.map((f, k) => (
              <m.button
                layout
                key={f.src}
                type="button"
                onClick={() => setOpen(k)}
                className="group relative mb-4 block w-full overflow-hidden rounded-2xl bg-ink text-left break-inside-avoid max-sm:mb-2 max-sm:rounded-xl"
                initial={{ opacity: 0, y: 30, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: k * 0.05 }}
                data-testid="field-photo"
              >
                <img src={f.src} srcSet={srcSetFor(f.src)} sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 400px" onError={fallbackToOriginal} decoding="async" alt={f.caption} loading="lazy" className={`w-full object-cover transition duration-700 group-hover:scale-105 ${f.tall ? "aspect-[3/4]" : "aspect-[4/3]"}`} />
                <span className="absolute inset-x-0 bottom-0 translate-y-1 bg-linear-to-t from-ink/90 to-transparent p-4 pt-12 text-sm font-medium text-paper max-sm:p-2 max-sm:pt-8 max-sm:text-[11px] max-sm:leading-tight transition group-hover:translate-y-0">
                  <span className="mb-1 block font-mono text-[10px] tracking-[0.16em] text-sun-300 uppercase">{f.tag}</span>
                  {f.caption}
                </span>
              </m.button>
            ))}
          </AnimatePresence>
        </m.div>
      </div>

      <Modal open={cur !== null} onClose={() => setOpen(null)} title={cur?.caption ?? ""} size="full" fullscreenOnMobile>
        {cur && (
          <div
            className="relative flex h-[78dvh] items-center justify-center bg-ink max-sm:h-full"
            data-testid="photo-viewer"
            onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
            onTouchEnd={(e) => {
              if (touchX.current === null) return;
              const dx = e.changedTouches[0].clientX - touchX.current;
              touchX.current = null;
              if (Math.abs(dx) < 50 || !list.length) return;
              setOpen((o) => (o! + (dx < 0 ? 1 : -1) + list.length) % list.length);
            }}
          >
            <AnimatePresence mode="wait">
              <m.img key={cur.src} src={cur.src} alt={cur.caption} className="max-h-full max-w-full object-contain" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} />
            </AnimatePresence>
            <button type="button" className="absolute left-3 grid size-11 place-items-center rounded-full bg-white/15 text-paper backdrop-blur hover:bg-white/25" onClick={() => setOpen((o) => (o! - 1 + list.length) % list.length)} aria-label="Previous photo">
              <ChevronLeft className="size-6" />
            </button>
            <button type="button" className="absolute right-3 grid size-11 place-items-center rounded-full bg-white/15 text-paper backdrop-blur hover:bg-white/25" onClick={() => setOpen((o) => (o! + 1) % list.length)} aria-label="Next photo">
              <ChevronRight className="size-6" />
            </button>
          </div>
        )}
      </Modal>

      <section className="relative overflow-hidden bg-ink py-20 text-paper">
        <div className="absolute inset-0 grid-bg" aria-hidden="true" />
        <div className="container-x relative grid items-center gap-12 lg:grid-cols-2">
          <Reveal>
            <p className="eyebrow !text-verdi-300">Manufacturer quality testing</p>
            <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">Tested beyond the standard.</h2>
            <p className="mt-3 text-paper/70">Panasonic publishes details of extra testing on its solar modules. Here is what they state.</p>
            <ul className="mt-8 grid gap-4">
              {[
                { icon: Droplets, t: "Extended wet leakage test", d: "Modules submerged for 24 hours, against an industry practice of 1–2 hours, to verify insulation under moisture." },
                { icon: Flame, t: "Glow wire test at 900–1000 °C", d: "Glass, junction box and connector materials tested above the typical 750–850 °C (IEC 60695-2)." },
                { icon: Wind, t: "Extended wind load at 3800 Pa", d: "Mechanical robustness tested above the 2400 Pa commonly used." },
              ].map((x, i) => (
                <m.li key={x.t} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4" initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.12 }}>
                  <x.icon className="mt-0.5 size-5 shrink-0 text-sky-300" />
                  <div>
                    <p className="font-semibold">{x.t}</p>
                    <p className="mt-0.5 text-sm text-paper/65">{x.d}</p>
                  </div>
                </m.li>
              ))}
            </ul>
            <p className="mt-4 text-xs text-paper/45">Source: Panasonic Life Solutions India product safety & quality brochure.</p>
          </Reveal>
          <div className="grid grid-cols-2 gap-4">
            <m.img src="/images/site/panasonic-wet-leakage-test.webp" alt="Solar module undergoing an extended wet leakage test" loading="lazy" className="aspect-[4/5] w-full rounded-3xl object-cover" initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} />
            <m.img src="/images/site/panasonic-monsoon-rooftop.webp" alt="Solar modules on a rooftop in monsoon rain" loading="lazy" className="mt-12 aspect-[4/5] w-full rounded-3xl object-cover" initial={{ opacity: 0, y: 80 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.15 }} />
          </div>
        </div>
      </section>

      <div className="container-x flex flex-wrap items-center justify-between gap-4 py-12">
        <p className="text-lg font-semibold">Planning a project? Talk to us about the hardware.</p>
        <div className="flex flex-wrap gap-2">
          <Link to="/products" className="btn-ghost">
            Browse products
          </Link>
          <a href={SITE.whatsappUrl} target="_blank" rel="noopener" className="btn-primary">
            <WhatsAppIcon className="size-4" /> WhatsApp us
          </a>
        </div>
      </div>
    </div>
  );
}
