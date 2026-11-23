import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { buildIndex, type IndexedProduct } from "../../shared/search";
import type { PublicBrand, PublicCatalogue, PublicCategory, PublicProduct } from "../../shared/types";
import { api } from "./api";

interface CatalogueState {
  data: PublicCatalogue | null;
  index: IndexedProduct[];
  error: string | null;
  loading: boolean;
  reload: () => void;
  bySlug: (slug: string) => PublicProduct | undefined;
  byId: (id: number) => PublicProduct | undefined;
  brand: (id: number) => PublicBrand | undefined;
  category: (id: number) => PublicCategory | undefined;
  categoryBySlug: (slug: string) => PublicCategory | undefined;
  countByCategory: Map<number, number>;
}

const Ctx = createContext<CatalogueState | null>(null);
const SESSION_KEY = "verdi.catalogue.v1";

/**
 * Loads the public catalogue ONCE per visit (one cacheable GET), then all search,
 * filtering and navigation happen locally. A sessionStorage copy makes in-tab
 * navigation instant; the network copy (edge-cached, ~60 s) refreshes it.
 */
export function CatalogueProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<PublicCatalogue | null>(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as PublicCatalogue) : null;
    } catch {
      return null;
    }
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    // no-cache = always revalidate (ETag → cheap 304), so admin changes show on the very next page load.
    api<PublicCatalogue>("/api/catalogue", { cache: "no-cache" })
      .then((c) => {
        if (!alive) return;
        // same version: keep the current object so nothing re-renders for an unchanged catalogue
        setData((prev) => (prev && prev.version === c.version && prev.schema === c.schema ? prev : c));
        setError(null);
        try {
          sessionStorage.setItem(SESSION_KEY, JSON.stringify(c));
        } catch {
          /* quota */
        }
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  // A tab left open for hours must not keep old prices or stock: check again when the visitor comes
  // back to it (after a minute away) and every few minutes while it is visible. Unchanged = a tiny 304.
  useEffect(() => {
    let last = Date.now();
    const check = (minAgeMs: number) => {
      if (document.visibilityState !== "visible" || Date.now() - last < minAgeMs) return;
      last = Date.now();
      reload();
    };
    const onShow = () => check(60_000);
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", onShow);
    const every = window.setInterval(() => check(5 * 60_000), 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", onShow);
      window.clearInterval(every);
    };
  }, [reload]);

  const value = useMemo<CatalogueState>(() => {
    const products = data?.products ?? [];
    const slugMap = new Map(products.map((p) => [p.slug, p]));
    const idMap = new Map(products.map((p) => [p.id, p]));
    const brandMap = new Map((data?.brands ?? []).map((b) => [b.id, b]));
    const catMap = new Map((data?.categories ?? []).map((c) => [c.id, c]));
    const catSlugMap = new Map((data?.categories ?? []).map((c) => [c.slug, c]));
    const countByCategory = new Map<number, number>();
    for (const p of products) countByCategory.set(p.categoryId, (countByCategory.get(p.categoryId) ?? 0) + 1);
    return {
      data,
      index: data ? buildIndex(data) : [],
      error,
      loading: loading && !data,
      reload,
      bySlug: (s) => slugMap.get(s),
      byId: (id) => idMap.get(id),
      brand: (id) => brandMap.get(id),
      category: (id) => catMap.get(id),
      categoryBySlug: (s) => catSlugMap.get(s),
      countByCategory,
    };
  }, [data, error, loading, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCatalogue(): CatalogueState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCatalogue outside provider");
  return v;
}

/** Other variants of the same datasheet series (e.g. 600–630 Wp). */
export function seriesSiblings(products: PublicProduct[], p: PublicProduct): PublicProduct[] {
  if (!p.seriesKey) return [p];
  return products.filter((x) => x.seriesKey === p.seriesKey);
}

export function specValue(p: PublicProduct, key: string): string | null {
  const s = p.specs.find((x) => x.k === key);
  return s ? `${s.v}${s.u ? ` ${s.u}` : ""}` : null;
}

/** 2–4 headline specs for cards, chosen by category-agnostic key priority. */
export function keySpecs(p: PublicProduct): { label: string; value: string }[] {
  const prefs: [string, string][] = [
    ["power_wp", "Power"],
    ["efficiency_pct", "Efficiency"],
    ["ac_power_w", "AC output"],
    ["phase", "Phase"],
    ["mppt_count", "MPPT"],
    ["max_efficiency_pct", "Max. eff."],
    ["rated_input_w", "Rated input"],
    ["cross_section_sqmm", "Size"],
    ["voltage_rating", "Rating"],
    ["ampacity_free_air_a", "Ampacity (air)"],
    ["led_power_w", "LED"],
    ["module_wp", "Panel"],
    ["battery_ah", "Battery"],
    ["voc_v", "Voc"],
    ["protection", "Enclosure"],
  ];
  const out: { label: string; value: string }[] = [];
  for (const [k, label] of prefs) {
    const s = p.specs.find((x) => x.k === k);
    if (!s) continue;
    let value = `${s.v}${s.u ? ` ${s.u}` : ""}`;
    if (k === "ac_power_w") value = `${Number(s.v) / 1000} kW`;
    if (k === "phase") value = s.v.replace(/\s*\(.*\)/, "");
    out.push({ label, value });
    if (out.length === 4) break;
  }
  return out;
}
