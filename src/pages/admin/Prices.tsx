import { AlertTriangle, Check, ChevronLeft, ChevronRight, History, Pencil, RefreshCw, Search } from "lucide-react";
import { usePaged } from "../../components/Pager";
import { Accordion, BottomSheet, useIsPhone } from "../../components/mobile/kit";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { formatPaise, gstLabel } from "../../../shared/money";
import { GST_RATES, paiseToRupeeInput, rupeesToPaise } from "../../../shared/schemas";
import type { AdminPriceRow, PriceHistoryRow } from "../../../shared/types";
import { Modal, Spinner, useToast } from "../../components/ui";
import { api, ApiError } from "../../lib/api";
import { useCatalogue } from "../../lib/catalogue";
import { useAdmin } from "./AdminLayout";
import { ExportButton } from "./kit";

const UNITS = ["per piece", "per metre", "per 500 m coil", "per 2000 m drum", "per set", "per kit"];
const dt = (s: string) => (s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

export default function Prices() {
  const admin = useAdmin();
  const canEdit = admin.role !== "viewer";
  const { data } = useCatalogue();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [rows, setRows] = useState<AdminPriceRow[] | null>(null);
  const pg = usePaged(rows ?? [], "admin.prices");
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminPriceRow | null>(null);
  const brandF = params.get("brand") ?? "";
  const catF = params.get("category") ?? "";
  const missing = params.get("missing") === "1";

  const load = useCallback(() => {
    const sp = new URLSearchParams();
    if (params.get("q")) sp.set("q", params.get("q")!);
    if (brandF) sp.set("brand", brandF);
    if (catF) sp.set("category", catF);
    if (missing) sp.set("missing", "1");
    sp.set("limit", "200");
    setError(null);
    api<{ rows: AdminPriceRow[]; total: number }>(`/api/admin/prices?${sp}`)
      .then((r) => {
        setRows(r.rows);
        setTotal(r.total);
      })
      .catch((e: ApiError) => setError(e.message));
  }, [params, brandF, catF, missing]);

  useEffect(load, [load]);

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const set = (k: string, v: string | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v) n.set(k, v);
        else n.delete(k);
        return n;
      },
      { replace: true },
    );

  return (
    <div className="container-x py-10 max-lg:pt-3">
      <div className="flex flex-wrap items-end justify-between gap-4 max-lg:items-center max-lg:gap-2">
        <div className="min-w-0 flex-1 max-lg:basis-full">
          <h1 className="text-3xl font-semibold max-lg:text-xl">Price management</h1>
          <p className="mt-1 text-sm text-muted max-lg:line-clamp-1 max-lg:text-xs">Prices are stored in rupees and paise. Saved prices appear on the public site within about a minute.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton
            name="Prices"
            build={async () => {
              const all: AdminPriceRow[] = [];
              for (let offset = 0; offset < 20000; offset += 200) {
                const r = await api<{ rows: AdminPriceRow[]; total: number }>(`/api/admin/prices?limit=200&offset=${offset}`);
                all.push(...r.rows);
                if (all.length >= r.total || r.rows.length === 0) break;
              }
              return [
                {
                  name: "Prices",
                  columns: [{ header: "SKU" }, { header: "Product" }, { header: "Model" }, { header: "Brand" }, { header: "Category" }, { header: "Selling price (₹)", type: "money" }, { header: "MRP (₹)", type: "money" }, { header: "GST" }, { header: "Unit" }, { header: "Visible" }, { header: "Updated", type: "datetime" }, { header: "Updated by" }],
                  rows: all.map((p) => [p.sku, p.name, p.model, p.brand, p.category, p.sellingPaise == null ? "Not set" : p.sellingPaise / 100, p.mrpPaise == null ? null : p.mrpPaise / 100, p.gstIncluded ? "Included" : p.gstRate != null ? `+ ${p.gstRate}%` : "As applicable", p.unit, p.isActive ? "Yes" : "No", p.updatedAt, p.updatedBy]),
                },
              ];
            }}
          />
          <button type="button" className="btn-ghost btn-sm" onClick={load}>
            <RefreshCw className="size-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2 max-lg:sticky max-lg:top-14 max-lg:z-20 max-lg:-mx-4 max-lg:mt-3 max-lg:border-b max-lg:border-line/70 max-lg:bg-paper max-lg:px-4 max-lg:py-2">
        <div className="relative min-w-0 flex-1 basis-60 max-lg:basis-full">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
          <input
            aria-label="Search products"
            className="field !rounded-full pl-10"
            placeholder="Search name, SKU or model"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              clearTimeout(timer.current);
              const v = e.target.value;
              timer.current = setTimeout(() => set("q", v.trim() || null), 350);
            }}
            data-testid="admin-search"
          />
        </div>
        <select aria-label="Manufacturer" className="field !w-auto !rounded-full" value={brandF} onChange={(e) => set("brand", e.target.value || null)}>
          <option value="">All manufacturers</option>
          {data?.brands.map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.name}
            </option>
          ))}
        </select>
        <select aria-label="Category" className="field !w-auto !rounded-full" value={catF} onChange={(e) => set("category", e.target.value || null)}>
          <option value="">All categories</option>
          {data?.categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="chip cursor-pointer">
          <input type="checkbox" className="accent-verdi-600" checked={missing} onChange={(e) => set("missing", e.target.checked ? "1" : null)} />
          Missing price only
        </label>
      </div>

      {error && <p className="mt-6 rounded-xl bg-danger-bg p-4 text-sm text-danger">{error}</p>}
      {!rows && !error && (
        <div className="mt-10 flex justify-center">
          <Spinner />
        </div>
      )}
      {rows && (
        <>
          <p className="num mt-4 text-xs text-muted">{total} products</p>
          <div className="card relative mt-2 md:overflow-x-auto">
            <table className="rtable w-full text-sm md:min-w-[760px]">
              <thead className="bg-paper-2/70 text-left text-xs text-muted">
                <tr>
                  <th className="p-3 font-semibold">Product</th>
                  <th className="p-3 font-semibold">Selling price</th>
                  <th className="p-3 font-semibold">MRP</th>
                  <th className="p-3 font-semibold">GST</th>
                  <th className="p-3 font-semibold">Last change</th>
                  <th className="p-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pg.items.map((r) => (
                  <tr key={r.productId} className="border-t border-line/70 align-top" data-testid="admin-price-row">
                    <td className="rt-title p-3">
                      <p className="font-medium">{r.name}</p>
                      <p className="num text-xs text-muted">
                        {r.sku} · {r.brand} · {r.category}
                        {!r.isActive && <span className="ml-1 rounded bg-paper-3 px-1">archived</span>}
                      </p>
                    </td>
                    <td className="rt-aside num p-3">
                      {r.sellingPaise === null ? <span className="text-sun-600">Not set</span> : formatPaise(r.sellingPaise)}
                      <span className="block text-[11px] text-subtle">{r.unit}</span>
                    </td>
                    <td className="rt-chip num p-3" data-label="MRP">{r.mrpPaise === null ? "—" : formatPaise(r.mrpPaise)}</td>
                    <td className="rt-chip p-3 text-xs">{gstLabel(r)}</td>
                    <td className="p-3 text-xs text-muted" data-label="Last change:">
                      {r.updatedBy === "seed" ? "Imported" : r.updatedBy}
                      <span className="md:block"><span className="md:hidden"> · </span>{dt(r.updatedAt)}</span>
                    </td>
                    <td className="rt-actions p-3 text-right">
                      <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(r)} aria-label={`${canEdit ? "Edit" : "View"} price for ${r.name}`}>
                        {canEdit ? <Pencil className="size-3.5" /> : <History className="size-3.5" />} {canEdit ? "Edit" : "History"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="p-8 text-center text-sm text-muted">No products match.</p>}
          </div>
          {pg.pager}
        </>
      )}

      {editing && (
        <PriceEditor
          key={editing.productId}
          row={editing}
          canEdit={canEdit}
          position={rows ? { index: rows.findIndex((r) => r.productId === editing.productId), total: rows.length, missing: rows.filter((r) => r.sellingPaise === null).length } : undefined}
          onPrev={() => {
            const i = rows?.findIndex((r) => r.productId === editing.productId) ?? -1;
            if (rows && i > 0) setEditing(rows[i - 1]);
          }}
          onNext={() => {
            const i = rows?.findIndex((r) => r.productId === editing.productId) ?? -1;
            if (rows && i >= 0 && i < rows.length - 1) setEditing(rows[i + 1]);
            else setEditing(null);
          }}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setRows((rs) => rs?.map((r) => (r.productId === saved.productId ? saved : r)) ?? null);
            setEditing(saved);
          }}
        />
      )}
    </div>
  );
}

function PriceEditor({
  row,
  canEdit,
  onClose,
  onSaved,
  position,
  onPrev,
  onNext,
}: {
  row: AdminPriceRow;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (r: AdminPriceRow) => void;
  position?: { index: number; total: number; missing: number };
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const toast = useToast();
  const isPhone = useIsPhone();
  const [base, setBase] = useState(row);
  const [selling, setSelling] = useState(paiseToRupeeInput(row.sellingPaise));
  const [mrp, setMrp] = useState(paiseToRupeeInput(row.mrpPaise));
  const [gstRate, setGstRate] = useState<string>(row.gstRate === null ? "" : String(row.gstRate));
  const [gstIncluded, setGstIncluded] = useState(row.gstIncluded);
  const [unit, setUnit] = useState(row.unit);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<AdminPriceRow | null>(null);
  const [history, setHistory] = useState<PriceHistoryRow[] | null>(null);

  const loadHistory = useCallback(() => {
    api<{ history: PriceHistoryRow[] }>(`/api/admin/prices/${row.productId}/history`)
      .then((r) => setHistory(r.history))
      .catch(() => setHistory([]));
  }, [row.productId]);
  useEffect(loadHistory, [loadHistory]);

  const resetTo = (r: AdminPriceRow) => {
    setBase(r);
    setSelling(paiseToRupeeInput(r.sellingPaise));
    setMrp(paiseToRupeeInput(r.mrpPaise));
    setGstRate(r.gstRate === null ? "" : String(r.gstRate));
    setGstIncluded(r.gstIncluded);
    setUnit(r.unit);
    setConflict(null);
  };

  const save = async (): Promise<boolean> => {
    const e: Record<string, string> = {};
    const sp = rupeesToPaise(selling);
    const mp = rupeesToPaise(mrp);
    if (Number.isNaN(sp)) e.selling = "Enter a valid amount, e.g. 12499 or 12499.50";
    if (Number.isNaN(mp)) e.mrp = "Enter a valid amount";
    if (!e.selling && !e.mrp && sp !== null && mp !== null && sp > mp) e.selling = "Selling price cannot exceed MRP";
    if (sp === 0) e.selling = "Use an empty value for “price on request”, not 0";
    setErrors(e);
    if (Object.keys(e).length) return false;
    setSaving(true);
    try {
      const res = await api<{ row: AdminPriceRow; catalogueVersion: number | null }>(`/api/admin/prices/${row.productId}`, {
        method: "PUT",
        body: JSON.stringify({
          sellingPricePaise: sp,
          mrpPaise: mp,
          gstIncluded,
          gstRate: gstRate === "" ? null : Number(gstRate),
          priceUnit: unit,
          expectedVersion: base.version,
          reason,
        }),
      });
      // Only now — after the database confirmed the commit — report success.
      toast(`Saved ${res.row.name}. Live on the website within about a minute.`, "success");
      setReason("");
      resetTo(res.row);
      onSaved(res.row);
      loadHistory();
      return true;
    } catch (err) {
      const ae = err as ApiError;
      if (ae.status === 409) {
        const cur = (ae.details as { current?: AdminPriceRow } | undefined)?.current ?? null;
        setConflict(cur);
      } else if (ae.status === 422 && Array.isArray(ae.details)) {
        const fe: Record<string, string> = {};
        for (const d of ae.details as { path: string; message: string }[]) fe[d.path === "mrpPaise" ? "mrp" : "selling"] = d.message;
        setErrors(fe);
      } else {
        toast(ae.message ?? "Save failed. Nothing was changed.", "error");
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  if (isPhone)
    return (
      <PhonePriceSheet
        {...{ row, base, canEdit, onClose, position, onPrev, onNext, saving, errors, conflict, resetTo, history }}
        fields={{ selling, setSelling, mrp, setMrp, gstRate, setGstRate, gstIncluded, setGstIncluded, unit, setUnit, reason, setReason }}
        save={save}
      />
    );

  return (
    <Modal open onClose={onClose} title={row.name} description={`${row.sku} · ${row.brand}`} size="lg" fullscreenOnMobile>
      <div className="grid gap-6 p-5 md:grid-cols-[1.1fr_1fr]">
        <form
          className="grid content-start gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {conflict && (
            <div className="rounded-xl border border-sun-300 bg-sun-100 p-3 text-sm" role="alert">
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="size-4 text-sun-600" /> Someone else changed this price
              </p>
              <p className="mt-1 text-xs">
                Latest: <strong className="num">{formatPaise(conflict.sellingPaise)}</strong> by {conflict.updatedBy} at {dt(conflict.updatedAt)}. Your edit was not saved.
              </p>
              <button type="button" className="btn-dark btn-sm mt-2" onClick={() => resetTo(conflict)}>
                Load latest and re-apply
              </button>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="p-sell" className="label">
                Selling price (₹)
              </label>
              <input id="p-sell" className={`field num ${errors.selling ? "!border-danger" : ""}`} inputMode="decimal" placeholder="Empty = price on request" value={selling} onChange={(e) => setSelling(e.target.value)} disabled={!canEdit} aria-invalid={!!errors.selling} data-testid="price-input" />
              {errors.selling && <p className="mt-1 text-xs text-danger">{errors.selling}</p>}
            </div>
            <div>
              <label htmlFor="p-mrp" className="label">
                MRP (₹, optional)
              </label>
              <input id="p-mrp" className={`field num ${errors.mrp ? "!border-danger" : ""}`} inputMode="decimal" value={mrp} onChange={(e) => setMrp(e.target.value)} disabled={!canEdit} aria-invalid={!!errors.mrp} />
              {errors.mrp && <p className="mt-1 text-xs text-danger">{errors.mrp}</p>}
            </div>
            <div>
              <label htmlFor="p-gst" className="label">
                GST rate
              </label>
              <select id="p-gst" className="field" value={gstRate} onChange={(e) => setGstRate(e.target.value)} disabled={!canEdit}>
                <option value="">Not specified (“as applicable”)</option>
                {GST_RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}%
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="p-unit" className="label">
                Price unit
              </label>
              <select id="p-unit" className="field" value={unit} onChange={(e) => setUnit(e.target.value)} disabled={!canEdit}>
                {[...new Set([unit, ...UNITS])].map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" className="size-4 accent-verdi-600" checked={gstIncluded} onChange={(e) => setGstIncluded(e.target.checked)} disabled={!canEdit} />
            Selling price includes GST
          </label>
          <div>
            <label htmlFor="p-reason" className="label">
              Reason for change (optional)
            </label>
            <input id="p-reason" className="field" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Manufacturer price revision Nov 2026" disabled={!canEdit} />
          </div>
          <div className="rounded-xl bg-paper-2 p-3 text-xs text-muted">
            Customers will see:{" "}
            <strong className="num text-ink">
              {(() => {
                const p = rupeesToPaise(selling);
                return p === null || Number.isNaN(p) ? "Price on request" : formatPaise(p);
              })()}
            </strong>{" "}
            {unit} · {gstLabel({ gstIncluded, gstRate: gstRate === "" ? null : Number(gstRate) })}
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <button type="submit" className="btn-primary" disabled={saving} data-testid="save-price">
                {saving ? <Spinner className="size-4" /> : <Check className="size-4" />} Save price
              </button>
              <button type="button" className="btn-ghost" onClick={onClose} data-testid="cancel-price">
                Cancel
              </button>
            </div>
          )}
          <p className="text-[11px] text-subtle">
            Version <span className="num">{base.version}</span> · last changed {base.updatedBy === "seed" ? "at import" : `by ${base.updatedBy}`} · {dt(base.updatedAt)}
          </p>
        </form>
        <section aria-label="Price history">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <History className="size-4" /> Price history
          </h3>
          {!history ? (
            <Spinner className="mt-4 size-4" />
          ) : history.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No changes recorded yet.</p>
          ) : (
            <ol className="mt-3 grid gap-3 border-l border-line pl-4" data-testid="price-history">
              {history.map((h) => (
                <li key={h.historyId} className="relative text-sm">
                  <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-verdi-500" />
                  <p className="num">
                    {formatPaise(h.oldPricePaise)} → <strong>{formatPaise(h.newPricePaise)}</strong>
                  </p>
                  <p className="text-xs text-muted">
                    {h.changedBy} · {dt(h.changedAt)}
                  </p>
                  {h.reason && <p className="text-xs text-ink/70">“{h.reason}”</p>}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Modal>
  );
}

type PriceFields = {
  selling: string;
  setSelling: (v: string) => void;
  mrp: string;
  setMrp: (v: string) => void;
  gstRate: string;
  setGstRate: (v: string) => void;
  gstIncluded: boolean;
  setGstIncluded: (v: boolean) => void;
  unit: string;
  setUnit: (v: string) => void;
  reason: string;
  setReason: (v: string) => void;
};

/** Phones: quick price editing in a bottom sheet with ‹ / Save / Save & next ›. Same save logic as desktop. */
function PhonePriceSheet({
  row,
  base,
  canEdit,
  onClose,
  position,
  onPrev,
  onNext,
  saving,
  errors,
  conflict,
  resetTo,
  history,
  fields: f,
  save,
}: {
  row: AdminPriceRow;
  base: AdminPriceRow;
  canEdit: boolean;
  onClose: () => void;
  position?: { index: number; total: number; missing: number };
  onPrev?: () => void;
  onNext?: () => void;
  saving: boolean;
  errors: Record<string, string>;
  conflict: AdminPriceRow | null;
  resetTo: (r: AdminPriceRow) => void;
  history: PriceHistoryRow[] | null;
  fields: PriceFields;
  save: () => Promise<boolean>;
}) {
  const seg = (on: boolean) => `tap shrink-0 rounded-full border px-3 text-sm font-medium ${on ? "border-verdi-600 bg-verdi-600 text-white" : "border-line bg-card"}`;
  const preview = (() => {
    const p = rupeesToPaise(f.selling);
    return p === null || Number.isNaN(p) ? "Price on request" : formatPaise(p);
  })();
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={row.name}
      testId="price-sheet"
      footer={
        canEdit ? (
          <div className="grid grid-cols-[auto_1fr_1.3fr] gap-2">
            <button type="button" className="btn-ghost tap" onClick={onPrev} disabled={!position || position.index <= 0} aria-label="Previous product">
              <ChevronLeft className="size-4" />
            </button>
            <button type="button" className="btn-ghost tap" disabled={saving} onClick={() => void save()} data-testid="sheet-save">
              {saving ? <Spinner className="size-4" /> : <Check className="size-4" />} Save
            </button>
            <button
              type="button"
              className="btn-primary tap"
              disabled={saving}
              onClick={async () => {
                if (await save()) onNext?.();
              }}
              data-testid="sheet-save-next"
            >
              Save &amp; next <ChevronRight className="size-4" />
            </button>
          </div>
        ) : undefined
      }
    >
      <p className="num -mt-1 text-xs text-muted">
        {row.sku} · {row.brand}
        {position && (
          <>
            {" · "}
            <span className={position.missing ? "font-semibold text-sun-600" : ""} data-testid="missing-count">
              {position.missing} of {position.total} missing a price
            </span>
          </>
        )}
      </p>
      {conflict && (
        <div className="mt-3 rounded-xl border border-sun-300 bg-sun-100 p-3 text-sm" role="alert">
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="size-4 text-sun-600" /> Someone else changed this price
          </p>
          <p className="mt-1 text-xs">
            Latest: <strong className="num">{formatPaise(conflict.sellingPaise)}</strong> by {conflict.updatedBy} at {dt(conflict.updatedAt)}. Your edit was not saved.
          </p>
          <button type="button" className="btn-dark btn-sm tap mt-2" onClick={() => resetTo(conflict)}>
            Load latest and re-apply
          </button>
        </div>
      )}
      <form
        className="mt-3 grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="ps-sell" className="label">
              Selling price (₹)
            </label>
            <input id="ps-sell" className={`field num ${errors.selling ? "!border-danger" : ""}`} inputMode="decimal" placeholder="Empty = on request" value={f.selling} onChange={(e) => f.setSelling(e.target.value)} disabled={!canEdit} aria-invalid={!!errors.selling} data-testid="sheet-price-input" />
          </div>
          <div>
            <label htmlFor="ps-mrp" className="label">
              MRP (₹, optional)
            </label>
            <input id="ps-mrp" className={`field num ${errors.mrp ? "!border-danger" : ""}`} inputMode="decimal" value={f.mrp} onChange={(e) => f.setMrp(e.target.value)} disabled={!canEdit} aria-invalid={!!errors.mrp} />
          </div>
        </div>
        {(errors.selling || errors.mrp) && <p className="-mt-2 text-xs text-danger">{errors.selling ?? errors.mrp}</p>}
        <fieldset disabled={!canEdit}>
          <legend className="label">Price unit</legend>
          <div className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5">
            {[...new Set([f.unit, ...UNITS])].map((u) => (
              <button key={u} type="button" className={seg(f.unit === u)} aria-pressed={f.unit === u} onClick={() => f.setUnit(u)}>
                {u}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset disabled={!canEdit}>
          <legend className="label">GST rate</legend>
          <div className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5">
            <button type="button" className={seg(f.gstRate === "")} aria-pressed={f.gstRate === ""} onClick={() => f.setGstRate("")}>
              As applicable
            </button>
            {GST_RATES.map((r) => (
              <button key={r} type="button" className={seg(f.gstRate === String(r))} aria-pressed={f.gstRate === String(r)} onClick={() => f.setGstRate(String(r))}>
                {r}%
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex min-h-11 items-center gap-2.5 text-sm">
          <input type="checkbox" className="size-5 accent-verdi-600" checked={f.gstIncluded} onChange={(e) => f.setGstIncluded(e.target.checked)} disabled={!canEdit} />
          Selling price includes GST
        </label>
        <div>
          <label htmlFor="ps-reason" className="label">
            Reason for change (optional)
          </label>
          <input id="ps-reason" className="field" maxLength={200} value={f.reason} onChange={(e) => f.setReason(e.target.value)} disabled={!canEdit} />
        </div>
        <p className="rounded-xl bg-paper-2 p-3 text-xs text-muted">
          Customers will see: <strong className="num text-ink">{preview}</strong> {f.unit} · {gstLabel({ gstIncluded: f.gstIncluded, gstRate: f.gstRate === "" ? null : Number(f.gstRate) })}
        </p>
        <p className="text-[11px] text-subtle">
          Version <span className="num">{base.version}</span> · last changed {base.updatedBy === "seed" ? "at import" : `by ${base.updatedBy}`} · {dt(base.updatedAt)}
        </p>
      </form>
      <Accordion title={<span className="flex items-center gap-2 text-sm"><History className="size-4" /> Price history</span>}>
        {!history ? (
          <Spinner className="size-4" />
        ) : history.length === 0 ? (
          <p className="text-sm text-muted">No changes recorded yet.</p>
        ) : (
          <ol className="grid gap-2">
            {history.map((h) => (
              <li key={h.historyId} className="text-sm">
                <span className="num">
                  {formatPaise(h.oldPricePaise)} → <strong>{formatPaise(h.newPricePaise)}</strong>
                </span>
                <span className="block text-xs text-muted">
                  {h.changedBy} · {dt(h.changedAt)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Accordion>
    </BottomSheet>
  );
}
