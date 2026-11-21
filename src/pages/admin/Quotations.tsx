import { useConfirm, useConfirmDiscard } from "../../components/confirm";
import { usePaged } from "../../components/Pager";
import { ArrowLeft, Building2, Download, Eye, FileText, ImagePlus, Plus, QrCode, Save, ScrollText, Search, Settings2, Share2, Trash2, X } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { formatMobile } from "../../../shared/admin-schemas";
import { formatPaise } from "../../../shared/money";
import { DEFAULT_TERMS, isExpired, lineAmounts, mediaPath, QUOTE_STATUSES, quoteTotals, validUntil, type DiscountType, type Quote, type QuoteRow, type QuoteSettings, type QuoteStatus } from "../../../shared/quotation";
import { paiseToRupeeInput, rupeesToPaise } from "../../../shared/schemas";
import type { AdminEnquiryRow } from "../../../shared/types";
import { Modal, Spinner, useToast } from "../../components/ui";
import { WhatsAppIcon } from "../../components/WhatsAppIcon";
import { api } from "../../lib/api";
import { useCatalogue } from "../../lib/catalogue";
import { useSite } from "../../lib/site";
import { useAdmin } from "./AdminLayout";
import { canManage, dt, errorText, PageHead, send, uploadFile, useUnsavedWarning } from "./kit";

const PdfViewer = lazy(() => import("../../components/PdfViewer"));

const STATUS_LABEL: Record<QuoteStatus, string> = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined" };
/** One line telling staff what each quotation status means and what to do next. */
const STATUS_HINT: Record<QuoteStatus, string> = {
  draft: "Not sent yet. Download it or send it on WhatsApp; it then becomes Sent.",
  sent: "Waiting for the customer's answer. When they agree, mark it Accepted: the enquiry becomes Won with this total as the sale.",
  accepted: "The customer agreed. The sale is recorded on the enquiry; staff bonus and customer points were added.",
  declined: "The customer said no. Revise this quotation and send it again, or close the enquiry as Not won.",
};
const STATUS_STYLE: Record<QuoteStatus, string> = {
  draft: "bg-paper-2 text-muted",
  sent: "bg-sky-100 text-sky-800",
  accepted: "bg-verdi-100 text-verdi-800",
  declined: "bg-danger-bg text-danger",
};

export default function Quotations() {
  const { id } = useParams();
  // A new quotation moves from /new to /<id> on first save: keep the same editor mounted (state.created).
  const created = !!(useLocation().state as { created?: boolean } | null)?.created;
  return id ? <Editor key={id === "new" || created ? "editor" : id} id={id === "new" ? null : Number(id)} /> : <List />;
}

// ================================================================== list

function List() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<QuoteRow[] | null>(null);
  const pg = usePaged(rows ?? [], "admin.quotations");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const status = params.get("status") ?? "";
  const admin = useAdmin();
  const owner = params.get("owner") ?? "";

  useEffect(() => {
    api<{ rows: QuoteRow[] }>(`/api/admin/quotations?${params}`)
      .then((r) => setRows(r.rows))
      .catch((e) => setError(errorText(e)));
  }, [params]);

  const set = (k: string, v: string) =>
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
    <div className="container-x py-10">
      <PageHead
        title="Quotations"
        intro="Draft → Sent → Accepted or Declined. Accepting a quotation records the sale on its enquiry. Quotations past their validity date show as Expired."
        actions={
          <>
            {canManage(admin) && (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setSettingsOpen(true)}>
                <Settings2 className="size-4" /> PDF details
              </button>
            )}
            <Link to="/admin/quotations/new" className="btn-primary btn-sm" data-testid="new-quotation">
              <Plus className="size-4" /> New quotation
            </Link>
          </>
        }
      />
      <div className="mt-6 flex flex-wrap gap-2">
        {[["", "All"] as const, ...QUOTE_STATUSES.map((s) => [s, STATUS_LABEL[s]] as const)].map(([k, l]) => (
          <button key={k} type="button" className={status === k ? "chip-on chip" : "chip"} onClick={() => set("status", k)}>
            {l}
          </button>
        ))}
      </div>
      {canManage(admin) && (
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Whose quotations">
          {[
            ["", "Everyone"],
            ["me", "Mine"],
          ].map(([k, l]) => (
            <button key={k} type="button" className={owner === k ? "chip-on chip" : "chip"} onClick={() => set("owner", k)} data-testid={`quote-owner-${k || "all"}`}>
              {l}
            </button>
          ))}
        </div>
      )}
      <div className="relative mt-3 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
        <input aria-label="Search quotations" className="field !rounded-full pl-10" placeholder="Number, customer, company or mobile" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && set("q", q.trim())} onBlur={() => set("q", q.trim())} />
      </div>
      {error && <p className="mt-6 rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
      {!rows ? (
        <div className="mt-10 flex justify-center">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-10 text-center text-muted">
          <FileText className="mx-auto size-8 text-subtle" />
          <p className="mt-2">No quotations yet.</p>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3" data-testid="quotation-list">
          {pg.items.map((r) => (
            <li key={r.id}>
              <Link to={`/admin/quotations/${r.id}`} className="card flex flex-wrap items-center gap-x-4 gap-y-1 p-4 transition hover:border-verdi-300">
                <span className="font-mono text-sm font-semibold">{r.number}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                {isExpired(r) && <ExpiredChip />}
                <span className="min-w-0 flex-1 truncate">
                  {r.customerName}
                  {r.customerCompany ? <span className="text-muted"> · {r.customerCompany}</span> : null}
                </span>
                <span className="num font-semibold">{formatPaise(r.totalPaise)}</span>
                <span className="w-full text-xs [overflow-wrap:anywhere] text-muted sm:w-auto">
                  {r.itemCount} item{r.itemCount === 1 ? "" : "s"} · {dt(r.createdAt)} · {r.owner?.name ?? r.createdBy}
                  {r.enquiryReference ? ` · enquiry ${r.enquiryReference}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pg.pager}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

// ================================================================== PDF details (admin-only settings)

function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [v, setV] = useState<QuoteSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  useEffect(() => {
    if (!open) return;
    setErr(null);
    api<{ settings: QuoteSettings }>("/api/admin/quotations/settings")
      .then((r) => setV(r.settings))
      .catch((e) => setErr(errorText(e)));
  }, [open]);
  const set = (k: keyof QuoteSettings, val: string) => setV((x) => ({ ...x, [k]: val }));

  const text = (k: keyof QuoteSettings, label: string, hint: string, opts: { ph?: string; rows?: number; mono?: boolean; inputMode?: "numeric" } = {}) => (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      {opts.rows ? (
        <textarea className="field mt-1.5" rows={opts.rows} placeholder={opts.ph} value={v?.[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
      ) : (
        <input className={`field mt-1.5 ${opts.mono ? "font-mono uppercase" : ""}`} inputMode={opts.inputMode} placeholder={opts.ph} value={v?.[k] ?? ""} onChange={(e) => set(k, e.target.value)} />
      )}
      <span className="mt-1.5 block text-xs leading-relaxed text-subtle">{hint}</span>
    </label>
  );
  const section = (icon: ReactNode, title: string, intro: string, children: ReactNode) => (
    <section className="rounded-2xl border border-line bg-paper/60 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-verdi-50 text-verdi-700">{icon}</span>
        <div>
          <h3 className="font-semibold text-ink">{title}</h3>
          <p className="text-xs text-muted">{intro}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );

  const uploadQr = async (file: File) => {
    setUploading(true);
    setErr(null);
    try {
      const up = await uploadFile(file, "logo");
      set("quoteUpiQr", up.storageKey);
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Quotation PDF details"
      description="Printed on every quotation. Leave a field blank to leave it off."
      size="lg"
      fullscreenOnMobile
      footer={
        <div className="flex w-full justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!v || busy || uploading}
            data-testid="save-quote-settings"
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                const r = await send<{ settings: QuoteSettings }>("/api/admin/quotations/settings", "PUT", {
                  quoteGstin: (v?.quoteGstin ?? "").trim().toUpperCase(),
                  quoteValidDays: v?.quoteValidDays ?? "",
                  quoteSignatory: v?.quoteSignatory ?? "",
                  quoteTerms: v?.quoteTerms ?? "",
                  quoteBank: v?.quoteBank ?? "",
                  quoteUpiQr: v?.quoteUpiQr ?? "",
                  quoteUpiId: (v?.quoteUpiId ?? "").trim(),
                });
                setV(r.settings);
                toast("PDF details saved", "success");
                onClose();
              } catch (e) {
                setErr(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Spinner className="size-4" /> : <Save className="size-4" />} Save details
          </button>
        </div>
      }
    >
      {!v ? (
        <div className="flex justify-center p-10">{err ? <p className="text-sm text-danger">{err}</p> : <Spinner />}</div>
      ) : (
        <div className="grid gap-5 p-5 sm:p-6" data-testid="quote-settings">
          {section(
            <Building2 className="size-4.5" />,
            "Business details",
            "Shown in the PDF header and signature.",
            <>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                {text("quoteGstin", "GSTIN", "15 characters, e.g. 33ABCDE1234F1Z5.", { ph: "Not registered / leave blank", mono: true })}
                {text("quoteValidDays", "Default validity (days)", "For new quotations. Default 15.", { ph: "15", inputMode: "numeric" })}
              </div>
              {text("quoteSignatory", "Signatory name", "Printed under the signature line. Leave blank to print “Authorised signatory”.", { ph: "Authorised signatory" })}
            </>,
          )}

          {section(
            <QrCode className="size-4.5" />,
            "Payment",
            "Customers can scan the QR code on the quotation to pay with GPay, PhonePe, Paytm or any UPI app.",
            <>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="grid size-36 shrink-0 place-items-center overflow-hidden rounded-2xl border border-dashed border-line bg-white" data-testid="upi-qr-preview">
                  {v.quoteUpiQr ? <img src={mediaPath(v.quoteUpiQr)} alt="UPI QR code" className="size-full object-contain p-2" /> : <QrCode className="size-10 text-subtle" />}
                </div>
                <div className="grid flex-1 gap-3">
                  <div className="flex flex-wrap gap-2">
                    <label className={`btn-ghost btn-sm cursor-pointer ${uploading ? "pointer-events-none opacity-60" : ""}`}>
                      {uploading ? <Spinner className="size-4" /> : <ImagePlus className="size-4" />} {v.quoteUpiQr ? "Replace QR code" : "Upload QR code"}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        data-testid="upi-qr-input"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void uploadQr(f);
                        }}
                      />
                    </label>
                    {v.quoteUpiQr && (
                      <button type="button" className="btn-ghost btn-sm text-danger" onClick={() => set("quoteUpiQr", "")}>
                        <Trash2 className="size-4" /> Remove
                      </button>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-subtle">In GPay: tap your profile photo → your QR code → Share / Download, then upload that image here. PNG or JPG, up to 2 MB.</p>
                  {text("quoteUpiId", "UPI ID (optional)", "Printed under the QR code for customers who type it in.", { ph: "e.g. verdisolarr@okaxis" })}
                </div>
              </div>
              {text("quoteBank", "Bank details (optional)", "Account name, number, IFSC and branch, printed as entered.", { rows: 3, ph: "A/c name: VERDI SOLARR SOLUTION\nA/c no: …\nIFSC: …" })}
            </>,
          )}

          {section(
            <ScrollText className="size-4.5" />,
            "Terms & conditions",
            "One per line. Leave blank to use the standard terms shown below.",
            text("quoteTerms", "Terms", "The validity date is always added as the last line.", { rows: 5, ph: DEFAULT_TERMS }),
          )}
          {err && (
            <p className="rounded-xl bg-danger-bg p-3 text-sm text-danger" role="alert">
              {err}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

// ================================================================== editor

interface Line {
  key: string;
  productId: number | null;
  name: string; // custom lines
  unit: string; // custom lines
  qty: string;
  savedPaise: number | null; // price already on the saved quotation
  price: string; // rupees, for unpriced products / custom lines
  discountType: DiscountType;
  discount: string; // % or rupees
}

let seq = 0;
const newKey = () => `l${++seq}`;

function Editor({ id }: { id: number | null }) {
  const nav = useNavigate();
  const loc = useLocation();
  const toast = useToast();
  const SITE = useSite();
  const admin = useAdmin();
  const cat = useCatalogue();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [settings, setSettings] = useState<QuoteSettings>({});
  const [loading, setLoading] = useState(id !== null);
  const [cust, setCust] = useState({ customerName: "", customerCompany: "", customerMobile: "", customerEmail: "", customerAddress: "", notes: "", validDays: "15" });
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pdf, setPdf] = useState<{ url: string; blob: Blob; filename: string } | null>(null);
  const initFromEnquiry = useRef(false);
  const confirm = useConfirm();
  const confirmDiscard = useConfirmDiscard();
  useUnsavedWarning(dirty);
  const cancel = async () => {
    if (await confirmDiscard(dirty)) nav("/admin/quotations");
  };

  // load settings + quotation
  useEffect(() => {
    api<{ settings: QuoteSettings }>("/api/admin/quotations/settings")
      .then((r) => {
        setSettings(r.settings);
        if (id === null && r.settings.quoteValidDays) setCust((c) => ({ ...c, validDays: r.settings.quoteValidDays! }));
      })
      .catch(() => undefined);
    if (id === null) return;
    api<{ quote: Quote }>(`/api/admin/quotations/${id}`)
      .then((r) => load(r.quote))
      .catch((e) => setError(errorText(e)))
      .finally(() => setLoading(false));
  }, [id]);

  // prefill from an enquiry (Enquiries → "Create quotation")
  const fromEnquiry = useRef<number | null>(null);
  useEffect(() => {
    const e = (loc.state as { enquiry?: AdminEnquiryRow } | null)?.enquiry;
    if (id !== null || !e || initFromEnquiry.current) return;
    initFromEnquiry.current = true;
    fromEnquiry.current = e.id;
    setCust((c) => ({ ...c, customerName: e.contactName, customerCompany: e.business ?? "", customerMobile: e.mobile, customerAddress: e.location ?? "", notes: `Ref. enquiry ${e.reference}` }));
    setLines(e.items.filter((i) => i.productId !== null).map((i) => blankLine(i.productId, i.quantity)));
    setDirty(true);
  }, [id, loc.state]);

  function load(q: Quote) {
    setQuote(q);
    setCust({
      customerName: q.customerName,
      customerCompany: q.customerCompany ?? "",
      customerMobile: q.customerMobile ? formatMobile(q.customerMobile) : "",
      customerEmail: q.customerEmail ?? "",
      customerAddress: q.customerAddress ?? "",
      notes: q.notes ?? "",
      validDays: String(q.validDays),
    });
    setLines(
      q.items.map((i) => ({
        key: newKey(),
        productId: i.productId,
        name: i.name,
        unit: i.unit,
        qty: String(i.qty),
        savedPaise: i.unitPaise,
        price: paiseToRupeeInput(i.unitPaise),
        discountType: i.discountType,
        discount: i.discountType === "none" ? "" : String(i.discountValue / 100),
      })),
    );
    setDirty(false);
  }

  const blankLine = (productId: number | null, qty = 1): Line => ({ key: newKey(), productId, name: "", unit: "", qty: String(qty), savedPaise: null, price: "", discountType: "none", discount: "" });

  const product = useCallback((pid: number | null) => (pid === null ? undefined : cat.byId(pid)), [cat]);

  /** Unit price the server will use: saved/listed price for listed products, typed price otherwise. */
  const unitPaiseOf = useCallback(
    (l: Line): number | null => {
      const p = product(l.productId);
      if (p && p.price.sellingPaise !== null) return l.savedPaise ?? p.price.sellingPaise;
      const v = rupeesToPaise(l.price);
      return v === null || Number.isNaN(v) ? null : v;
    },
    [product],
  );
  const discountValueOf = (l: Line) => {
    if (l.discountType === "none") return 0;
    const v = rupeesToPaise(l.discount); // both "12.5" % and "1500" ₹ → ×100
    return v === null || Number.isNaN(v) ? 0 : v;
  };

  const totals = useMemo(
    () => quoteTotals(lines.map((l) => ({ unitPaise: unitPaiseOf(l) ?? 0, qty: Math.max(0, Number(l.qty) || 0), discountType: l.discountType, discountValue: discountValueOf(l) }))),
    [lines, unitPaiseOf],
  );

  const edit = (key: string, patch: Partial<Line>) => {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
    setDirty(true);
  };
  const setC = (k: keyof typeof cust, v: string) => {
    setCust((c) => ({ ...c, [k]: v }));
    setDirty(true);
  };
  const addProduct = (pid: number) => {
    setLines((ls) => {
      const ex = ls.find((l) => l.productId === pid);
      if (ex) return ls.map((l) => (l === ex ? { ...l, qty: String((Number(l.qty) || 0) + 1) } : l));
      return [...ls, blankLine(pid)];
    });
    setDirty(true);
  };

  function payload() {
    return {
      ...cust,
      validDays: Number(cust.validDays) || 15,
      // a new quotation made from an enquiry is linked to it (enquiry moves to Quoted; accepting it = Won)
      ...(id === null && fromEnquiry.current ? { enquiryId: fromEnquiry.current } : {}),
      items: lines.map((l) => {
        const p = product(l.productId);
        const listed = p && p.price.sellingPaise !== null;
        const typed = rupeesToPaise(l.price);
        return {
          productId: l.productId,
          name: l.productId === null ? l.name : "",
          unit: l.productId === null ? l.unit : "",
          qty: Math.round(Number(l.qty) || 0),
          unitPaise: listed ? null : typed === null || Number.isNaN(typed) ? null : typed,
          discountType: l.discountType,
          discountValue: discountValueOf(l),
        };
      }),
    };
  }

  async function save(): Promise<Quote | null> {
    setError(null);
    try {
      const r = quote
        ? await send<{ quote: Quote }>(`/api/admin/quotations/${quote.id}`, "PUT", payload())
        : await send<{ quote: Quote }>("/api/admin/quotations", "POST", payload());
      load(r.quote);
      if (!quote) nav(`/admin/quotations/${r.quote.id}`, { replace: true, state: { created: true } });
      return r.quote;
    } catch (e) {
      setError(errorText(e));
      return null;
    }
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  async function preview() {
    const q = dirty || !quote ? await save() : quote;
    if (!q) return;
    try {
      const { buildQuotationPdf } = await import("../../lib/quotation-pdf");
      const out = await buildQuotationPdf(q, SITE, settings);
      if (pdf) URL.revokeObjectURL(pdf.url);
      setPdf({ ...out, url: URL.createObjectURL(out.blob) });
    } catch (e) {
      console.error(e);
      setError(`Could not create the PDF: ${e instanceof Error ? e.message : errorText(e)}`);
    }
  }

  function download() {
    if (!pdf) return;
    const a = document.createElement("a");
    a.href = pdf.url;
    a.download = pdf.filename;
    a.click();
  }

  const message = (q: Quote, link?: string) =>
    [
      `Hello ${q.customerName},`,
      ``,
      `Thank you for your enquiry with ${SITE.name}. Please find our quotation ${q.number} for ${formatPaise(q.totalPaise)}, valid until ${validUntil(q.createdAt, q.validDays).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}.`,
      ...(link ? [``, `View / download the PDF: ${link}`] : []),
      ``,
      `For any questions, call or WhatsApp us on ${SITE.phoneDisplay}.`,
      ``,
      `Regards,`,
      SITE.name,
    ].join("\n");

  /** Upload the PDF (for the link), then open WhatsApp with the customer's number and a ready message. */
  async function whatsapp() {
    if (!pdf || !quote) return;
    const w = window.open("about:blank", "_blank"); // open now, inside the click, so it is not blocked
    try {
      const r = await api<{ shareUrl: string; status: QuoteStatus }>(`/api/admin/quotations/${quote.id}/pdf`, { method: "POST", body: pdf.blob, headers: { "Content-Type": "application/pdf" } });
      setQuote({ ...quote, shareUrl: r.shareUrl, status: r.status, sentAt: new Date().toISOString() });
      const to = quote.customerMobile ?? "";
      const url = `https://wa.me/${to}?text=${encodeURIComponent(message(quote, location.origin + r.shareUrl))}`;
      if (w) w.location.href = url;
      else location.href = url;
      toast("Quotation marked as sent", "success");
    } catch (e) {
      w?.close();
      setError(errorText(e));
    }
  }

  const canShareFile = typeof navigator !== "undefined" && !!navigator.canShare && !!pdf && navigator.canShare({ files: [new File([pdf.blob], pdf.filename, { type: "application/pdf" })] });
  async function sharePdf() {
    if (!pdf || !quote) return;
    try {
      await navigator.share({ files: [new File([pdf.blob], pdf.filename, { type: "application/pdf" })], title: `Quotation ${quote.number}`, text: message(quote) });
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(errorText(e));
    }
  }

  async function setStatus(s: QuoteStatus) {
    if (!quote) return;
    try {
      const r = await send<{ quote: Quote }>(`/api/admin/quotations/${quote.id}/status`, "PUT", { status: s });
      setQuote(r.quote);
      toast(`Marked as ${STATUS_LABEL[s].toLowerCase()}`, "success");
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function remove() {
    if (!quote || !(await confirm({ title: `Delete quotation ${quote.number}?`, message: "This cannot be undone. Any WhatsApp link already sent for it stops working.", confirmLabel: "Delete quotation", tone: "danger" }))) return;
    try {
      await send(`/api/admin/quotations/${quote.id}`, "DELETE");
      toast("Quotation deleted", "success");
      nav("/admin/quotations");
    } catch (e) {
      setError(errorText(e));
    }
  }

  if (loading)
    return (
      <div className="container-x flex justify-center py-20">
        <Spinner />
      </div>
    );

  return (
    <div className="container-x py-10 pb-28">
      <Link to="/admin/quotations" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> All quotations
      </Link>
      <PageHead
        title={quote ? `Quotation ${quote.number}` : "New quotation"}
        intro={quote ? `Created ${dt(quote.createdAt)} by ${quote.owner?.name ?? quote.createdBy}${quote.sentAt ? ` · last sent ${dt(quote.sentAt)}` : ""}${quote.enquiryReference ? ` · for enquiry ${quote.enquiryReference}` : ""}` : "Prices come from the catalogue. Add a discount on any line if needed."}
        actions={
          quote && (
            <div className="flex items-center gap-2">
              {isExpired(quote) && <ExpiredChip />}
              <select
                aria-label="Status"
                className={`field !w-auto !py-1.5 text-sm ${STATUS_STYLE[quote.status]}`}
                value={quote.status}
                disabled={quote.status === "accepted" && !canManage(admin)}
                onChange={(e) => setStatus(e.target.value as QuoteStatus)}
                data-testid="q-status"
              >
                {QUOTE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              {canManage(admin) && (
                <button type="button" className="btn-ghost btn-sm text-danger" onClick={remove} aria-label="Delete quotation">
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          )
        }
      />

      {quote && (
        <div className="mt-4 grid gap-2" data-testid="q-status-hint">
          <p className="text-sm text-muted">
            <b className="font-semibold text-ink">{STATUS_LABEL[quote.status]}:</b> {STATUS_HINT[quote.status]}
            {isExpired(quote) && ` It expired on ${validUntil(quote.createdAt, quote.validDays).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}: change "Valid for" and send it again.`}
          </p>
          {quote.status === "declined" && (
            <div className="flex flex-wrap gap-2" data-testid="q-declined-next">
              <button type="button" className="btn-primary btn-sm max-lg:tap" onClick={() => void setStatus("draft")} data-testid="q-revise">
                Revise and send again
              </button>
              {quote.enquiryReference && (
                <Link className="btn-ghost btn-sm max-lg:tap" to={`/admin/enquiries?q=${encodeURIComponent(quote.enquiryReference)}`} data-testid="q-close-enquiry">
                  Close enquiry {quote.enquiryReference} as Not won
                </Link>
              )}
            </div>
          )}
          {quote.status === "accepted" && <p className="text-xs text-subtle">Accepted quotations cannot be edited. {canManage(admin) ? "To change it, set the status back first (this also undoes the sale)." : "Ask the owner or an admin if it needs to change."}</p>}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 grid-cols-1 gap-6">
          {/* customer */}
          <section className="card p-5">
            <h2 className="font-semibold">Customer</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Name *" value={cust.customerName} onChange={(v) => setC("customerName", v)} testId="q-name" />
              <Field label="Company" value={cust.customerCompany} onChange={(v) => setC("customerCompany", v)} />
              <Field label="Mobile (WhatsApp)" value={cust.customerMobile} onChange={(v) => setC("customerMobile", v)} inputMode="tel" testId="q-mobile" />
              <Field label="Email" value={cust.customerEmail} onChange={(v) => setC("customerEmail", v)} inputMode="email" />
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium">Address / site location</span>
                <textarea className="field mt-1 min-h-16" value={cust.customerAddress} onChange={(e) => setC("customerAddress", e.target.value)} />
              </label>
            </div>
          </section>

          {/* items */}
          <section className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Products</h2>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => {
                  setLines((ls) => [...ls, blankLine(null)]);
                  setDirty(true);
                }}
              >
                <Plus className="size-4" /> Custom line
              </button>
            </div>
            <ProductPicker onPick={addProduct} />
            {lines.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">Search above to add products.</p>
            ) : (
              <ul className="mt-4 grid grid-cols-1 gap-3" data-testid="q-lines">
                {lines.map((l, i) => {
                  const p = product(l.productId);
                  const listed = !!p && p.price.sellingPaise !== null;
                  const unit = unitPaiseOf(l);
                  const a = lineAmounts(unit ?? 0, Math.max(0, Number(l.qty) || 0), l.discountType, discountValueOf(l));
                  const brand = p ? cat.brand(p.brandId)?.name : null;
                  const img = p?.images[0]?.url;
                  return (
                    <li key={l.key} className="rounded-2xl border border-line p-3" data-testid="q-line">
                      <div className="flex gap-3">
                        <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-line">
                          {img ? <img src={img} alt="" className="size-full object-contain" loading="lazy" /> : <FileText className="size-5 text-subtle" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          {l.productId === null ? (
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
                              <input aria-label="Description" className="field !py-1.5" placeholder="Description, e.g. Transport" value={l.name} onChange={(e) => edit(l.key, { name: e.target.value })} />
                              <input aria-label="Unit" className="field !py-1.5" placeholder="per piece" value={l.unit} onChange={(e) => edit(l.key, { unit: e.target.value })} />
                            </div>
                          ) : (
                            <>
                              <p className="truncate font-medium">{p?.name ?? l.name}</p>
                              <p className="truncate text-xs text-muted">{[brand, p?.model && `Model ${p.model}`, p?.price.unit].filter(Boolean).join(" · ")}</p>
                            </>
                          )}
                        </div>
                        <button type="button" className="self-start rounded-full p-1.5 text-muted hover:bg-paper-2 hover:text-danger" aria-label={`Remove line ${i + 1}`} onClick={() => (setLines((ls) => ls.filter((x) => x.key !== l.key)), setDirty(true))}>
                          <X className="size-4" />
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[80px_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] sm:items-end">
                        <label className="block">
                          <span className="text-xs text-muted">Qty</span>
                          <input aria-label="Quantity" className="field num !py-1.5" inputMode="numeric" value={l.qty} onChange={(e) => edit(l.key, { qty: e.target.value.replace(/\D/g, "").slice(0, 6) })} />
                        </label>
                        <label className="block">
                          <span className="text-xs text-muted">Unit price (₹)</span>
                          {listed ? (
                            <span className="num block py-1.5 font-medium" title={l.savedPaise !== null && l.savedPaise !== p!.price.sellingPaise ? `Quoted price kept. Current list price ${formatPaise(p!.price.sellingPaise)}` : undefined}>
                              {formatPaise(unit)}
                            </span>
                          ) : (
                            <input aria-label="Unit price" className="field num !py-1.5" inputMode="decimal" placeholder="Enter price" value={l.price} onChange={(e) => edit(l.key, { price: e.target.value })} />
                          )}
                        </label>
                        <label className="col-span-2 block sm:col-span-1">
                          <span className="text-xs text-muted">Extra discount</span>
                          <div className="flex gap-1">
                            <select aria-label="Discount type" className="field !w-auto !py-1.5" value={l.discountType} onChange={(e) => edit(l.key, { discountType: e.target.value as DiscountType, discount: "" })}>
                              <option value="none">None</option>
                              <option value="pct">%</option>
                              <option value="amount">₹ off</option>
                            </select>
                            {l.discountType !== "none" && (
                              <input aria-label="Discount" className="field num min-w-0 !py-1.5" inputMode="decimal" placeholder={l.discountType === "pct" ? "e.g. 5" : "e.g. 500"} value={l.discount} onChange={(e) => edit(l.key, { discount: e.target.value })} />
                            )}
                          </div>
                        </label>
                        <div className="col-span-2 text-right sm:col-span-1">
                          {a.discount > 0 && <p className="num text-xs text-muted line-through">{formatPaise(a.gross)}</p>}
                          <p className="num font-semibold">{unit === null ? "—" : formatPaise(a.total)}</p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <h2 className="font-semibold">Notes</h2>
            <textarea className="field mt-3 min-h-20" placeholder="Optional — printed on the quotation" value={cust.notes} onChange={(e) => setC("notes", e.target.value)} />
          </section>
        </div>

        {/* summary */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-5">
            <h2 className="font-semibold">Summary</h2>
            <dl className="mt-4 grid gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Subtotal</dt>
                <dd className="num">{formatPaise(totals.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Discount</dt>
                <dd className="num text-verdi-700">− {formatPaise(totals.discount)}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd className="num" data-testid="q-total">
                  {formatPaise(totals.total)}
                </dd>
              </div>
            </dl>
            <label className="mt-4 flex items-center justify-between gap-3 text-sm">
              <span className="text-muted">Valid for (days)</span>
              <input aria-label="Valid for days" className="field num !w-20 !py-1.5 text-right" inputMode="numeric" value={cust.validDays} onChange={(e) => setC("validDays", e.target.value.replace(/\D/g, "").slice(0, 3))} />
            </label>
            {error && <p className="mt-4 rounded-xl bg-danger-bg p-3 text-sm text-danger" role="alert">{error}</p>}
            <div className="mt-5 grid gap-2 max-lg:hidden">
              <ActionButtons busy={busy} dirty={dirty} hasQuote={!!quote} onSave={() => run("save", async () => void ((await save()) && toast("Quotation saved", "success")))} onPreview={() => run("preview", preview)} onCancel={cancel} />
            </div>
          </div>
        </aside>
      </div>

      {/* phones: actions pinned above the tab bar */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-line bg-card/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">Total</p>
            <p className="num truncate font-semibold">{formatPaise(totals.total)}</p>
          </div>
          <ActionButtons busy={busy} dirty={dirty} hasQuote={!!quote} compact onCancel={cancel} onSave={() => run("save", async () => void ((await save()) && toast("Quotation saved", "success")))} onPreview={() => run("preview", preview)} />
        </div>
      </div>

      <Modal open={!!pdf} onClose={() => setPdf(null)} title={quote ? `Quotation ${quote.number}` : "Preview"} size="xl" fullscreenOnMobile
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={download} data-testid="q-download">
              <Download className="size-4" /> Download PDF
            </button>
            {canShareFile && (
              <button type="button" className="btn-ghost" onClick={sharePdf}>
                <Share2 className="size-4" /> Share PDF
              </button>
            )}
            <button type="button" className="btn-primary" disabled={!quote?.customerMobile || busy === "wa"} onClick={() => run("wa", whatsapp)} title={quote?.customerMobile ? undefined : "Add the customer's mobile number first"} data-testid="q-whatsapp">
              {busy === "wa" ? <Spinner className="size-4" /> : <WhatsAppIcon className="size-4" />} WhatsApp to {quote?.customerMobile ? formatMobile(quote.customerMobile) : "customer"}
            </button>
          </div>
        }
      >
        {pdf && (
          <div className="h-[70dvh] overflow-auto rounded-xl bg-paper-2" data-testid="q-preview">
            <Suspense fallback={<Spinner />}>
              <PdfViewer url={pdf.url} />
            </Suspense>
          </div>
        )}
        <p className="mt-3 text-xs text-muted">
          “WhatsApp” opens a chat with the customer containing a private link to this PDF. On a phone, “Share PDF” attaches the file itself to WhatsApp, Gmail or any app.
        </p>
      </Modal>
    </div>
  );
}

function ActionButtons({ busy, dirty, hasQuote, compact, onSave, onPreview, onCancel }: { busy: string | null; dirty: boolean; hasQuote: boolean; compact?: boolean; onSave: () => void; onPreview: () => void; onCancel: () => void }) {
  return (
    <>
      <button type="button" className={`btn-ghost ${compact ? "btn-sm" : ""}`} disabled={!!busy} onClick={onCancel} data-testid="q-cancel" aria-label="Cancel">
        {compact && <X className="size-4 min-[400px]:hidden" />}
        <span className={compact ? "max-[399px]:hidden" : ""}>Cancel</span>
      </button>
      <button type="button" className={`btn-ghost ${compact ? "btn-sm" : ""}`} disabled={!!busy || (hasQuote && !dirty)} onClick={onSave} data-testid="q-save">
        {busy === "save" ? <Spinner className="size-4" /> : <Save className="size-4" />} <span className={compact ? "max-[399px]:sr-only" : ""}>{hasQuote ? "Save" : "Save draft"}</span>
      </button>
      <button type="button" className={`btn-primary ${compact ? "btn-sm" : ""}`} disabled={!!busy} onClick={onPreview} data-testid="q-preview-btn">
        {busy === "preview" ? <Spinner className="size-4" /> : <Eye className="size-4" />} Preview PDF
      </button>
    </>
  );
}

function Field({ label, value, onChange, inputMode, testId }: { label: string; value: string; onChange: (v: string) => void; inputMode?: "tel" | "email"; testId?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input className="field mt-1" value={value} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} data-testid={testId} />
    </label>
  );
}

function ProductPicker({ onPick }: { onPick: (id: number) => void }) {
  const cat = useCatalogue();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length || !cat.data) return [];
    return cat.data.products
      .filter((p) => {
        const hay = `${p.name} ${p.model ?? ""} ${p.sku} ${cat.brand(p.brandId)?.name ?? ""} ${cat.category(p.categoryId)?.name ?? ""}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      .slice(0, 8);
  }, [q, cat]);
  return (
    <div className="relative mt-4">
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
      <input
        aria-label="Add product"
        className="field !rounded-full pl-10"
        placeholder="Search products to add — name, model, brand"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        data-testid="q-product-search"
      />
      {open && results.length > 0 && (
        <ul className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-2xl border border-line bg-card p-1 shadow-[var(--shadow-lift)]" role="listbox">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-paper-2"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(p.id);
                  setQ("");
                  setOpen(false);
                }}
                data-testid="q-product-option"
              >
                <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-white ring-1 ring-line">{p.images[0] ? <img src={p.images[0].url} alt="" className="size-full object-contain" /> : <FileText className="size-4 text-subtle" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted">{[cat.brand(p.brandId)?.name, p.model].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="num shrink-0 text-sm">{formatPaise(p.price.sellingPaise)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExpiredChip() {
  return (
    <span className="rounded-full bg-sun-100 px-2 py-0.5 text-xs font-medium text-ink" data-testid="q-expired">
      Expired
    </span>
  );
}
