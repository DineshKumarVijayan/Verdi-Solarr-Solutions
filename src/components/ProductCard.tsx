import { StockPill } from "./StockBadge";
import { ShareButton } from "./ShareButton";
import { shareText } from "./StickyBuyBar";
import { Check, GitCompareArrows, Plus } from "lucide-react";
import { Link } from "react-router";
import type { PublicProduct } from "../../shared/types";
import { useBasket } from "../lib/basket";
import { keySpecs, useCatalogue } from "../lib/catalogue";
import { MAX_COMPARE, useCompare } from "../lib/compare";
import { DatasheetButton } from "./Datasheet";
import { Highlight } from "./Highlight";
import { PriceTag } from "./PriceTag";
import { ProductVisual } from "./ProductVisual";
import { useToast } from "./ui";

export function ProductCard({ product, query = "", layout = "grid" }: { product: PublicProduct; query?: string; layout?: "grid" | "list" }) {
  const { brand, category } = useCatalogue();
  const basket = useBasket();
  const compare = useCompare();
  const toast = useToast();
  const b = brand(product.brandId);
  const c = category(product.categoryId);
  const inBasket = basket.has(product.id);
  const inCompare = compare.has(product.id);
  const specs = keySpecs(product);

  const addToBasket = () => {
    basket.add(product.id, 1, { sellingPaise: product.price.sellingPaise, version: product.price.version });
    toast(
      <span>
        Added to enquiry ·{" "}
        <Link to="/enquiry" className="underline">
          View basket
        </Link>
      </span>,
      "success",
    );
  };

  return (
    <article
      className={`group card relative flex overflow-hidden transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] ${layout === "list" ? "flex-col sm:flex-row" : "flex-col"}`}
      data-testid="product-card"
    >
      <Link to={`/products/${product.slug}`} className={`block p-3 pb-0 ${layout === "list" ? "sm:w-60 sm:shrink-0 sm:pb-3" : ""}`} tabIndex={-1} aria-hidden="true">
        <ProductVisual product={product} categorySlug={c?.slug ?? ""} />
      </Link>
      <div className="flex flex-1 flex-col p-4 pt-3">
        <p className="eyebrow !text-[0.62rem] !text-muted">
          {b?.name} · {c?.name}
        </p>
        <h3 className="mt-1.5 text-[1.02rem] leading-snug font-semibold">
          <Link to={`/products/${product.slug}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
            <Highlight text={product.name} query={query} />
          </Link>
        </h3>
        {product.model && (
          <p className="num mt-1 text-xs text-muted">
            <Highlight text={product.model} query={query} />
          </p>
        )}
        {specs.length > 0 && (
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-dashed border-line pt-3">
            {specs.map((s) => (
              <div key={s.label} className="min-w-0">
                <dt className="text-[10px] tracking-wide text-subtle uppercase">{s.label}</dt>
                <dd className="num truncate text-[13px] text-ink">{s.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <StockPill stock={product.stock ?? "in_stock"} className="mt-3" />
        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <PriceTag price={product.price} size="sm" />
        </div>
        <div className="relative z-10 mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={addToBasket} className={inBasket ? "btn-ghost btn-sm" : "btn-primary btn-sm"} data-testid="add-to-enquiry">
            {inBasket ? <Check className="size-3.5" /> : <Plus className="size-3.5" />} {inBasket ? "Add another" : "Add to enquiry"}
          </button>
          <DatasheetButton url={product.datasheet} title={product.seriesName ?? product.name} variant="link" label="Datasheet" />
          {/* share + compare always stay together (they wrap as one, right-aligned) */}
          <div className="ml-auto flex shrink-0 items-center gap-2" data-testid="card-icons">
          <ShareButton variant="icon" title={product.name} text={shareText(product, brand(product.brandId)?.name ?? "")} path={`/products/${product.slug}`} />
          <button
            type="button"
            className={`rounded-full p-1.5 transition ${inCompare ? "bg-verdi-100 text-verdi-700" : "text-subtle hover:bg-paper-2 hover:text-ink"}`}
            aria-pressed={inCompare}
            aria-label={inCompare ? "Remove from comparison" : "Add to comparison"}
            title={inCompare ? "Remove from comparison" : "Compare"}
            onClick={() => {
              if (!compare.toggle(product.id)) toast(`You can compare up to ${MAX_COMPARE} products.`, "error");
            }}
          >
            <GitCompareArrows className="size-4" />
          </button>
          </div>
        </div>
      </div>
    </article>
  );
}
