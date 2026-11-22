import { ArrowRight, Tag } from "lucide-react";
import { Link } from "react-router";
import { percentOff } from "../../../shared/stock";
import { useCatalogue } from "../../lib/catalogue";
import { Reveal } from "../motion";
import { ProductCard } from "../ProductCard";
import { ProductRow } from "../ProductRow";

/**
 * "On offer now": products the owner/admin put on offer (biggest real discount first). Appears only when
 * there are offers, so the home page never shows an empty section.
 */
export function OffersStrip() {
  const { data } = useCatalogue();
  const offers = (data?.products ?? [])
    .filter((p) => p.offer)
    .sort((a, b) => (percentOff(b.price) ?? 0) - (percentOff(a.price) ?? 0) || Number(b.featured) - Number(a.featured))
    .slice(0, 8);
  if (offers.length === 0) return null;
  return (
    <section className="py-12 sm:py-16" aria-labelledby="offers-h" data-testid="offers-strip">
      <div className="container-x">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-2xl">
              <p className="eyebrow flex items-center gap-1.5">
                <Tag className="size-3.5 text-sun-500" /> Offers
              </p>
              <h2 id="offers-h" className="mt-2 text-3xl font-semibold tracking-tight max-lg:text-2xl">
                On offer now
              </h2>
              <p className="mt-2 text-muted">Special prices on selected products, for a limited time. Prices are re-checked when you send your enquiry.</p>
            </div>
            <Link to="/products?offer=1" className="btn-ghost btn-sm max-lg:tap" data-testid="offers-all">
              See all offers <ArrowRight className="size-4" />
            </Link>
          </div>
        </Reveal>
        <div className="mt-8 grid gap-4 max-lg:hidden sm:grid-cols-2 lg:grid-cols-4">
          {offers.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
      <div className="scrollbar-none mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 lg:hidden">
        {offers.map((p) => (
          <div key={p.id} className="w-[44%] max-w-48 shrink-0 snap-start">
            <ProductRow product={p} mode="tile" />
          </div>
        ))}
      </div>
    </section>
  );
}
