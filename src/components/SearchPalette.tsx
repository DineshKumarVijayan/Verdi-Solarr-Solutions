import { StockPill } from "./StockBadge";
import { ArrowRight, CornerDownLeft, History, Search } from "lucide-react";
import { readStore, writeStore } from "../lib/storage";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { formatPaise } from "../../shared/money";
import { search } from "../../shared/search";
import { useCatalogue } from "../lib/catalogue";
import { Highlight } from "./Highlight";
import { Modal } from "./ui";

const RECENT_KEY = "verdi.recentSearches";
const SUGGESTIONS = ["620 Wp", "TOPCon", "5 kW three phase", "single phase", "optimizer", "6 sq mm", "street light"];

/** Instant command-palette search (Ctrl/⌘+K). Pure client-side over the cached catalogue. */
export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { index, category, data, countByCategory } = useCatalogue();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const nav = useNavigate();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => (q.trim() ? search(index, { q, brands: [], categories: [] }).slice(0, 8) : []), [index, q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);
  useEffect(() => setActive(0), [q]);

  const [recent, setRecent] = useState<string[]>(() => readStore<string[]>(RECENT_KEY, []));
  const remember = (term: string) => {
    const t = term.trim();
    if (!t) return;
    const next = [t, ...recent.filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(0, 6);
    setRecent(next);
    writeStore(RECENT_KEY, next);
  };
  const go = (to: string) => {
    remember(q);
    onClose();
    nav(to);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active < hits.length && hits[active]) go(`/products/${hits[active].item.p.slug}`);
      else go(`/products?q=${encodeURIComponent(q)}`);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Search products" hideTitle size="lg" fullscreenOnMobile>
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 max-sm:pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <Search className="size-5 text-subtle" />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          placeholder="Search by product, model, wattage, kW, brand…"
          className="w-full bg-transparent py-1 text-base outline-none placeholder:text-subtle"
          role="combobox"
          aria-expanded={hits.length > 0}
          aria-controls={listId}
          aria-activedescendant={hits.length ? `${listId}-${active}` : undefined}
          aria-label="Search products"
          data-testid="palette-input"
          inputMode="search"
          enterKeyHint="search"
        />
        <button type="button" onClick={onClose} className="tap -mr-2 shrink-0 text-sm font-semibold text-verdi-700 sm:hidden">
          Cancel
        </button>
        <kbd className="hidden rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-subtle sm:block">ESC</kbd>
      </div>
      <div className="max-h-[60dvh] overflow-y-auto p-2 max-sm:max-h-none">
        {!q.trim() && recent.length > 0 && (
          <div className="p-3 sm:hidden" data-testid="recent-searches">
            <div className="mb-2 flex items-center justify-between">
              <p className="eyebrow">Recent</p>
              <button type="button" className="text-xs font-semibold text-muted" onClick={() => (setRecent([]), writeStore(RECENT_KEY, []))}>
                Clear
              </button>
            </div>
            <ul>
              {recent.map((r) => (
                <li key={r}>
                  <button type="button" className="tap flex w-full items-center gap-3 rounded-xl px-1 text-left text-sm" onClick={() => setQ(r)}>
                    <History className="size-4 shrink-0 text-subtle" /> <span className="truncate">{r}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!q.trim() && (
          <div className="p-3 sm:hidden">
            <p className="eyebrow mb-3">Categories</p>
            <div className="grid grid-cols-2 gap-2">
              {(data?.categories ?? [])
                .filter((c) => (countByCategory.get(c.id) ?? 0) > 0)
                .map((c) => (
                  <button key={c.id} type="button" className="tap flex items-center justify-between gap-2 rounded-xl bg-paper-2/70 px-3 text-left text-sm font-medium" onClick={() => (onClose(), nav(`/category/${c.slug}`))}>
                    <span className="truncate">{c.name}</span>
                    <span className="num text-xs text-subtle">{countByCategory.get(c.id)}</span>
                  </button>
                ))}
            </div>
          </div>
        )}
        {!q.trim() && (
          <div className="p-3">
            <p className="eyebrow mb-3">Try</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => setQ(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {q.trim() && hits.length === 0 && <p className="p-6 text-center text-sm text-muted">No products match “{q}”. Try a wattage like “550 Wp” or a model number.</p>}
        <ul id={listId} role="listbox" aria-label="Search results">
          {hits.map((h, i) => (
            <li
              key={h.item.p.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(`/products/${h.item.p.slug}`)}
              className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${i === active ? "bg-verdi-50" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  <Highlight text={h.item.p.name} query={q} />
                </p>
                <p className="truncate text-xs text-muted">
                  {h.item.brand} · {category(h.item.p.categoryId)?.name} {h.item.p.model ? `· ${h.item.p.model}` : ""}
                </p>
              </div>
              <span className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="num text-xs text-ink/70">{h.item.p.price.sellingPaise !== null ? formatPaise(h.item.p.price.sellingPaise) : "On request"}</span>
                <StockPill stock={h.item.p.stock ?? "in_stock"} compact className="!text-[10px]" />
              </span>
              {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-subtle" />}
            </li>
          ))}
        </ul>
        {q.trim() && (
          <button
            type="button"
            onClick={() => go(`/products?q=${encodeURIComponent(q)}`)}
            onMouseEnter={() => setActive(hits.length)}
            className={`mt-1 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold text-verdi-700 ${active === hits.length ? "bg-verdi-50" : ""}`}
          >
            See all results with filters <ArrowRight className="size-4" />
          </button>
        )}
      </div>
    </Modal>
  );
}
