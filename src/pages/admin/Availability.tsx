import { Tag } from "lucide-react";
import { useState } from "react";
import { ProductStatusSchema } from "../../../shared/admin-schemas";
import { DEFAULT_OFFER_LABEL, percentOff, STOCK_LABEL, STOCK_STATUSES, type StockStatus } from "../../../shared/stock";
import { StockPill } from "../../components/StockBadge";
import { useToast } from "../../components/ui";
import { errorText, send } from "./kit";

type Status = { stock: StockStatus; onOffer: boolean; offerLabel: string | null };
const HINT: Record<StockStatus, string> = {
  in_stock: "Ready to supply. Shown with a green dot.",
  limited: "Only a few left: tells customers to enquire soon. Shown in amber.",
  out_of_stock: "Customers can still send an enquiry; the photo is dimmed.",
};
const save = (id: number, v: Status) => send<Status>(`/api/admin/products/${id}/status`, "PUT", v);

/** Product editor: availability and offer, saved on their own (they publish straight away). */
export function AvailabilityCard({ productId, value, price, editable, onSaved, className = "" }: { productId: number; value: Status; price: { sellingPaise: number | null; mrpPaise: number | null } | null; editable: boolean; onSaved: (v: Status) => void; className?: string }) {
  const toast = useToast();
  const [v, setV] = useState<Status>(value);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = v.stock !== value.stock || v.onOffer !== value.onOffer || (v.onOffer && (v.offerLabel ?? "") !== (value.offerLabel ?? ""));
  const pct = price ? percentOff(price) : null;
  const submit = async () => {
    const check = ProductStatusSchema.safeParse(v);
    if (!check.success) return setErr(check.error.issues[0]?.message ?? "Please check the offer label.");
    setErr(null);
    setBusy(true);
    try {
      const r = await save(productId, check.data);
      onSaved(r);
      setV(r);
      toast("Availability saved. It shows on the website now.", "success");
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={`card grid grid-cols-1 gap-4 p-5 max-lg:p-4 ${className}`} data-testid="availability-card">
      <div>
        <h2 className="font-semibold">Availability & offer</h2>
        <p className="mt-0.5 text-xs text-muted">Shown on every product card, the product page, search, compare and the enquiry basket.</p>
      </div>
      <fieldset>
        <legend className="label">Stock</legend>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Stock">
          {STOCK_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={v.stock === s}
              disabled={!editable}
              onClick={() => setV({ ...v, stock: s })}
              className={`rounded-2xl border p-3 text-left transition max-lg:min-h-11 ${v.stock === s ? "border-ink bg-paper ring-1 ring-ink" : "border-line hover:border-verdi-300"}`}
              data-testid={`stock-${s}`}
            >
              <StockPill stock={s} />
              <span className="mt-1 block text-[11px] leading-snug text-muted">{HINT[s]}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-2">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium max-lg:min-h-11">
          <input type="checkbox" className="size-4 accent-verdi-600" checked={v.onOffer} disabled={!editable} onChange={(e) => setV({ ...v, onOffer: e.target.checked })} data-testid="offer-toggle" />
          On offer (shows a <span className="inline-flex items-center gap-1 rounded-full bg-sun-400 px-2 py-0.5 text-[11px] font-semibold text-ink"><Tag className="size-3" /> tag</span> and lists it under Offers)
        </label>
        {v.onOffer && (
          <div className="grid gap-1 pl-6.5">
            <input aria-label="Offer label" className="field !py-1.5" maxLength={28} placeholder={`${DEFAULT_OFFER_LABEL} (e.g. Festival offer, Clearance sale)`} value={v.offerLabel ?? ""} disabled={!editable} onChange={(e) => setV({ ...v, offerLabel: e.target.value })} data-testid="offer-label" />
            <p className="text-xs text-muted">
              {pct
                ? `Customers see "${(v.offerLabel ?? "").trim() || DEFAULT_OFFER_LABEL} · ${pct}% off" (from the MRP and selling price).`
                : "Add an MRP above the selling price (under Prices) to also show the % off automatically."}
            </p>
          </div>
        )}
      </div>
      {err && (
        <p className="text-xs text-danger" role="alert">
          {err}
        </p>
      )}
      {editable && (
        <button type="button" className="btn-primary btn-sm justify-self-start max-lg:tap" disabled={busy || !dirty} onClick={() => void submit()} data-testid="save-availability">
          Save availability
        </button>
      )}
    </section>
  );
}

/** Admin product list: change stock and switch the offer on/off without opening the product. */
export function QuickStatus({ productId, value, onSaved, editable }: { productId: number; value: Status; onSaved: (v: Status) => void; editable: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const apply = async (next: Status) => {
    setBusy(true);
    try {
      onSaved(await save(productId, next));
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  if (!editable)
    return (
      <span className="inline-flex items-center gap-2">
        <StockPill stock={value.stock} compact />
        {value.onOffer && <Tag className="size-3.5 text-sun-500" aria-label="On offer" />}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5">
      <select aria-label="Stock" className="field !w-auto !rounded-full !py-1 !pr-7 !pl-2.5 text-xs" value={value.stock} disabled={busy} onChange={(e) => void apply({ ...value, stock: e.target.value as StockStatus })} data-testid="quick-stock">
        {STOCK_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STOCK_LABEL[s]}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy}
        aria-pressed={value.onOffer}
        title={value.onOffer ? "On offer: click to end the offer" : "Put on offer"}
        className={`rounded-full p-1.5 transition ${value.onOffer ? "bg-sun-400 text-ink" : "text-subtle hover:bg-paper-2 hover:text-ink"}`}
        onClick={() => void apply({ ...value, onOffer: !value.onOffer })}
        data-testid="quick-offer"
      >
        <Tag className="size-3.5" />
      </button>
    </span>
  );
}
