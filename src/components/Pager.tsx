import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { readStore, writeStore } from "../lib/storage";

/* Pagination for every list and table on the site: 5 / 10 / 20 / All per page, remembered per list
 * (per visitor), shown only when the list is longer than the smallest page. Works the same on phones
 * (large tap targets, wraps on narrow screens) and desktop. */

export const PAGE_SIZES = [5, 10, 20, 0] as const; // 0 = all
type Size = (typeof PAGE_SIZES)[number];

export interface Paged<T> {
  items: T[];
  pager: ReactNode;
}

/** Splits `all` into pages. `key` names the list (its page size is remembered under it). */
export function usePaged<T>(all: T[], key: string, defaultSize: Size = 10, opts: { newAtEnd?: boolean } = {}): Paged<T> {
  const storeKey = `verdi.pageSize.${key}`;
  const [size, setSize] = useState<Size>(() => {
    const v = readStore<number>(storeKey, defaultSize);
    return (PAGE_SIZES as readonly number[]).includes(v) ? (v as Size) : defaultSize;
  });
  const [page, setPage] = useState(1);
  const total = all.length;
  const pages = size === 0 ? 1 : Math.max(1, Math.ceil(total / size));
  // a new search/filter starts again at page 1; never sit beyond the last page
  // lists where new entries are added at the end (brands, categories, photos) jump to the last page
  // when one is added, so the person sees what they just created
  const prevTotal = useRef(total);
  useEffect(() => {
    const grewByOne = total === prevTotal.current + 1 && prevTotal.current > 0;
    prevTotal.current = total;
    setPage(opts.newAtEnd && grewByOne ? Number.MAX_SAFE_INTEGER : 1);
  }, [total, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = Math.min(page, pages);
  const items = useMemo(() => (size === 0 ? all : all.slice((cur - 1) * size, cur * size)), [all, size, cur]);

  const go = (p: number) => setPage(p);
  const choose = (s: Size) => {
    setSize(s);
    writeStore(storeKey, s);
    setPage(1);
  };

  const pager =
    total > PAGE_SIZES[0] ? (
      <Pager total={total} size={size} page={cur} pages={pages} onPage={go} onSize={choose} />
    ) : null;
  return { items, pager };
}

function Pager({ total, size, page, pages, onPage: setPage, onSize }: { total: number; size: Size; page: number; pages: number; onPage: (p: number) => void; onSize: (s: Size) => void }) {
  const ref = useRef<HTMLElement>(null);
  // after changing page, bring the top of the list back into view (the list sits just above the pager)
  const onPage = (p: number) => {
    setPage(p);
    const top = ref.current?.parentElement;
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const from = size === 0 ? 1 : (page - 1) * size + 1;
  const to = size === 0 ? total : Math.min(total, page * size);
  // compact page list: 1 … 4 5 6 … 12
  const nums: (number | "…")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) nums.push(p);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  const btn = "grid min-h-11 min-w-11 place-items-center rounded-full text-sm font-medium lg:min-h-9 lg:min-w-9";
  return (
    <nav ref={ref} className="mt-4 scroll-mt-20 flex flex-wrap items-center justify-between gap-x-4 gap-y-2" aria-label="Pages" data-testid="pager">
      <p className="num text-xs text-muted" aria-live="polite" data-testid="pager-range">
        {from}–{to} of {total}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1 rounded-full border border-line bg-card p-0.5" role="radiogroup" aria-label="Rows per page">
          {PAGE_SIZES.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={size === s} className={`${btn} px-2.5 text-xs ${size === s ? "bg-ink text-paper" : "text-muted"}`} onClick={() => onSize(s)} data-testid={`page-size-${s || "all"}`}>
              {s === 0 ? "All" : s}
            </button>
          ))}
        </div>
        {pages > 1 && (
          <div className="flex items-center gap-0.5">
            <button type="button" className={`${btn} text-muted disabled:opacity-35`} onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page" data-testid="page-prev">
              <ChevronLeft className="size-4" />
            </button>
            {/* phones: "2 / 5"; wider screens: page numbers */}
            <span className="num px-1 text-sm sm:hidden">
              {page} / {pages}
            </span>
            {nums.map((n, i) =>
              n === "…" ? (
                <span key={`e${i}`} className="hidden px-1 text-subtle sm:inline">
                  …
                </span>
              ) : (
                <button key={n} type="button" className={`${btn} num hidden sm:grid ${n === page ? "bg-ink text-paper" : "text-ink hover:bg-paper-2"}`} onClick={() => onPage(n)} aria-current={n === page ? "page" : undefined}>
                  {n}
                </button>
              ),
            )}
            <button type="button" className={`${btn} text-muted disabled:opacity-35`} onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page" data-testid="page-next">
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
