/**
 * Availability and offers, set by the owner or an admin per product (never guessed).
 * Every active product starts as "In stock" (the business's choice); "Out of stock" products can still be
 * enquired about. An offer is separate: a product can be in stock AND on offer.
 */
export const STOCK_STATUSES = ["in_stock", "limited", "out_of_stock"] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];
export const STOCK_LABEL: Record<StockStatus, string> = { in_stock: "In stock", limited: "Limited stock", out_of_stock: "Out of stock" };
/** schema.org availability for search engines (only shown with a listed price). */
export const STOCK_SCHEMA: Record<StockStatus, string> = {
  in_stock: "https://schema.org/InStock",
  limited: "https://schema.org/LimitedAvailability",
  out_of_stock: "https://schema.org/OutOfStock",
};
export const DEFAULT_OFFER_LABEL = "Special offer";

/** Real discount from the listed MRP and selling price (null when there is no MRP or no saving). */
export function percentOff(price: { sellingPaise: number | null; mrpPaise: number | null }): number | null {
  const { sellingPaise: s, mrpPaise: m } = price;
  if (s == null || m == null || m <= s || m <= 0) return null;
  const pct = Math.round(((m - s) / m) * 100);
  return pct >= 1 ? pct : null;
}
