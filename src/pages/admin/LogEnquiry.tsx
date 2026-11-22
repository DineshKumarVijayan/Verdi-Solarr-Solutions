import { MessageCircle, Minus, PhoneCall, Plus, Search, Store, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { issues, StaffEnquirySchema } from "../../../shared/admin-schemas";
import { formatPaise } from "../../../shared/money";
import { search } from "../../../shared/search";
import { type AdminEnquiryRow, type EnquiryStatus } from "../../../shared/types";
import { BottomSheet, useIsPhone } from "../../components/mobile/kit";
import { Modal, Spinner, useToast } from "../../components/ui";
import { useCatalogue } from "../../lib/catalogue";
import { ADMIN_STATUS_LABEL as STATUS_LABEL } from "../../lib/enquiry-status";
import { errorText, fieldErrors, send } from "./kit";

type Source = "phone" | "whatsapp" | "visit";
const SOURCES: [Source, string, typeof PhoneCall][] = [
  ["phone", "Phone call", PhoneCall],
  ["whatsapp", "WhatsApp", MessageCircle],
  ["visit", "Visit", Store],
];

/**
 * Staff log a customer they reached out to themselves (by phone, WhatsApp or a visit). It goes into the
 * normal Enquiries list, recorded against the signed-in staff member for the performance report.
 * Full-screen sheet on phones, dialog on desktop.
 */
export function LogEnquiry({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (e: AdminEnquiryRow) => void }) {
  const isPhone = useIsPhone();
  const toast = useToast();
  const { index, data, brand } = useCatalogue();
  const blank = { source: "phone" as Source, name: "", mobile: "", business: "", location: "", need: "", status: "contacted" as EnquiryStatus, followUpOn: "" };
  const [f, setF] = useState(blank);
  const [items, setItems] = useState<{ productId: number; quantity: number }[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const set = (k: keyof typeof blank, v: string) => setF((x) => ({ ...x, [k]: v }));
  const hits = useMemo(() => (q.trim() ? search(index, { q, brands: [], categories: [] }).slice(0, 6) : []), [index, q]);
  const product = (id: number) => data?.products.find((p) => p.id === id);

  const reset = () => {
    setF(blank);
    setItems([]);
    setQ("");
    setErrs({});
  };
  const save = async () => {
    // Same rules as the server, checked here first: mistakes show next to the field straight away
    // and nothing invalid is sent (no failed request).
    const payload = { ...f, followUpOn: f.followUpOn || null, items };
    const check = StaffEnquirySchema.safeParse(payload);
    if (!check.success) {
      const e: Record<string, string> = {};
      for (const i of issues(check.error)) e[i.path.split(".")[0]] ??= i.message;
      setErrs(e);
      document.getElementById(`le-${Object.keys(e)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    setErrs({});
    try {
      const r = await send<{ enquiry: AdminEnquiryRow }>("/api/admin/enquiries", "POST", payload);
      toast(`Logged ${r.enquiry.reference} for ${r.enquiry.contactName}.`, "success");
      onSaved(r.enquiry);
      reset();
      onClose();
    } catch (e) {
      setErrs(fieldErrors(e));
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const field = (k: "name" | "mobile" | "business" | "location", label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}, req = true) => (
    <div>
      <label htmlFor={`le-${k}`} className="label">
        {label} {req && <span className="text-danger">*</span>}
      </label>
      <input id={`le-${k}`} className={`field ${errs[k] ? "!border-danger" : ""}`} value={f[k]} onChange={(e) => set(k, e.target.value)} aria-invalid={!!errs[k]} {...extra} />
      {errs[k] && <p className="mt-1 text-xs text-danger">{errs[k]}</p>}
    </div>
  );
  const chip = (on: boolean) => `tap inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium lg:min-h-0 lg:py-1.5 ${on ? "border-ink bg-ink text-paper" : "border-line bg-card"}`;

  const body = (
    <form
      id="log-enquiry-form"
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      noValidate
      data-testid="log-enquiry-form"
    >
      <fieldset>
        <legend className="label">How did you reach them?</legend>
        <div className="flex flex-wrap gap-2">
          {SOURCES.map(([v, l, Icon]) => (
            <button key={v} type="button" className={chip(f.source === v)} aria-pressed={f.source === v} onClick={() => set("source", v)}>
              <Icon className="size-4" /> {l}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("name", "Customer name", { autoComplete: "off" })}
        {field("mobile", "Mobile number", { type: "tel", inputMode: "tel", autoComplete: "off" })}
        {field("location", "Location (city / district)", { autoComplete: "off" })}
        {field("business", "Business name", { autoComplete: "off" }, false)}
      </div>
      <div>
        <label htmlFor="le-need" className="label">
          What do they need?
        </label>
        <textarea id="le-need" rows={3} className={`field ${errs.need ? "!border-danger" : ""}`} value={f.need} onChange={(e) => set("need", e.target.value)} placeholder="e.g. 5 kW rooftop, needs 10 panels and an inverter by next week" />
      </div>

      <fieldset>
        <legend className="label">Products (optional)</legend>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
          <input className="field !rounded-full pl-10" placeholder="Search by name, model, wattage…" value={q} onChange={(e) => setQ(e.target.value)} inputMode="search" aria-label="Search products to add" data-testid="le-product-search" />
        </div>
        {hits.length > 0 && (
          <ul className="mt-2 divide-y divide-line/70 rounded-2xl border border-line">
            {hits.map((h) => (
              <li key={h.item.p.id}>
                <button
                  type="button"
                  className="list-row !min-h-12"
                  onClick={() => {
                    setItems((xs) => (xs.some((x) => x.productId === h.item.p.id) ? xs : [...xs, { productId: h.item.p.id, quantity: 1 }]));
                    setQ("");
                  }}
                  data-testid="le-product-hit"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{h.item.p.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {h.item.brand} {h.item.p.model ? `· ${h.item.p.model}` : ""}{h.item.p.stock === "out_of_stock" ? " · Out of stock" : h.item.p.stock === "limited" ? " · Limited stock" : ""}
                    </span>
                  </span>
                  <Plus className="size-4 shrink-0 text-verdi-700" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && (
          <ul className="mt-3 grid gap-2" data-testid="le-items">
            {items.map((it) => {
              const p = product(it.productId);
              return (
                <li key={it.productId} className="flex items-center gap-2 rounded-2xl bg-paper-2/60 p-2 pl-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{p?.name ?? `Product #${it.productId}`}</span>
                    <span className="num block truncate text-xs text-muted">
                      {p ? brand(p.brandId)?.name : ""} · {p?.price.sellingPaise != null ? formatPaise(p.price.sellingPaise) : "Price on request"}
                    </span>
                  </span>
                  <span className="flex items-center rounded-full border border-line bg-card" role="group" aria-label="Quantity">
                    <button type="button" className="tap grid place-items-center text-muted lg:min-h-9 lg:min-w-9" aria-label="Decrease quantity" onClick={() => setItems((xs) => xs.map((x) => (x.productId === it.productId ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x)))}>
                      <Minus className="size-3.5" />
                    </button>
                    <input
                      className="num w-12 bg-transparent text-center text-sm outline-none"
                      inputMode="numeric"
                      aria-label={`Quantity for ${p?.name ?? "product"}`}
                      value={it.quantity}
                      onChange={(e) => {
                        const n = Math.max(1, Math.min(100000, Number(e.target.value.replace(/\D/g, "")) || 1));
                        setItems((xs) => xs.map((x) => (x.productId === it.productId ? { ...x, quantity: n } : x)));
                      }}
                    />
                    <button type="button" className="tap grid place-items-center text-muted lg:min-h-9 lg:min-w-9" aria-label="Increase quantity" onClick={() => setItems((xs) => xs.map((x) => (x.productId === it.productId ? { ...x, quantity: Math.min(100000, x.quantity + 1) } : x)))}>
                      <Plus className="size-3.5" />
                    </button>
                  </span>
                  <button type="button" className="tap grid place-items-center text-subtle hover:text-danger lg:min-h-9 lg:min-w-9" aria-label={`Remove ${p?.name ?? "product"}`} onClick={() => setItems((xs) => xs.filter((x) => x.productId !== it.productId))}>
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <fieldset>
        <legend className="label">Status after the call</legend>
        <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1">
          {(["new", "contacted"] as const).map((s) => (
            <button key={s} type="button" className={chip(f.status === s)} aria-pressed={f.status === s} onClick={() => set("status", s)}>
              {s === "new" ? "Not reached yet" : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-subtle">Making a quotation moves it to Quoted automatically.</p>
      </fieldset>

      <label className="block">
        <span className="label">Next follow-up (optional)</span>
        <input id="le-followUpOn" type="date" className="field !w-auto" value={f.followUpOn} onChange={(e) => set("followUpOn", e.target.value)} data-testid="le-followup" />
      </label>
    </form>
  );

  const actions = (
    <div className="flex justify-end gap-2">
      <button type="button" className="btn-ghost tap lg:min-h-0" onClick={onClose} disabled={busy}>
        Cancel
      </button>
      <button type="submit" form="log-enquiry-form" className="btn-primary tap flex-1 sm:flex-none lg:min-h-0" disabled={busy} data-testid="le-save">
        {busy ? <Spinner className="size-4" /> : <Plus className="size-4" />} Save enquiry
      </button>
    </div>
  );

  return isPhone ? (
    <BottomSheet open={open} onClose={onClose} title="Log an enquiry you made" full footer={actions} testId="log-enquiry">
      {body}
    </BottomSheet>
  ) : (
    <Modal open={open} onClose={onClose} title="Log an enquiry you made" description="A customer you reached by phone, WhatsApp or a visit. It is recorded under your name." size="lg" footer={actions}>
      <div className="p-5">{body}</div>
    </Modal>
  );
}
