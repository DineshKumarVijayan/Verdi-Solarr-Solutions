import { ChevronLeft, ChevronRight, GitCompareArrows, Plus, X } from "lucide-react";
import type { PublicProduct } from "../../shared/types";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { formatPaise, gstLabel } from "../../shared/money";
import { DatasheetButton } from "../components/Datasheet";
import { useToast } from "../components/ui";
import { useBasket } from "../lib/basket";
import { useCatalogue } from "../lib/catalogue";
import { useCompare } from "../lib/compare";
import { usePageMeta } from "../lib/seo";

export default function Compare() {
  usePageMeta("Compare solar products", "Compare technical specifications and listed prices side by side.");
  const { ids, remove, clear } = useCompare();
  const { byId, brand } = useCatalogue();
  const basket = useBasket();
  const toast = useToast();
  const [diffOnly, setDiffOnly] = useState(false);
  const products = ids.map(byId).filter((p): p is NonNullable<typeof p> => !!p);

  const rows = useMemo(() => {
    const order: { k: string; l: string; g: string }[] = [];
    const seen = new Set<string>();
    for (const p of products)
      for (const s of p.specs)
        if (!seen.has(s.k)) {
          seen.add(s.k);
          order.push({ k: s.k, l: s.l, g: s.g });
        }
    return order.map((r) => {
      const values = products.map((p) => {
        const s = p.specs.find((x) => x.k === r.k);
        return s ? `${s.v}${s.u ? ` ${s.u}` : ""}` : "—";
      });
      return { ...r, values, differs: new Set(values).size > 1 };
    });
  }, [products]);

  if (products.length === 0) {
    return (
      <div className="container-x py-24 text-center">
        <GitCompareArrows className="mx-auto size-10 text-subtle" />
        <h1 className="mt-4 text-3xl font-semibold">Nothing to compare yet</h1>
        <p className="mt-2 text-muted">Use the compare icon on any product card. You can compare up to 4 products.</p>
        <Link to="/products" className="btn-primary mt-6">
          Browse products
        </Link>
      </div>
    );
  }

  return (
    <div className="container-x py-10 max-lg:pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4 max-lg:gap-2">
        <div>
          <h1 className="text-4xl font-semibold max-sm:text-2xl">Compare products</h1>
          <p className="mt-2 text-muted max-lg:mt-1 max-lg:text-sm">Specifications from manufacturer datasheets. Rows that differ are highlighted.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm max-lg:min-h-11">
            <input type="checkbox" className="size-4 accent-verdi-600" checked={diffOnly} onChange={(e) => setDiffOnly(e.target.checked)} />
            Show differences only
          </label>
          <button type="button" className="btn-ghost btn-sm" onClick={clear}>
            Clear
          </button>
        </div>
      </div>
      <MobileCompare products={products} rows={rows} diffOnly={diffOnly} onRemove={remove} />
      <div className="card relative mt-8 overflow-x-auto max-lg:hidden">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="align-top">
              <th scope="col" className="sticky left-0 z-10 w-48 bg-card p-4 text-left text-xs font-semibold text-muted">
                Product
              </th>
              {products.map((p) => (
                <th key={p.id} scope="col" className="min-w-52 p-4 text-left font-normal">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="eyebrow !text-[0.6rem] !text-muted">{brand(p.brandId)?.name}</p>
                      <Link to={`/products/${p.slug}`} className="mt-1 block font-semibold hover:underline">
                        {p.name}
                      </Link>
                      <p className="num mt-0.5 text-xs text-muted">{p.model}</p>
                    </div>
                    <button type="button" onClick={() => remove(p.id)} className="rounded-full p-1 text-subtle hover:bg-paper-2" aria-label={`Remove ${p.name} from comparison`}>
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={() => {
                        basket.add(p.id, 1, { sellingPaise: p.price.sellingPaise, version: p.price.version });
                        toast("Added to enquiry", "success");
                      }}
                    >
                      <Plus className="size-3.5" /> Enquire
                    </button>
                    <DatasheetButton url={p.datasheet} title={p.seriesName ?? p.name} variant="link" label="PDF" />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-line bg-verdi-50/60">
              <th scope="row" className="sticky left-0 bg-verdi-50 p-4 text-left text-xs font-semibold">
                Listed price
              </th>
              {products.map((p) => (
                <td key={p.id} className="num p-4">
                  {formatPaise(p.price.sellingPaise)}
                  {p.price.sellingPaise !== null && <span className="block text-[11px] text-muted">{p.price.unit} · {gstLabel(p.price)}</span>}
                </td>
              ))}
            </tr>
            {rows
              .filter((r) => !diffOnly || r.differs)
              .map((r) => (
                <tr key={r.k} className={`border-t border-line/70 ${r.differs && products.length > 1 ? "bg-sun-100/40" : ""}`}>
                  <th scope="row" className="sticky left-0 bg-card p-4 text-left text-xs font-normal text-muted">
                    {r.l}
                  </th>
                  {r.values.map((v, i) => (
                    <td key={i} className="num p-4 text-ink">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Phones (< lg): two products at a time with sticky headers; swipe (or ‹ ›) to move through
 * the comparison. One row per specification; the page itself never scrolls sideways.
 */
function MobileCompare({ products, rows, diffOnly, onRemove }: { products: PublicProduct[]; rows: { k: string; l: string; values: string[] }[]; diffOnly: boolean; onRemove: (id: number) => void }) {
  const { brand } = useCatalogue();
  const basket = useBasket();
  const toast = useToast();
  const [start, setStart] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);
  const maxStart = Math.max(0, products.length - 2);
  const s = Math.min(start, maxStart);
  const cols = [s, s + 1].filter((i) => i < products.length);
  const go = (d: number) => setStart(Math.max(0, Math.min(maxStart, s + d)));
  const shown = rows
    .map((r) => ({ ...r, pair: cols.map((i) => r.values[i]) }))
    .filter((r) => !diffOnly || new Set(r.pair).size > 1);
  return (
    <div
      className="mt-4 lg:hidden"
      data-testid="mobile-compare"
      onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX === null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        if (dx < -50) go(1);
        if (dx > 50) go(-1);
        setTouchX(null);
      }}
    >
      {products.length > 2 && (
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="tap grid place-items-center rounded-full border border-line bg-card disabled:opacity-40" onClick={() => go(-1)} disabled={s === 0} aria-label="Previous products">
            <ChevronLeft className="size-4" />
          </button>
          <p className="num text-xs text-muted" aria-live="polite" data-testid="compare-position">
            {s + 1}–{s + cols.length} of {products.length}
          </p>
          <button type="button" className="tap grid place-items-center rounded-full border border-line bg-card disabled:opacity-40" onClick={() => go(1)} disabled={s >= maxStart} aria-label="Next products">
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
      <div className={`sticky top-14 z-20 -mx-4 mt-2 grid gap-2 border-b border-line bg-paper/95 px-4 py-2 backdrop-blur-md ${cols.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {cols.map((i) => {
          const p = products[i];
          return (
            <div key={p.id} className="card relative min-w-0 p-3" data-testid="compare-head">
              <button type="button" onClick={() => onRemove(p.id)} className="tap absolute -top-1 -right-1 grid place-items-center text-subtle" aria-label={`Remove ${p.name} from comparison`}>
                <X className="size-4" />
              </button>
              <p className="truncate pr-6 text-[10px] font-medium tracking-wide text-muted uppercase">{brand(p.brandId)?.name}</p>
              <Link to={`/products/${p.slug}`} className="mt-0.5 line-clamp-2 min-h-[2.5em] text-[13px] leading-tight font-semibold">
                {p.name}
              </Link>
              <p className="num mt-1 truncate text-sm font-semibold">{formatPaise(p.price.sellingPaise)}</p>
              <button
                type="button"
                className="btn-primary btn-sm tap mt-2 w-full"
                onClick={() => {
                  basket.add(p.id, 1, { sellingPaise: p.price.sellingPaise, version: p.price.version });
                  toast("Added to enquiry", "success");
                }}
              >
                <Plus className="size-3.5" /> Enquire
              </button>
            </div>
          );
        })}
      </div>
      <dl className="mt-1">
        {shown.map((r) => {
          const differs = cols.length > 1 && new Set(r.pair).size > 1;
          return (
            <div key={r.k} className={`border-b border-line/70 py-2.5 ${differs ? "-mx-4 bg-sun-100/40 px-4" : ""}`} data-testid="compare-row">
              <dt className="text-xs text-muted">{r.l}</dt>
              <div className={`mt-1 grid ${cols.length > 1 ? "grid-cols-2 divide-x divide-line" : ""}`}>
                {r.pair.map((v, j) => (
                  <dd key={j} className="num min-w-0 text-[13px] leading-snug [overflow-wrap:anywhere] text-ink first:pr-3 [&:not(:first-child)]:pl-3">
                    {v}
                  </dd>
                ))}
              </div>
            </div>
          );
        })}
        {shown.length === 0 && <p className="py-6 text-center text-sm text-muted">These products have the same values for every specification.</p>}
      </dl>
    </div>
  );
}
