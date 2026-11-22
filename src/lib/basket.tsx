import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { readStore, writeStore } from "./storage";

export interface BasketLine {
  productId: number;
  quantity: number;
  /** price the customer saw when adding (for change detection) */
  seenSellingPaise: number | null;
  seenVersion: number;
  addedAt: string;
}

interface BasketState {
  lines: BasketLine[];
  count: number;
  add: (productId: number, qty: number, seen: { sellingPaise: number | null; version: number }) => void;
  setQty: (productId: number, qty: number) => void;
  updateSeen: (productId: number, seen: { sellingPaise: number | null; version: number }) => void;
  remove: (productId: number) => void;
  clear: () => void;
  has: (productId: number) => boolean;
  lastAdded: { productId: number; at: number } | null;
}

const KEY = "verdi.enquiry.v1";
const Ctx = createContext<BasketState | null>(null);
export const MAX_LINES = 50;

export function BasketProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<BasketLine[]>(() => readStore<BasketLine[]>(KEY, []).filter((l) => l && l.productId > 0 && l.quantity > 0));
  const [lastAdded, setLastAdded] = useState<{ productId: number; at: number } | null>(null);

  useEffect(() => writeStore(KEY, lines), [lines]);

  // Keep multiple tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setLines(readStore<BasketLine[]>(KEY, []));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const add = useCallback<BasketState["add"]>((productId, qty, seen) => {
    setLines((ls) => {
      const q = Math.max(1, Math.min(100000, Math.floor(qty)));
      const existing = ls.find((l) => l.productId === productId);
      if (existing) return ls.map((l) => (l.productId === productId ? { ...l, quantity: Math.min(100000, l.quantity + q) } : l));
      if (ls.length >= MAX_LINES) return ls;
      return [...ls, { productId, quantity: q, seenSellingPaise: seen.sellingPaise, seenVersion: seen.version, addedAt: new Date().toISOString() }];
    });
    setLastAdded({ productId, at: Date.now() });
  }, []);

  const setQty = useCallback((productId: number, qty: number) => {
    const q = Math.max(1, Math.min(100000, Math.floor(qty) || 1));
    setLines((ls) => ls.map((l) => (l.productId === productId ? { ...l, quantity: q } : l)));
  }, []);
  const updateSeen = useCallback((productId: number, seen: { sellingPaise: number | null; version: number }) => {
    setLines((ls) => ls.map((l) => (l.productId === productId ? { ...l, seenSellingPaise: seen.sellingPaise, seenVersion: seen.version } : l)));
  }, []);
  const remove = useCallback((productId: number) => setLines((ls) => ls.filter((l) => l.productId !== productId)), []);
  const clear = useCallback(() => setLines([]), []);
  // signing out (customer or staff) forgets the list on this device; guests keep theirs between visits
  useEffect(() => {
    const onOut = () => setLines([]);
    window.addEventListener("vs:signed-out", onOut);
    return () => window.removeEventListener("vs:signed-out", onOut);
  }, []);

  const value = useMemo<BasketState>(
    () => ({ lines, count: lines.length, add, setQty, updateSeen, remove, clear, has: (id) => lines.some((l) => l.productId === id), lastAdded }),
    [lines, add, setQty, updateSeen, remove, clear, lastAdded],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBasket(): BasketState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBasket outside provider");
  return v;
}
