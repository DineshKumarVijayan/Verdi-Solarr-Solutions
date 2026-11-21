import { ShareButton } from "../components/ShareButton";
import { shareText, StickyBuyBar } from "../components/StickyBuyBar";
import { Check, ChevronDown, Download, FileText, GitCompareArrows, Minus, Plus } from "lucide-react";
import { WhatsAppIcon } from "../components/WhatsAppIcon";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import type { PublicProduct } from "../../shared/types";
import { DatasheetButton, useDatasheet } from "../components/Datasheet";
import { PriceTag } from "../components/PriceTag";
import { ProductCard } from "../components/ProductCard";
import { ProductGallery } from "../components/ProductGallery";
import { Spinner, useToast } from "../components/ui";
import { ClampText } from "../components/mobile/kit";
import { ProductRow } from "../components/ProductRow";
import { useBasket } from "../lib/basket";
import { keySpecs, seriesSiblings, useCatalogue } from "../lib/catalogue";
import { MAX_COMPARE, useCompare } from "../lib/compare";
import { usePageMeta } from "../lib/seo";
import { useSite } from "../lib/site";

const PAIRS: Record<string, string[]> = {
  "solar-panels": ["solar-inverters", "solar-dc-cables", "power-optimisers"],
  "solar-inverters": ["solar-panels", "solar-dc-cables"],
  "power-optimisers": ["solar-inverters", "solar-panels"],
  "solar-dc-cables": ["solar-panels", "solar-inverters"],
  "solar-street-lights": [],
};

export default function ProductDetail() {
  const { slug = "" } = useParams();
  const { data, loading, bySlug, brand, category } = useCatalogue();
  const product = bySlug(slug);
  usePageMeta(product ? `${product.name}${product.model ? ` (${product.model})` : ""}` : "Product", product?.short ?? undefined);

  if (loading && !product) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted">
        <Spinner />
      </div>
    );
  }
  if (!product) {
    return (
      <div className="container-x py-24 text-center">
        <h1 className="text-3xl font-semibold">Product not found</h1>
        <p className="mt-2 text-muted">It may have been renamed or archived.</p>
        <Link to="/products" className="btn-primary mt-6">
          Browse products
        </Link>
      </div>
    );
  }
  return <Detail key={product.id} product={product} all={data?.products ?? []} brandName={brand(product.brandId)?.name ?? ""} cat={category(product.categoryId)} />;
}

function Detail({ product, all, brandName, cat }: { product: PublicProduct; all: PublicProduct[]; brandName: string; cat?: { id: number; slug: string; name: string } }) {
  const SITE = useSite();
  const basket = useBasket();
  const compare = useCompare();
  const toast = useToast();
  const openDatasheet = useDatasheet();
  const { category } = useCatalogue();
  const [qty, setQty] = useState(1);
  // phones: Overview · Specs · Datasheet · Compatible tabs (desktop shows every section as before)
  const [tab, setTab] = useState<"overview" | "specs" | "datasheet" | "compat">("overview");
  const hide = (t: typeof tab) => (tab === t ? "" : "max-lg:hidden");
  const siblings = seriesSiblings(all, product);
  const specs = keySpecs(product);

  const groups = useMemo(() => {
    const m = new Map<string, PublicProduct["specs"]>();
    for (const s of product.specs) {
      if (!m.has(s.g)) m.set(s.g, []);
      m.get(s.g)!.push(s);
    }
    return [...m.entries()];
  }, [product]);

  const related = useMemo(() => {
    const pairCats = PAIRS[cat?.slug ?? ""] ?? [];
    const sameCat = all.filter((p) => p.categoryId === product.categoryId && p.seriesKey !== product.seriesKey);
    const paired = all.filter((p) => pairCats.includes(category(p.categoryId)?.slug ?? ""));
    // one representative per series
    const seen = new Set<string>();
    return [...sameCat, ...paired].filter((p) => {
      const k = p.seriesKey ?? String(p.id);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).slice(0, 4);
  }, [all, product, cat, category]);

  const waText = `Hello VERDI SOLARR, I would like a quote for:\n${product.name}${product.model ? ` (Model: ${product.model})` : ""}\nBrand: ${brandName}\nQuantity: ${qty}\n\nPage: ${typeof window !== "undefined" ? window.location.href : ""}`;

  return (
    <div className="pb-20">
      <div className="container-x pt-8 max-lg:pt-0">
        <nav aria-label="Breadcrumb" className="text-xs text-muted max-lg:hidden">
          <ol className="flex flex-wrap gap-1.5">
            <li><Link to="/" className="hover:text-ink">Home</Link> /</li>
            <li><Link to="/products" className="hover:text-ink">Products</Link> /</li>
            {cat && <li><Link to={`/category/${cat.slug}`} className="hover:text-ink">{cat.name}</Link> /</li>}
            <li aria-current="page" className="text-ink">{product.variant ?? product.name}</li>
          </ol>
        </nav>
      </div>

      <section className="container-x mt-6 grid gap-10 max-lg:mt-3 max-lg:gap-4 lg:grid-cols-[1.05fr_1fr]">
        <div className="grid content-start gap-4">
          <ProductGallery product={product} categorySlug={cat?.slug ?? ""} />
          {product.datasheet && (
            <div className="card flex flex-wrap items-center gap-4 p-4 max-lg:hidden">
              <div className="grid size-12 place-items-center rounded-xl bg-danger-bg text-danger">
                <FileText className="size-6" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Manufacturer datasheet</p>
                <p className="truncate text-xs text-muted">{product.seriesName} · PDF</p>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-dark btn-sm" onClick={() => openDatasheet(product.datasheet!, product.seriesName ?? product.name)} data-testid="preview-datasheet">
                  Preview
                </button>
                <a href={product.datasheet} download className="btn-ghost btn-sm" aria-label="Download datasheet PDF">
                  <Download className="size-3.5" />
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="relative">
          <ShareButton variant="icon" className="absolute -top-1 right-0 lg:hidden" title={product.name} text={shareText(product, brandName)} path={`/products/${product.slug}`} />
          <p className="eyebrow max-lg:pr-12">
            {brandName} · {cat?.name}
          </p>
          <h1 className="mt-3 text-3xl leading-tight font-semibold max-sm:mt-1.5 max-sm:text-2xl sm:text-4xl">{product.name}</h1>
          {product.model && <p className="num mt-2 text-sm text-muted max-lg:mt-1 max-lg:text-xs">Model {product.model} · SKU {product.sku}</p>}
          {specs.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5 lg:hidden" aria-label="Key specifications" data-testid="spec-chips">
              {specs.slice(0, 4).map((s) => (
                <li key={s.label} className="chip num !cursor-default !py-1">
                  <span className="text-subtle">{s.label}</span> {s.value}
                </li>
              ))}
            </ul>
          )}
          {product.short && <ClampText className="mt-4 text-base leading-relaxed text-ink/80 max-lg:mt-3 max-lg:text-sm">{product.short}</ClampText>}

          {siblings.length > 1 && (
            <div className="mt-6">
              <p className="mb-2 text-xs font-semibold text-ink/70">Available ratings in this family</p>
              <div className="flex flex-wrap gap-2" role="list">
                {siblings.map((s) => (
                  <Link key={s.id} role="listitem" to={`/products/${s.slug}`} className={`chip num ${s.id === product.id ? "chip-on" : ""}`} aria-current={s.id === product.id ? "page" : undefined}>
                    {s.variant}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <StickyBuyBar product={product} qty={qty} setQty={setQty} whatsappHref={`${SITE.whatsappUrl}?text=${encodeURIComponent(waText)}`} />
          <div className="card mt-6 p-5 max-lg:mt-4 max-lg:p-4" id="buy-box">
            <PriceTag price={product.price} size="lg" />
            {product.price.sellingPaise !== null && product.price.updatedAt && (
              <p className="mt-1 text-[11px] text-subtle">Listed price updated {new Date(product.price.updatedAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}. Re-checked when you send your enquiry.</p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-3 max-lg:hidden">
              <div className="flex items-center rounded-full border border-line bg-paper" role="group" aria-label="Quantity">
                <button type="button" className="p-2.5 text-muted hover:text-ink" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity">
                  <Minus className="size-4" />
                </button>
                <input aria-label="Quantity" className="num w-14 bg-transparent text-center text-sm outline-none" inputMode="numeric" value={qty} onChange={(e) => setQty(Math.max(1, Math.min(100000, Number(e.target.value.replace(/\D/g, "")) || 1)))} />
                <button type="button" className="p-2.5 text-muted hover:text-ink" onClick={() => setQty((q) => Math.min(100000, q + 1))} aria-label="Increase quantity">
                  <Plus className="size-4" />
                </button>
              </div>
              <button
                type="button"
                className="btn-primary flex-1"
                data-testid="add-to-enquiry-main"
                onClick={() => {
                  basket.add(product.id, qty, { sellingPaise: product.price.sellingPaise, version: product.price.version });
                  toast(
                    <span>
                      Added {qty} to enquiry ·{" "}
                      <Link to="/enquiry" className="underline">
                        View basket
                      </Link>
                    </span>,
                    "success",
                  );
                }}
              >
                <Plus className="size-4" /> Add to enquiry
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <a href={`${SITE.whatsappUrl}?text=${encodeURIComponent(waText)}`} target="_blank" rel="noopener" className="btn-ghost btn-sm">
                <WhatsAppIcon className="size-3.5" /> Quick WhatsApp enquiry
              </a>
              <button
                type="button"
                className={`btn-ghost btn-sm ${compare.has(product.id) ? "!border-verdi-500 !bg-verdi-50" : ""}`}
                aria-pressed={compare.has(product.id)}
                onClick={() => {
                  if (!compare.toggle(product.id)) toast(`You can compare up to ${MAX_COMPARE} products.`, "error");
                }}
              >
                {compare.has(product.id) ? <Check className="size-3.5" /> : <GitCompareArrows className="size-3.5" />} {compare.has(product.id) ? "In comparison" : "Compare"}
              </button>
              <ShareButton className="max-lg:hidden" title={product.name} text={shareText(product, brandName)} path={`/products/${product.slug}`} />
              {compare.ids.length > 1 && (
                <Link to="/compare" className="btn-ghost btn-sm">
                  View comparison ({compare.ids.length})
                </Link>
              )}
            </div>
          </div>

          {product.highlights.length > 0 && (
            <ul className={`mt-6 grid gap-2.5 ${hide("overview")}`}>
              {product.highlights.map((h) => (
                <li key={h} className="flex gap-2.5 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-verdi-600" />
                  {h}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div role="tablist" aria-label="Product details" className="m-tabs top-14 mt-5 lg:hidden" data-testid="product-tabs">
        {(
          [
            ["overview", "Overview", true],
            ["specs", "Specs", groups.length > 0],
            ["datasheet", "Datasheet", !!product.datasheet],
            ["compat", "Compatible", related.length > 0],
          ] as const
        )
          .filter(([, , show]) => show)
          .map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className="m-tab" onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
      </div>
      {product.datasheet && (
        <section className={`container-x mt-4 lg:hidden ${hide("datasheet")}`} aria-label="Datasheet" data-testid="datasheet-panel">
          <div className="card flex items-center gap-3 p-4">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-danger-bg text-danger">
              <FileText className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Manufacturer datasheet</p>
              <p className="truncate text-xs text-muted">{product.seriesName ?? product.name} · PDF</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <button type="button" className="btn-dark tap" onClick={() => openDatasheet(product.datasheet!, product.seriesName ?? product.name)} data-testid="m-open-datasheet">
              <FileText className="size-4" /> Open full screen
            </button>
            <a href={product.datasheet} download className="btn-ghost tap" aria-label="Download datasheet PDF">
              <Download className="size-4" />
            </a>
          </div>
        </section>
      )}

      {specs.length > 0 && (
        <section className="container-x mt-12 max-lg:hidden" aria-label="Key specifications">
          <dl className={`grid grid-cols-2 overflow-hidden rounded-[var(--radius-card)] border border-line bg-ink text-paper ${specs.length === 3 ? "sm:grid-cols-3" : specs.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-4"}`}>
            {specs.map((s) => (
              <div key={s.label} className="border-white/10 p-5 [&:not(:last-child)]:border-r">
                <dt className="font-mono text-[10px] tracking-[0.16em] text-paper/45 uppercase">{s.label}</dt>
                <dd className="num mt-1 text-xl sm:text-2xl">{s.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="container-x mt-12 grid gap-10 max-lg:mt-4 lg:grid-cols-[1.4fr_1fr]">
        <div className={hide("specs")}>
          <h2 className="text-2xl font-semibold max-lg:text-lg">Technical specifications</h2>
          <p className="mt-1 text-sm text-muted">Transcribed from the manufacturer datasheet. Open the PDF for curves, drawings and footnotes.</p>
          <div className="mt-5 grid gap-3">
            {groups.map(([g, rows], i) => (
              <details key={g} open={i < 2} className="group card overflow-hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold">
                  {g}
                  <span className="flex items-center gap-3">
                    <span className="num text-xs font-normal text-subtle">{rows.length}</span>
                    <ChevronDown className="size-4 transition group-open:rotate-180" />
                  </span>
                </summary>
                <table className="w-full text-sm">
                  <tbody>
                    {rows.map((s) => (
                      <tr key={s.k} className="border-t border-line/70">
                        <th scope="row" className="w-1/2 px-3 py-2.5 text-left font-normal [overflow-wrap:anywhere] text-muted max-lg:border-r max-lg:border-line/70 min-[360px]:px-5">
                          {s.l}
                        </th>
                        <td className="num px-3 py-2.5 [overflow-wrap:anywhere] text-ink min-[360px]:px-5">
                          {s.v}
                          {s.u ? <span className="text-subtle"> {s.u}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            ))}
          </div>
        </div>
        <div className={hide("overview")}>
          <h2 className="text-2xl font-semibold max-lg:text-lg">About this product</h2>
          <p className="mt-4 leading-relaxed text-ink/80">{product.description}</p>
          <div className="mt-6">
            <DatasheetButton url={product.datasheet} title={product.seriesName ?? product.name} variant="dark" label="Read the full datasheet" />
          </div>
          <div className="mt-8 rounded-[var(--radius-card)] border border-dashed border-line p-5 text-sm text-muted">
            <p className="font-semibold text-ink">Need help choosing?</p>
            <p className="mt-1">
              Try the <Link className="text-verdi-700 underline" to="/solar-tools/kit-builder">Kit Builder</Link> or the{" "}
              <Link className="text-verdi-700 underline" to="/learn/datasheet-decoder">datasheet decoder</Link>, or call us on{" "}
              <a className="text-verdi-700 underline" href={SITE.phoneHref}>
                {SITE.phoneDisplay}
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className={`container-x mt-16 max-lg:mt-4 ${hide("compat")}`}>
          <h2 className="text-2xl font-semibold max-lg:text-lg">Related products</h2>
          <div className="mt-6 grid gap-4 max-lg:hidden sm:grid-cols-2 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          <ul className="mt-2 divide-y divide-line/70 lg:hidden">
            {related.map((p) => (
              <ProductRow key={p.id} product={p} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
