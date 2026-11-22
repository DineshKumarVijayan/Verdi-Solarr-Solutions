// Client-side catalogue search. Runs entirely in the browser against the cached
// public catalogue snapshot — no network request per keystroke.

import type { PublicCatalogue, PublicProduct } from "./types";

export interface IndexedProduct {
  p: PublicProduct;
  brand: string;
  category: string;
  categorySlug: string;
  brandSlug: string;
  /** field text, lowercase, with derived tokens like "620wp", "5kw", "threephase" */
  fields: { text: string; weight: number }[];
  num: Record<string, number>;
}

const NUMERIC_KEYS = [
  "power_wp",
  "ac_power_w",
  "efficiency_pct",
  "max_efficiency_pct",
  "mppt_count",
  "led_power_w",
  "rated_input_w",
  "cross_section_sqmm",
  "module_wp",
  "battery_ah",
  "voc_v",
  "isc_a",
] as const;

export function parseNum(v: string): number | null {
  const m = v.replace(/,/g, "").match(/^[+-]?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** Normalise a query/haystack: lowercase, fuse "620 wp" -> "620wp", "three phase" -> "threephase". */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[²]/g, "2")
    .replace(/(\d)\s+(wp|kwp|kw|w|va|kva|sq\s?mm|sqmm|mm2|a|v|ah)\b/g, "$1$2")
    .replace(/sq\s?mm|mm2/g, "sqmm")
    .replace(/\b(three|3)[\s-]?phase\b/g, "threephase")
    .replace(/\b(single|1)[\s-]?phase\b/g, "singlephase")
    .replace(/n[\s-]?type/g, "ntype")
    .replace(/p[\s-]?type/g, "ptype")
    .replace(/[^a-z0-9.\s/+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function derivedTokens(num: Record<string, number>, specs: PublicProduct["specs"]): string {
  const t: string[] = [];
  if (num.power_wp) t.push(`${num.power_wp}wp ${num.power_wp}w`);
  if (num.ac_power_w) {
    const kw = num.ac_power_w / 1000;
    t.push(`${kw}kw ${num.ac_power_w}w ${kw}k`);
  }
  if (num.led_power_w) t.push(`${num.led_power_w}w`);
  if (num.rated_input_w) t.push(`${num.rated_input_w}w`);
  if (num.cross_section_sqmm) t.push(`${num.cross_section_sqmm}sqmm`);
  if (num.battery_ah) t.push(`${num.battery_ah}ah`);
  const phase = specs.find((s) => s.k === "phase")?.v.toLowerCase() ?? "";
  if (phase.includes("three")) t.push("threephase 3ph");
  if (phase.includes("single")) t.push("singlephase 1ph");
  if (num.mppt_count === 2) t.push("dual mppt dualmppt");
  return t.join(" ");
}

export function buildIndex(cat: PublicCatalogue): IndexedProduct[] {
  const brands = new Map(cat.brands.map((b) => [b.id, b]));
  const cats = new Map(cat.categories.map((c) => [c.id, c]));
  return cat.products.map((p) => {
    const num: Record<string, number> = {};
    for (const s of p.specs) {
      if ((NUMERIC_KEYS as readonly string[]).includes(s.k)) {
        const n = parseNum(s.v);
        if (n !== null) num[s.k] = n;
      }
    }
    const brand = brands.get(p.brandId);
    const category = cats.get(p.categoryId);
    const specText = p.specs.map((s) => `${s.l} ${s.v}${s.u ? " " + s.u : ""}`).join(" ");
    return {
      p,
      brand: brand?.name ?? "",
      brandSlug: brand?.slug ?? "",
      category: category?.name ?? "",
      categorySlug: category?.slug ?? "",
      num,
      fields: [
        { text: normalise(`${p.name} ${p.variant ?? ""}`), weight: 10 },
        { text: normalise(`${p.sku} ${p.model ?? ""}`), weight: 9 },
        { text: normalise(derivedTokens(num, p.specs)), weight: 8 },
        { text: normalise(`${brand?.name ?? ""} ${category?.name ?? ""} ${p.seriesName ?? ""}`), weight: 6 },
        { text: normalise(`${p.short ?? ""} ${p.highlights.join(" ")}`), weight: 3 },
        { text: normalise(`${specText} ${p.description ?? ""}`), weight: 1 },
      ],
    };
  });
}

export interface SearchFilters {
  q: string;
  brands: string[]; // brand slugs
  categories: string[]; // category slugs
  minPricePaise?: number | null;
  maxPricePaise?: number | null;
  pricedOnly?: boolean;
  /** in stock or limited stock only */
  inStockOnly?: boolean;
  /** only products on offer */
  offersOnly?: boolean;
  phase?: "single" | "three" | null;
  minPower?: number | null; // W (modules Wp or inverter AC W)
  maxPower?: number | null;
  sort?: "relevance" | "price-asc" | "price-desc" | "name" | "power-desc";
}

export interface SearchHit {
  item: IndexedProduct;
  score: number;
}

export function tokenize(q: string): string[] {
  return normalise(q).split(" ").filter((t) => t.length > 0);
}

export function scoreItem(item: IndexedProduct, tokens: string[]): number {
  if (tokens.length === 0) return 1;
  let score = 0;
  for (const tok of tokens) {
    let best = 0;
    for (const f of item.fields) {
      const idx = f.text.indexOf(tok);
      if (idx === -1) continue;
      // word-start matches rank higher than mid-word matches
      const wordStart = idx === 0 || f.text[idx - 1] === " ";
      const s = f.weight * (wordStart ? 2 : 1);
      if (s > best) best = s;
    }
    if (best === 0) return 0; // every token must match somewhere (AND semantics)
    score += best;
  }
  return score;
}

export function powerOf(item: IndexedProduct): number | null {
  return item.num.power_wp ?? item.num.ac_power_w ?? item.num.led_power_w ?? item.num.rated_input_w ?? null;
}

export function search(index: IndexedProduct[], f: SearchFilters): SearchHit[] {
  const tokens = tokenize(f.q);
  const hits: SearchHit[] = [];
  for (const item of index) {
    if (f.brands.length && !f.brands.includes(item.brandSlug)) continue;
    if (f.categories.length && !f.categories.includes(item.categorySlug)) continue;
    const price = item.p.price.sellingPaise;
    if (f.pricedOnly && price === null) continue;
    if (f.inStockOnly && item.p.stock === "out_of_stock") continue;
    if (f.offersOnly && !item.p.offer) continue;
    if (f.minPricePaise != null && (price === null || price < f.minPricePaise)) continue;
    if (f.maxPricePaise != null && (price === null || price > f.maxPricePaise)) continue;
    if (f.phase) {
      const ph = item.p.specs.find((s) => s.k === "phase")?.v.toLowerCase() ?? "";
      if (!ph.includes(f.phase)) continue;
    }
    if (f.minPower != null || f.maxPower != null) {
      const pw = powerOf(item);
      if (pw === null) continue;
      if (f.minPower != null && pw < f.minPower) continue;
      if (f.maxPower != null && pw > f.maxPower) continue;
    }
    const score = scoreItem(item, tokens);
    if (score > 0) hits.push({ item, score });
  }
  const sort = f.sort ?? "relevance";
  const byPrice = (a: SearchHit, b: SearchHit, dir: 1 | -1) => {
    const pa = a.item.p.price.sellingPaise;
    const pb = b.item.p.price.sellingPaise;
    if (pa === null && pb === null) return 0;
    if (pa === null) return 1; // unpriced always last
    if (pb === null) return -1;
    return (pa - pb) * dir;
  };
  hits.sort((a, b) => {
    switch (sort) {
      case "price-asc":
        return byPrice(a, b, 1);
      case "price-desc":
        return byPrice(a, b, -1);
      case "name":
        return a.item.p.name.localeCompare(b.item.p.name, "en", { numeric: true });
      case "power-desc":
        return (powerOf(b.item) ?? -1) - (powerOf(a.item) ?? -1);
      default:
        return b.score - a.score || Number(b.item.p.featured) - Number(a.item.p.featured) || a.item.p.name.localeCompare(b.item.p.name, "en", { numeric: true });
    }
  });
  return hits;
}

/** Split text into highlighted / plain segments for the given query (case-insensitive). */
export function highlightSegments(text: string, q: string): { t: string; hit: boolean }[] {
  const words = q
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9.]/g, ""))
    .filter((w) => w.length >= 2);
  if (!words.length) return [{ t: text, hit: false }];
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text
    .split(re)
    .filter((s) => s !== "")
    .map((s) => ({ t: s, hit: words.includes(s.toLowerCase()) }));
}
