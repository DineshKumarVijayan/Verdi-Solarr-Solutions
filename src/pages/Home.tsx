import { ArrowRight, BookOpen, Calculator, ClipboardList, FileText, Layers, MapPin, Phone, ShieldCheck } from "lucide-react";
import { ProductRow } from "../components/ProductRow";
import { Link } from "react-router";
import { CatalogueShowcase } from "../components/home/CatalogueShowcase";
import { Hero } from "../components/home/Hero";
import { VideoBand } from "../components/home/VideoBand";
import { Reveal, Stagger, StaggerItem } from "../components/motion";
import { SectionHeading } from "../components/ui";
import { WhatsAppIcon } from "../components/WhatsAppIcon";
import { useCatalogue } from "../lib/catalogue";
import { usePageMeta } from "../lib/seo";
import { useSite } from "../lib/site";

export default function Home() {
  const SITE = useSite();
  usePageMeta(
    "VERDI SOLARR SOLUTION — Solar panels, inverters & solar electricals for businesses",
    "B2B supplier of solar panels, inverters, solar DC cables and solar electrical components in Chennai. Browse real datasheets, compare specifications and send a WhatsApp enquiry.",
  );
  const { data } = useCatalogue();

  // Counted from the live catalogue; a figure that is zero (e.g. no datasheets uploaded yet) is not shown.
  const datasheetCount = new Set((data?.products ?? []).map((p) => p.datasheet).filter(Boolean)).size;
  const usedCategories = new Set((data?.products ?? []).map((p) => p.categoryId)).size;
  const stats = data
    ? [
        { k: "Product models", v: data.products.length },
        { k: "Manufacturer datasheets", v: datasheetCount },
        { k: "Brands", v: new Set(data.products.map((p) => p.brandId)).size },
        { k: "Product categories", v: usedCategories },
      ].filter((x) => x.v > 0)
    : [];

  return (
    <>
      <Hero stats={stats} />
      <CatalogueShowcase />

      <VideoBand />

      {/* how enquiries work */}
      <section className="container-x py-12 sm:py-20">
        <Reveal>
          <SectionHeading eyebrow="How enquiries work" title="From shortlist to quotation in three steps." align="center" />
        </Reveal>
        <Stagger className="scrollbar-none -mx-4 mt-8 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mt-12 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0">
          {[
            { icon: Layers, t: "Shortlist", d: "Search by wattage, kW, phase or model. Open the actual manufacturer datasheet without leaving the page." },
            { icon: ClipboardList, t: "Build your enquiry", d: "Add products and quantities. We re-check every listed price against our live database before you send." },
            { icon: WhatsAppIcon, t: "Confirm on WhatsApp", d: "Review a ready-made message and send it to us on WhatsApp. We confirm final pricing, taxes, availability and delivery." },
          ].map((s, i) => (
            <StaggerItem key={s.t} className="w-[82%] shrink-0 snap-start md:w-auto">
              <div className="card relative h-full p-6 transition hover:-translate-y-1 hover:shadow-[var(--shadow-lift)]">
                <span className="num absolute top-5 right-6 text-5xl text-paper-3">{i + 1}</span>
                <s.icon className="size-6 text-verdi-600" />
                <h3 className="mt-4 text-xl font-semibold">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.d}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* tools / learn */}
      <FeaturedRow />

      <section className="container-x grid gap-4 pb-12 max-sm:grid-cols-2 max-sm:gap-3 max-sm:pb-8 sm:pb-20 lg:grid-cols-2">
        <Reveal>
          <Link to="/solar-tools" className="group relative block h-full overflow-hidden rounded-[2rem] bg-ink p-6 text-paper max-sm:rounded-3xl max-sm:p-4 sm:p-10">
            <img src="/images/site/metal-roof-rails.webp" alt="" className="absolute inset-0 size-full object-cover opacity-25 transition duration-700 group-hover:scale-105" />
            <div className="relative">
              <Calculator className="size-7 text-sun-400" />
              <h2 className="mt-5 text-3xl font-semibold max-sm:mt-3 max-sm:text-lg max-sm:leading-snug">Solar tools that do the maths.</h2>
              <p className="mt-3 max-w-md text-paper/70 max-sm:hidden">Appliance load, system size, savings, roof fit, battery backup, losses and a kit builder that uses real catalogue products.</p>
              <span className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-sun-300 max-sm:mt-3">
                Open the toolkit <ArrowRight className="size-4 transition group-hover:translate-x-1" />
              </span>
            </div>
          </Link>
        </Reveal>
        <Reveal delay={0.1}>
          <Link to="/learn" className="group relative block h-full overflow-hidden rounded-[2rem] border border-line bg-verdi-50 p-6 max-sm:rounded-3xl max-sm:p-4 sm:p-10">
            <BookOpen className="size-7 text-verdi-600" />
            <h2 className="mt-5 text-3xl font-semibold max-sm:mt-3 max-sm:text-lg max-sm:leading-snug">Learn solar, visually.</h2>
            <p className="mt-3 max-w-md text-muted max-sm:hidden">24 animated lessons: solar cells, TOPCon vs PERC, MPPT, bifacial gain, cable losses, earthing, PM Surya Ghar and more.</p>
            <span className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-verdi-700 max-sm:mt-3">
              Visit the Learning Hub <ArrowRight className="size-4 transition group-hover:translate-x-1" />
            </span>
          </Link>
        </Reveal>
      </section>

      {/* trust band */}
      <section className="border-t border-line/70 bg-card">
        <Stagger className="container-x scrollbar-none flex snap-x snap-mandatory gap-6 overflow-x-auto py-10 md:grid md:grid-cols-3 md:gap-8 md:overflow-visible md:py-14">
          {[
            { icon: FileText, t: "Real datasheets", d: "Specifications are transcribed from manufacturer PDFs, and you can open the original in one click." },
            { icon: ShieldCheck, t: "Honest pricing", d: "Listed prices come from our live database and are re-checked before every enquiry. Final quotes are confirmed by our team." },
            { icon: WhatsAppIcon, t: "Talk to a person", d: `Call or WhatsApp us on ${SITE.phoneDisplay} for project quantities and delivery.` },
          ].map((x) => (
            <StaggerItem key={x.t} className="w-[80%] shrink-0 snap-start md:w-auto">
              <div className="flex gap-4">
                <x.icon className="mt-1 size-5 shrink-0 text-verdi-600" />
                <div>
                  <h3 className="font-semibold">{x.t}</h3>
                  <p className="mt-1 text-sm text-muted">{x.d}</p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>
      <ContactCard />
    </>
  );
}

/** Phones: a swipe row of products (admin-featured ones first; any number, any photos). */
function FeaturedRow() {
  const { data } = useCatalogue();
  const all = data?.products ?? [];
  const featured = all.filter((p) => p.featured);
  const items = (featured.length ? featured : all).slice(0, 10);
  if (!items.length) return null;
  return (
    <section className="pb-8 lg:hidden" aria-labelledby="featured-h" data-testid="featured-row">
      <div className="container-x flex items-end justify-between gap-3">
        <h2 id="featured-h" className="text-xl font-semibold">
          {featured.length ? "Featured products" : "From the catalogue"}
        </h2>
        <Link to="/products" className="tap inline-flex items-center gap-1 text-sm font-semibold text-verdi-700">
          See all <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="scrollbar-none mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
        {items.map((p) => (
          <div key={p.id} className="w-[44%] max-w-48 shrink-0 snap-start">
            <ProductRow product={p} mode="tile" />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Phones: big tap targets to reach a person (contact details come from Admin → Settings). */
function ContactCard() {
  const SITE = useSite();
  const tile = "tap flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/5 p-3 text-xs font-medium";
  return (
    <section className="bg-ink px-4 py-6 text-paper lg:hidden" aria-labelledby="contact-h" data-testid="home-contact">
      <h2 id="contact-h" className="text-xl font-semibold">
        Talk to a person
      </h2>
      <p className="mt-1 text-sm text-paper/65">{SITE.addressOneLine}</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <a href={SITE.phoneHref} className={tile}>
          <Phone className="size-5 text-sky-300" /> Call
        </a>
        <a href={SITE.whatsappUrl} target="_blank" rel="noopener" className={tile}>
          <WhatsAppIcon className="size-5 text-[#25d366]" /> WhatsApp
        </a>
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(SITE.addressOneLine)}`} target="_blank" rel="noopener" className={tile}>
          <MapPin className="size-5 text-sun-300" /> Directions
        </a>
      </div>
    </section>
  );
}
