import { Check, Plus } from "lucide-react";
import { Link } from "react-router";
import { formatPaise } from "../../shared/money";
import type { PublicProduct } from "../../shared/types";
import { useBasket } from "../lib/basket";
import { keySpecs, useCatalogue } from "../lib/catalogue";
import { Highlight } from "./Highlight";
import { ProductVisual } from "./ProductVisual";
import { useToast } from "./ui";

/**
 * Phone product list item (< lg). `row`: 64 px row (photo, one-line name, key spec, price, "+").
 * `tile`: compact 2-column card. Everything comes from the product data, so any number of
 * products, any photo shape, missing photos (labelled illustration) and long names all fit.
 */
export function ProductRow({ product, query = "", mode = "row" }: { product: PublicProduct; query?: string; mode?: "row" | "tile" }) {
  const { brand, category } = useCatalogue();
  const basket = useBasket();
  const toast = useToast();
  const c = category(product.categoryId);
  const inBasket = basket.has(product.id);
  const spec = keySpecs(product)
    .slice(0, 2)
    .map((s) => s.value)
    .join(" · ");
  const sub = [brand(product.brandId)?.name, spec].filter(Boolean).join(" · ");
  const price =
    product.price.sellingPaise === null ? (
      <span className="text-xs font-medium text-muted">Price on request</span>
    ) : (
      <span className="num text-sm font-semibold text-ink">{formatPaise(product.price.sellingPaise)}</span>
    );
  const add = (
    <button
      type="button"
      onClick={() => {
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
      }}
      className={`tap relative z-10 grid shrink-0 place-items-center rounded-full ${inBasket ? "bg-verdi-50 text-verdi-700" : "bg-verdi-600 text-white"}`}
      aria-label={`${inBasket ? "Add another" : "Add to enquiry"}: ${product.name}`}
      data-testid="row-add"
    >
      {inBasket ? <Check className="size-5" /> : <Plus className="size-5" />}
    </button>
  );
  const href = `/products/${product.slug}`;

  if (mode === "tile")
    return (
      <article className="card relative flex min-w-0 flex-col overflow-hidden p-2" data-testid="product-row">
        <ProductVisual product={product} categorySlug={c?.slug ?? ""} size="thumb" />
        <h3 className="mt-2 line-clamp-2 min-h-[2.5em] px-1 text-[13px] leading-tight font-semibold">
          <Link to={href} className="after:absolute after:inset-0 after:content-['']">
            <Highlight text={product.name} query={query} />
          </Link>
        </h3>
        {spec && <p className="num mt-1 truncate px-1 text-[11px] text-muted">{spec}</p>}
        <div className="mt-auto flex items-center justify-between gap-1 pt-2 pl-1">
          <span className="min-w-0 truncate">{price}</span>
          {add}
        </div>
      </article>
    );

  return (
    <li className="relative flex min-h-16 items-center gap-3 py-2" data-testid="product-row">
      <span className="w-14 shrink-0" aria-hidden="true">
        <ProductVisual product={product} categorySlug={c?.slug ?? ""} size="thumb" />
      </span>
      <span className="min-w-0 flex-1">
        <Link to={href} className="block truncate text-sm font-semibold after:absolute after:inset-0 after:content-['']">
          <Highlight text={product.name} query={query} />
        </Link>
        {sub && <span className="mt-0.5 block truncate text-xs text-muted">{sub}</span>}
        <span className="mt-0.5 block">{price}</span>
      </span>
      {add}
    </li>
  );
}

/** Grey placeholder rows while the catalogue loads (phones). */
export function ProductRowSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul className="divide-y divide-line/70 lg:hidden" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="flex items-center gap-3 py-2">
          <span className="size-14 shrink-0 animate-pulse rounded-xl bg-paper-2" />
          <span className="flex-1 space-y-2">
            <span className="block h-3 w-3/4 animate-pulse rounded bg-paper-2" />
            <span className="block h-3 w-1/2 animate-pulse rounded bg-paper-2" />
          </span>
          <span className="size-11 animate-pulse rounded-full bg-paper-2" />
        </li>
      ))}
    </ul>
  );
}
