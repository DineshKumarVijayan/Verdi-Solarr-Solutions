import { FilterX, LayoutGrid, List, Search, SlidersHorizontal, X } from "lucide-react";
import { usePaged } from "../components/Pager";
import { WhatsAppIcon } from "../components/WhatsAppIcon";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { search, type SearchFilters } from "../../shared/search";
import { BottomSheet, ChipRow, ClampText, usePullToRefresh } from "../components/mobile/kit";
import { ProductCard } from "../components/ProductCard";
import { ProductRow, ProductRowSkeleton } from "../components/ProductRow";
import { readStore, writeStore } from "../lib/storage";
import { useCatalogue } from "../lib/catalogue";
import { usePageMeta } from "../lib/seo";
import { useSite } from "../lib/site";

type Sort = NonNullable<SearchFilters["sort"]>;
const SORTS: { v: Sort; l: string }[] = [
  { v: "relevance", l: "Most relevant" },
  { v: "price-asc", l: "Price: low to high" },
  { v: "price-desc", l: "Price: high to low" },
  { v: "power-desc", l: "Power: high to low" },
  { v: "name", l: "Name A–Z" },
];

const M_VIEW_KEY = "verdi.products.mobileView";
const list = (v: string | null) => (v ? v.split(",").filter(Boolean) : []);
const num = (v: string | null) => (v && !Number.isNaN(Number(v)) ? Number(v) : null);

export default function Products() {
  const SITE = useSite();
  const { categorySlug } = useParams();
  const { data, index, loading, error, reload, categoryBySlug, countByCategory } = useCatalogue();
  const [params, setParams] = useSearchParams();
  const routeCategory = categorySlug ? categoryBySlug(categorySlug) : undefined;

  // Text input is local for instant results; URL is updated after a short pause.
  const [q, setQ] = useState(params.get("q") ?? "");
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Phones: list or 2-column grid, remembered per visitor (desktop keeps its own ?view= toggle).
  const [mView, setMView] = useState<"row" | "tile">(() => (readStore<string>(M_VIEW_KEY, "row") === "tile" ? "tile" : "row"));
  const setMobileView = (v: "row" | "tile") => {
    setMView(v);
    writeStore(M_VIEW_KEY, v);
  };
  const pullIndicator = usePullToRefresh(reload);
  useEffect(() => setQ(params.get("q") ?? ""), [params]);
  const qTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Filter column: fit exactly into the visible space below its current top, so its last
  // filters are reachable by scrolling the column itself, even before the page has scrolled.
  const filterBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const fit = () => {
      frame = 0;
      const el = filterBox.current;
      if (!el) return;
      const top = Math.max(el.getBoundingClientRect().top, 96);
      el.style.maxHeight = `${Math.max(240, window.innerHeight - top - 12)}px`;
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(fit);
    };
    fit();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  const updateQ = (v: string) => {
    setQ(v);
    clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => update({ q: v || null }), 350);
  };

  const filters: SearchFilters = {
    q,
    brands: list(params.get("brand")),
    categories: categorySlug ? [categorySlug] : list(params.get("cat")),
    phase: (params.get("phase") as "single" | "three" | null) ?? null,
    minPower: num(params.get("pmin")),
    maxPower: num(params.get("pmax")),
    minPricePaise: num(params.get("rmin")) !== null ? num(params.get("rmin"))! * 100 : null,
    maxPricePaise: num(params.get("rmax")) !== null ? num(params.get("rmax"))! * 100 : null,
    pricedOnly: params.get("priced") === "1",
    sort: (params.get("sort") as Sort) ?? "relevance",
  };
  const view = params.get("view") === "list" ? "list" : "grid";

  function update(patch: Record<string, string | null>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === "") next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true, preventScrollReset: true, flushSync: true },
    );
  }

  const hits = useMemo(() => search(index, filters), [index, JSON.stringify(filters)]); // eslint-disable-line react-hooks/exhaustive-deps
  const pg = usePaged(hits, "products");

  const title = routeCategory ? routeCategory.name : "All products";
  usePageMeta(
    routeCategory ? `${routeCategory.name} — products & prices` : "Solar products catalogue",
    routeCategory?.description ?? "Search solar panels, inverters, optimisers, solar DC cables and street lights by wattage, kW, phase and model. Real manufacturer datasheets.",
  );

  const activeCount =
    filters.brands.length + (categorySlug ? 0 : filters.categories.length) + (filters.phase ? 1 : 0) + (filters.minPower != null || filters.maxPower != null ? 1 : 0) + (filters.minPricePaise != null || filters.maxPricePaise != null ? 1 : 0) + (filters.pricedOnly ? 1 : 0);

  const clearAll = () => {
    setQ("");
    setParams(new URLSearchParams(), { replace: true, preventScrollReset: true });
  };

  if (categorySlug && data && !routeCategory) {
    return (
      <div className="container-x py-20 text-center">
        <h1 className="text-3xl font-semibold">Category not found</h1>
        <Link to="/products" className="btn-primary mt-6">
          Browse all products
        </Link>
      </div>
    );
  }

  const emptyCategory = routeCategory && (countByCategory.get(routeCategory.id) ?? 0) === 0;
  const filterPanel = (
    <FilterPanel filters={filters} categorySlug={categorySlug} update={update} onClear={clearAll} activeCount={activeCount} />
  );

  return (
    <div className="container-x py-10 max-lg:pt-3 max-lg:pb-6">
      {pullIndicator}
      <nav aria-label="Breadcrumb" className="text-xs text-muted max-lg:hidden">
        <ol className="flex flex-wrap gap-1.5">
          <li><Link to="/" className="hover:text-ink">Home</Link> /</li>
          <li>{routeCategory ? <Link to="/products" className="hover:text-ink">Products</Link> : "Products"}{routeCategory && " /"}</li>
          {routeCategory && <li aria-current="page">{routeCategory.name}</li>}
        </ol>
      </nav>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 max-lg:mt-0">
        <div>
          <h1 className="text-4xl font-semibold max-sm:text-2xl sm:text-5xl">{title}</h1>
          {routeCategory?.description && <ClampText className="mt-2 max-w-2xl text-muted max-lg:mt-1 max-lg:text-sm">{routeCategory.description}</ClampText>}
        </div>
        {data && (
          <p className="num text-xs text-subtle max-lg:hidden">
            Prices last published {new Date(data.publishedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        )}
      </div>

      {emptyCategory ? (
        <div className="card mt-10 p-8 text-center sm:p-12">
          <h2 className="text-2xl font-semibold">Listings for {routeCategory!.name} are on the way</h2>
          <p className="mx-auto mt-3 max-w-lg text-muted">We are adding detailed product listings for this category. Message us with your requirement and we will confirm current options and pricing.</p>
          <a
            className="btn-primary mt-6"
            target="_blank"
            rel="noopener"
            href={`${SITE.whatsappUrl}?text=${encodeURIComponent(`Hello VERDI SOLARR, I would like to enquire about ${routeCategory!.name}.`)}`}
          >
            <WhatsAppIcon className="size-4" /> Enquire on WhatsApp
          </a>
        </div>
      ) : (
        <div className="mt-8 grid gap-8 max-lg:mt-3 lg:grid-cols-[260px_1fr]">
          <aside className="hidden lg:block" aria-label="Filters">
            <div ref={filterBox} className="sticky top-24 -mr-2 max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain pr-2 pb-6 [scrollbar-width:thin]">{filterPanel}</div>
          </aside>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 max-lg:sticky max-lg:top-14 max-lg:z-20 max-lg:-mx-4 max-lg:border-b max-lg:border-line/70 max-lg:bg-paper max-lg:px-4 max-lg:py-2">
              <div className="relative min-w-0 flex-1 basis-64">
                <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
                <label htmlFor="product-q" className="sr-only">
                  Search within products
                </label>
                <input id="product-q" value={q} onChange={(e) => updateQ(e.target.value)} placeholder="Search model, wattage, kW, spec…" className="field !rounded-full pl-10" data-testid="product-search" />
                {q && (
                  <button type="button" onClick={() => updateQ("")} className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full p-1 text-subtle hover:bg-paper-2" aria-label="Clear search">
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <button type="button" className="btn-ghost tap relative lg:hidden" onClick={() => setFiltersOpen(true)} data-testid="open-filters" aria-label={`Filters and sort${activeCount ? `, ${activeCount} active` : ""}`}>
                <SlidersHorizontal className="size-4" />
                <span className="max-[359px]:hidden">Filters</span>
                {activeCount > 0 && <span className="num rounded-full bg-verdi-600 px-1.5 text-[10px] text-white">{activeCount}</span>}
              </button>
              <button
                type="button"
                className="tap grid place-items-center rounded-full border border-line bg-card text-muted lg:hidden"
                onClick={() => setMobileView(mView === "row" ? "tile" : "row")}
                aria-label={mView === "row" ? "Show as grid" : "Show as list"}
                data-testid="m-view-toggle"
              >
                {mView === "row" ? <LayoutGrid className="size-4" /> : <List className="size-4" />}
              </button>
              <QuickChips filters={filters} categorySlug={categorySlug} update={update} />
              <label htmlFor="sort" className="sr-only">
                Sort
              </label>
              <select id="sort" className="field !w-auto !rounded-full max-lg:hidden" value={filters.sort} onChange={(e) => update({ sort: e.target.value === "relevance" ? null : e.target.value })}>
                {SORTS.map((s) => (
                  <option key={s.v} value={s.v}>
                    {s.l}
                  </option>
                ))}
              </select>
              <div className="hidden rounded-full border border-line bg-card p-1 lg:flex" role="group" aria-label="Layout">
                <button type="button" className={`rounded-full p-1.5 ${view === "grid" ? "bg-ink text-paper" : "text-muted"}`} onClick={() => update({ view: null })} aria-pressed={view === "grid"} aria-label="Grid view">
                  <LayoutGrid className="size-4" />
                </button>
                <button type="button" className={`rounded-full p-1.5 ${view === "list" ? "bg-ink text-paper" : "text-muted"}`} onClick={() => update({ view: "list" })} aria-pressed={view === "list"} aria-label="List view">
                  <List className="size-4" />
                </button>
              </div>
            </div>

            <div className="mt-4 flex min-h-8 flex-wrap items-center gap-2">
              <p className="num text-sm text-muted" aria-live="polite" data-testid="result-count">
                {loading ? "Loading catalogue…" : `${hits.length} ${hits.length === 1 ? "product" : "products"}`}
              </p>
              <ActiveChips filters={filters} q={q} categorySlug={categorySlug} update={update} setQ={updateQ} />
              {(activeCount > 0 || q) && (
                <button type="button" onClick={clearAll} className="btn-ghost btn-sm ml-auto !border-danger/30 !text-danger hover:!bg-danger-bg" data-testid="clear-filters">
                  <FilterX className="size-3.5" /> Clear filters
                </button>
              )}
            </div>

            {error && !data && (
              <div className="card mt-6 p-8 text-center">
                <p className="font-semibold">We couldn’t load the catalogue.</p>
                <p className="mt-1 text-sm text-muted">{error}</p>
                <button type="button" className="btn-primary mt-4" onClick={reload}>
                  Try again
                </button>
              </div>
            )}
            {loading && <ProductRowSkeleton />}
            {loading && (
              <div className="mt-6 grid gap-4 max-lg:hidden sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="card h-96 animate-pulse bg-paper-2" />
                ))}
              </div>
            )}
            {!loading && data && hits.length === 0 && (
              <div className="card mt-6 p-10 text-center">
                <p className="text-lg font-semibold">No products match these filters.</p>
                <p className="mt-1 text-sm text-muted">Try a broader search such as “inverter” or “Wp”, or clear the filters.</p>
                <button type="button" className="btn-ghost mt-5" onClick={clearAll}>
                  Clear all filters
                </button>
              </div>
            )}
            <div className={`mt-4 grid gap-4 max-lg:hidden ${view === "list" ? "" : "sm:grid-cols-2 xl:grid-cols-3"}`}>
              {pg.items.map((h) => (
                <ProductCard key={h.item.p.id} product={h.item.p} query={q} layout={view} />
              ))}
            </div>
            {/* phones: compact rows (or a 2-column grid) */}
            {mView === "row" ? (
              <ul className="mt-1 divide-y divide-line/70 lg:hidden" data-testid="product-rows">
                {pg.items.map((h) => (
                  <ProductRow key={h.item.p.id} product={h.item.p} query={q} />
                ))}
              </ul>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-3 lg:hidden" data-testid="product-tiles">
                {pg.items.map((h) => (
                  <ProductRow key={h.item.p.id} product={h.item.p} query={q} mode="tile" />
                ))}
              </div>
            )}
            {pg.pager}
          </div>
        </div>
      )}

      <BottomSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters & sort"
        testId="filter-sheet"
        footer={
          <button type="button" className="btn-primary tap w-full" onClick={() => setFiltersOpen(false)} data-testid="apply-filters">
            Show {hits.length} {hits.length === 1 ? "product" : "products"}
          </button>
        }
      >
        <fieldset className="mb-6">
          <legend className="eyebrow mb-3">Sort by</legend>
          <div className="flex flex-wrap gap-2">
            {SORTS.map((s) => (
              <button key={s.v} type="button" className={`chip tap ${filters.sort === s.v ? "chip-on" : ""}`} aria-pressed={filters.sort === s.v} onClick={() => update({ sort: s.v === "relevance" ? null : s.v })}>
                {s.l}
              </button>
            ))}
          </div>
        </fieldset>
        {filterPanel}
      </BottomSheet>
    </div>
  );
}

/** Phones: one-tap category and brand chips under the search box (built from the live catalogue). */
function QuickChips({ filters, categorySlug, update }: { filters: SearchFilters; categorySlug?: string; update: (p: Record<string, string | null>) => void }) {
  const { data, countByCategory } = useCatalogue();
  if (!data) return null;
  const cats = categorySlug ? [] : data.categories.filter((c) => (countByCategory.get(c.id) ?? 0) > 0);
  const brands = data.brands;
  if (cats.length + brands.length < 2) return null;
  const toggle = (key: "brand" | "cat", current: string[], v: string) => {
    const next = current.includes(v) ? current.filter((x) => x !== v) : [...current, v];
    update({ [key]: next.length ? next.join(",") : null });
  };
  return (
    <div className="min-w-0 basis-full lg:hidden">
      <ChipRow label="Quick filters">
        {!categorySlug && (
          <button type="button" className={`chip shrink-0 !py-1.5 ${filters.categories.length || filters.brands.length ? "" : "chip-on"}`} onClick={() => update({ cat: null, brand: null })} aria-pressed={!filters.categories.length && !filters.brands.length}>
            All
          </button>
        )}
        {cats.map((c) => (
          <button key={`c${c.id}`} type="button" className={`chip shrink-0 !py-1.5 whitespace-nowrap ${filters.categories.includes(c.slug) ? "chip-on" : ""}`} aria-pressed={filters.categories.includes(c.slug)} onClick={() => toggle("cat", filters.categories, c.slug)}>
            {c.name}
          </button>
        ))}
        {brands.map((b) => (
          <button key={`b${b.id}`} type="button" className={`chip shrink-0 !py-1.5 whitespace-nowrap ${filters.brands.includes(b.slug) ? "chip-on" : ""}`} aria-pressed={filters.brands.includes(b.slug)} onClick={() => toggle("brand", filters.brands, b.slug)}>
            {b.name}
          </button>
        ))}
      </ChipRow>
    </div>
  );
}

function ActiveChips({ filters, q, categorySlug, update, setQ }: { filters: SearchFilters; q: string; categorySlug?: string; update: (p: Record<string, string | null>) => void; setQ: (v: string) => void }) {
  const { data } = useCatalogue();
  const chips: { label: string; clear: () => void }[] = [];
  if (q) chips.push({ label: `“${q}”`, clear: () => setQ("") });
  for (const b of filters.brands) chips.push({ label: data?.brands.find((x) => x.slug === b)?.name ?? b, clear: () => update({ brand: filters.brands.filter((x) => x !== b).join(",") || null }) });
  if (!categorySlug)
    for (const c of filters.categories) chips.push({ label: data?.categories.find((x) => x.slug === c)?.name ?? c, clear: () => update({ cat: filters.categories.filter((x) => x !== c).join(",") || null }) });
  if (filters.phase) chips.push({ label: filters.phase === "single" ? "Single phase" : "Three phase", clear: () => update({ phase: null }) });
  if (filters.minPower != null || filters.maxPower != null) chips.push({ label: `${filters.minPower ?? 0}–${filters.maxPower ?? "∞"} W`, clear: () => update({ pmin: null, pmax: null }) });
  if (filters.minPricePaise != null || filters.maxPricePaise != null)
    chips.push({ label: `₹${filters.minPricePaise != null ? filters.minPricePaise / 100 : 0}–${filters.maxPricePaise != null ? filters.maxPricePaise / 100 : "∞"}`, clear: () => update({ rmin: null, rmax: null }) });
  if (filters.pricedOnly) chips.push({ label: "Listed prices only", clear: () => update({ priced: null }) });
  return (
    <>
      {chips.map((c) => (
        <button key={c.label} type="button" onClick={c.clear} className="chip !border-verdi-300 !bg-verdi-50 !py-0.5" aria-label={`Remove filter ${c.label}`}>
          {c.label} <X className="size-3" />
        </button>
      ))}
    </>
  );
}

function FilterPanel({ filters, categorySlug, update, onClear, activeCount }: { filters: SearchFilters; categorySlug?: string; update: (p: Record<string, string | null>) => void; onClear: () => void; activeCount: number }) {
  const { data, countByCategory } = useCatalogue();
  const toggle = (key: "brand" | "cat", current: string[], v: string) => {
    const next = current.includes(v) ? current.filter((x) => x !== v) : [...current, v];
    update({ [key]: next.length ? next.join(",") : null });
  };
  const showPhase = !categorySlug || categorySlug === "solar-inverters";
  return (
    <div className="grid gap-7">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <SlidersHorizontal className="size-4" /> Filters {activeCount > 0 && <span className="num rounded-full bg-verdi-600 px-1.5 text-[10px] text-white">{activeCount}</span>}
        </p>
        <button type="button" onClick={onClear} disabled={activeCount === 0} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-danger hover:bg-danger-bg disabled:text-subtle disabled:hover:bg-transparent" title="Clear all filters">
          <FilterX className="size-3.5" /> Clear
        </button>
      </div>
      <fieldset>
        <legend className="eyebrow mb-3">Manufacturer</legend>
        <div className="grid gap-2">
          {(data?.brands ?? []).map((b) => (
            <label key={b.id} className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input type="checkbox" className="size-4 accent-verdi-600" checked={filters.brands.includes(b.slug)} onChange={() => toggle("brand", filters.brands, b.slug)} />
              {b.name}
            </label>
          ))}
        </div>
      </fieldset>
      {!categorySlug && (
        <fieldset>
          <legend className="eyebrow mb-3">Category</legend>
          <div className="grid gap-2">
            {(data?.categories ?? [])
              .filter((c) => (countByCategory.get(c.id) ?? 0) > 0)
              .map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <input type="checkbox" className="size-4 accent-verdi-600" checked={filters.categories.includes(c.slug)} onChange={() => toggle("cat", filters.categories, c.slug)} />
                  <span className="flex-1">{c.name}</span>
                  <span className="num text-xs text-subtle">{countByCategory.get(c.id)}</span>
                </label>
              ))}
          </div>
        </fieldset>
      )}
      {showPhase && (
        <fieldset>
          <legend className="eyebrow mb-3">Inverter phase</legend>
          <div className="flex flex-wrap gap-2">
            {(
              [
                [null, "Any"],
                ["single", "Single phase"],
                ["three", "Three phase"],
              ] as const
            ).map(([v, l]) => (
              <button key={l} type="button" className={`chip ${filters.phase === v ? "chip-on" : ""}`} aria-pressed={filters.phase === v} onClick={() => update({ phase: v })}>
                {l}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend className="eyebrow mb-1">Power rating (W)</legend>
        <p className="mb-3 text-[11px] text-subtle">Module Wp, inverter AC W, LED W or optimiser input W</p>
        <div className="grid grid-cols-2 gap-2">
          <input aria-label="Minimum power in watts" className="field num" inputMode="numeric" placeholder="Min" defaultValue={filters.minPower ?? ""} onBlur={(e) => update({ pmin: e.target.value || null })} key={`pmin${filters.minPower}`} />
          <input aria-label="Maximum power in watts" className="field num" inputMode="numeric" placeholder="Max" defaultValue={filters.maxPower ?? ""} onBlur={(e) => update({ pmax: e.target.value || null })} key={`pmax${filters.maxPower}`} />
        </div>
      </fieldset>
      <fieldset>
        <legend className="eyebrow mb-3">Listed price (₹)</legend>
        <div className="grid grid-cols-2 gap-2">
          <input aria-label="Minimum price in rupees" className="field num" inputMode="numeric" placeholder="Min" defaultValue={filters.minPricePaise != null ? filters.minPricePaise / 100 : ""} onBlur={(e) => update({ rmin: e.target.value || null })} key={`rmin${filters.minPricePaise}`} />
          <input aria-label="Maximum price in rupees" className="field num" inputMode="numeric" placeholder="Max" defaultValue={filters.maxPricePaise != null ? filters.maxPricePaise / 100 : ""} onBlur={(e) => update({ rmax: e.target.value || null })} key={`rmax${filters.maxPricePaise}`} />
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2.5 text-sm">
          <input type="checkbox" className="size-4 accent-verdi-600" checked={!!filters.pricedOnly} onChange={(e) => update({ priced: e.target.checked ? "1" : null })} />
          Only show listed prices
        </label>
      </fieldset>
    </div>
  );
}
