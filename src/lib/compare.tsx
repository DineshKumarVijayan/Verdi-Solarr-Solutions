import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { readStore, writeStore } from "./storage";

const KEY = "verdi.compare.v1";
export const MAX_COMPARE = 4;

interface CompareState {
  ids: number[];
  toggle: (id: number) => boolean; // returns false if full
  remove: (id: number) => void;
  clear: () => void;
  has: (id: number) => boolean;
}

const Ctx = createContext<CompareState | null>(null);

export function CompareProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<number[]>(() => readStore<number[]>(KEY, []).filter((n) => Number.isInteger(n)).slice(0, MAX_COMPARE));
  useEffect(() => writeStore(KEY, ids), [ids]);
  // signing out forgets the comparison on this device
  useEffect(() => {
    const onOut = () => setIds([]);
    window.addEventListener("vs:signed-out", onOut);
    return () => window.removeEventListener("vs:signed-out", onOut);
  }, []);
  const toggle = useCallback(
    (id: number) => {
      if (ids.includes(id)) {
        setIds(ids.filter((x) => x !== id));
        return true;
      }
      if (ids.length >= MAX_COMPARE) return false;
      setIds([...ids, id]);
      return true;
    },
    [ids],
  );
  const value = useMemo<CompareState>(
    () => ({ ids, toggle, remove: (id) => setIds((x) => x.filter((y) => y !== id)), clear: () => setIds([]), has: (id) => ids.includes(id) }),
    [ids, toggle],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCompare(): CompareState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCompare outside provider");
  return v;
}
