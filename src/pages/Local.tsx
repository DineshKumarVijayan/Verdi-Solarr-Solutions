import { ArrowRight, BadgeCheck, ChevronDown, FileText, MapPin, ShieldCheck } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import data from "../../data/local-pages.json";
import { m, Reveal } from "../components/motion";
import { ProductCard } from "../components/ProductCard";
import { ProductRow } from "../components/ProductRow";
import { ClampText } from "../components/mobile/kit";
import { Spinner } from "../components/ui";
import { WhatsAppIcon } from "../components/WhatsAppIcon";
import { useCatalogue } from "../lib/catalogue";
import { usePageMeta } from "../lib/seo";
import { useSite } from "../lib/site";

export type LocalPage = (typeof data.pages)[number];
export const LOCAL_PAGES: LocalPage[] = data.pages;

/** Location landing page (e.g. /solar-panels-chennai): factual intro + live products + FAQ. */
export default function Local({ page }: { page: LocalPage }) {
  usePageMeta(page.metaTitle, page.description);
  const SITE = useSite();
  const { data: cat, category, brand, loading } = useCatalogue();
  const products = useMemo(() => (cat?.products ?? []).filter((p) => page.categories.length === 0 || page.categories.includes(category(p.categoryId)?.slug ?? "")), [cat, page, category]);
  const brands = [...new Set(products.map((p) => brand(p.brandId)?.name).filter(Boolean))];
  const shown = page.categories.length === 0 ? products.filter((p) => p.featured).concat(products.filter((p) => !p.featured)).slice(0, 12) : products;

  return (
    <div>
      <section className="relative overflow-hidden bg-ink text-paper">
        <img src="/media/hero-solar-farm-golden-1200.webp" alt="" className="absolute inset-0 size-full object-cover opacity-30" fetchPriority="high" />
        <div className="absolute inset-0 bg-linear-to-t from-ink via-ink/70 to-ink/30" />
        <div className="container-x relative py-14 max-sm:py-6 sm:py-20">
          <m.p className="eyebrow !text-sun-300" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {page.eyebrow}
          </m.p>
          <m.h1 className="mt-3 max-w-3xl text-4xl leading-tight font-semibold max-sm:text-[1.7rem] sm:text-6xl" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {page.title}
          </m.h1>
          <ClampText className="mt-4 max-w-2xl text-paper/75 max-lg:mt-2 max-lg:text-sm [&_button]:text-sun-300">{page.intro}</ClampText>
          <div className="mt-6 flex flex-wrap gap-2 max-lg:mt-3">
            <a href="#products" className="btn-sun">
              See products <ArrowRight className="size-4" />
            </a>
            <a href={`${SITE.whatsappUrl}?text=${encodeURIComponent(`Hello VERDI SOLARR, I am enquiring about ${page.title.toLowerCase()}.`)}`} target="_blank" rel="noopener" className="btn-ghost-dark">
              <WhatsAppIcon className="size-4" /> WhatsApp us
            </a>
          </div>
        </div>
      </section>

      <section className="container-x grid gap-4 py-10 max-sm:grid-cols-2 max-sm:gap-2 max-sm:py-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: FileText, t: "Real datasheets", d: "Every model links to the manufacturer’s original PDF." },
          { icon: ShieldCheck, t: "Listed prices", d: "Re-checked live before you send an enquiry." },
          { icon: BadgeCheck, t: brands.length ? brands.join(" · ") : "Multiple brands", d: "Brands currently listed in this range." },
          { icon: MapPin, t: "Based in Chennai", d: SITE.addressOneLine },
        ].map((x) => (
          <div key={x.t} className="card flex gap-3 p-4 max-sm:gap-2 max-sm:p-3">
            <x.icon className="mt-0.5 size-5 shrink-0 text-verdi-600" />
            <div className="min-w-0">
              <p className="font-semibold max-sm:truncate max-sm:text-sm">{x.t}</p>
              <p className="mt-0.5 text-sm text-muted max-sm:line-clamp-2 max-sm:text-xs">{x.d}</p>
            </div>
          </div>
        ))}
      </section>

      <section id="products" className="container-x scroll-mt-20 pb-12">
        <h2 className="text-2xl font-semibold max-sm:text-xl sm:text-3xl">{page.categories.length ? `Models available (${products.length})` : "Popular products"}</h2>
        {loading && !cat ? (
          <div className="mt-8 flex justify-center">
            <Spinner />
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-1 gap-4 max-lg:hidden sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
            <ul className="mt-2 divide-y divide-line/70 lg:hidden" data-testid="product-rows">
              {shown.map((p) => (
                <ProductRow key={p.id} product={p} />
              ))}
            </ul>
          </>
        )}
        <Link to="/products" className="mt-6 inline-flex items-center gap-1.5 font-semibold text-verdi-700 hover:underline">
          Browse the full catalogue <ArrowRight className="size-4" />
        </Link>
      </section>

      <section className="border-t border-line/70 bg-paper-2/60 py-12">
        <Reveal className="container-x max-w-3xl">
          <h2 className="text-2xl font-semibold">Frequently asked questions</h2>
          <div className="mt-5 grid gap-2">
            {page.faqs.map(([q, a]) => (
              <details key={q} className="card group p-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                  {q}
                  <ChevronDown className="size-4 shrink-0 text-subtle transition group-open:rotate-180" />
                </summary>
                <p className="mt-2 text-sm text-muted">{a}</p>
              </details>
            ))}
          </div>
          <p className="mt-8 text-sm text-muted">
            Also see:{" "}
            {LOCAL_PAGES.filter((p) => p.slug !== page.slug).map((p, i) => (
              <span key={p.slug}>
                {i > 0 && " · "}
                <Link className="text-verdi-700 hover:underline" to={`/${p.slug}`}>
                  {p.title}
                </Link>
              </span>
            ))}
          </p>
        </Reveal>
      </section>
    </div>
  );
}
