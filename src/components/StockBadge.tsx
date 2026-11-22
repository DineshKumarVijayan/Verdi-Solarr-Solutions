import { Tag } from "lucide-react";
import { DEFAULT_OFFER_LABEL, percentOff, STOCK_LABEL, type StockStatus } from "../../shared/stock";
import type { PublicProduct } from "../../shared/types";

const DOT: Record<StockStatus, string> = { in_stock: "bg-verdi-500", limited: "bg-sun-500", out_of_stock: "bg-subtle" };
const TEXT: Record<StockStatus, string> = { in_stock: "text-verdi-700", limited: "text-sun-600", out_of_stock: "text-muted" };

/** "● In stock" / "● Limited stock" / "● Out of stock" (the in-stock dot gently pulses). */
export function StockPill({ stock, className = "", compact = false }: { stock: StockStatus; className?: string; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${TEXT[stock]} ${className}`} data-testid="stock-status" data-stock={stock}>
      <span className="relative flex size-2 shrink-0" aria-hidden="true">
        {stock === "in_stock" && <span className="absolute inline-flex size-full rounded-full bg-verdi-400 opacity-60 motion-safe:animate-ping" />}
        <span className={`relative inline-flex size-2 rounded-full ${DOT[stock]}`} />
      </span>
      {compact && stock === "limited" ? "Limited" : STOCK_LABEL[stock]}
    </span>
  );
}

/** The offer label with the real % off (from the listed MRP), e.g. "Festival offer · 18% off". */
export function offerText(p: PublicProduct): string | null {
  if (!p.offer) return null;
  const pct = percentOff(p.price);
  return `${p.offer.label || DEFAULT_OFFER_LABEL}${pct ? ` · ${pct}% off` : ""}`;
}

/** Sun-coloured offer tag. On photos it sits in the top-left corner. */
export function OfferTag({ product, onImage = false, small = false }: { product: PublicProduct; onImage?: boolean; small?: boolean }) {
  const text = offerText(product);
  if (!text) return null;
  const pct = percentOff(product.price);
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full bg-sun-400 font-semibold text-ink shadow-sm ${small ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"} ${onImage ? "absolute top-2 left-2 z-[1] shadow-[0_6px_16px_-6px_rgba(249,162,27,0.9)]" : ""}`}
      data-testid="offer-tag"
    >
      <Tag className={small ? "size-3 shrink-0" : "size-3.5 shrink-0"} aria-hidden="true" />
      <span className="truncate">{small ? (pct ? `${pct}% off` : "Offer") : text}</span>
    </span>
  );
}

/** Overlay for product photos/illustrations: offer tag and an "Out of stock" label. */
export function StatusOverlay({ product, size }: { product: PublicProduct; size: "card" | "hero" | "thumb" }) {
  return (
    <>
      <OfferTag product={product} onImage small={size === "thumb"} />
      {product.stock === "out_of_stock" && size !== "thumb" && (
        <span className="absolute right-2 bottom-2 z-[1] rounded-full bg-ink/80 px-2.5 py-1 text-[11px] font-semibold text-paper backdrop-blur-sm">Out of stock</span>
      )}
    </>
  );
}
