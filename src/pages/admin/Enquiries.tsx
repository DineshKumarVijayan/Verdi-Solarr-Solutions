import { Award, ChevronDown, FileText, Phone, Plus, Search, UserRound } from "lucide-react";
import { LogEnquiry } from "./LogEnquiry";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { formatMobile, normaliseMobile } from "../../../shared/admin-schemas";
import { formatPaise } from "../../../shared/money";
import { ENQUIRY_STATUSES, type AdminEnquiryRow, type EnquiryStatus } from "../../../shared/types";
import { Spinner, useToast } from "../../components/ui";
import { WhatsAppIcon } from "../../components/WhatsAppIcon";
import { api } from "../../lib/api";
import { STATUS_LABEL, STATUS_STYLE } from "../../lib/enquiry-status";
import { ActionBar, ClampText } from "../../components/mobile/kit";
import { useAdmin } from "./AdminLayout";
import { canManage, dt, errorText, PageHead, send } from "./kit";

export default function Enquiries() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<AdminEnquiryRow[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [q, setQ] = useState(params.get("q") ?? "");
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logging, setLogging] = useState(params.get("log") === "1");
  // opened from the dashboard shortcut: drop ?log=1 so Back does not reopen the form
  useEffect(() => {
    if (params.get("log") === "1") setParams((pr) => { const n = new URLSearchParams(pr); n.delete("log"); return n; }, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const status = params.get("status") ?? "";
  const source = params.get("source") ?? "";

  const load = useCallback(() => {
    api<{ rows: AdminEnquiryRow[]; counts: Record<string, number> }>(`/api/admin/enquiries?${params}`)
      .then((r) => {
        setRows(r.rows);
        setCounts(r.counts);
      })
      .catch((e) => setError(errorText(e)));
  }, [params]);
  useEffect(load, [load]);

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
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <div className="container-x py-10 max-lg:pt-3 max-lg:pb-24">
      <PageHead
        title="Enquiries"
        intro="Every enquiry from the website basket, plus the ones staff log from calls, WhatsApp and visits. Update the status as you follow up — signed-in customers see it in their account."
        actions={
          <button type="button" className="btn-primary btn-sm max-lg:tap" onClick={() => setLogging(true)} data-testid="log-enquiry-open">
            <Plus className="size-4" /> Log enquiry
          </button>
        }
      />
      <LogEnquiry open={logging} onClose={() => setLogging(false)} onSaved={(e) => setRows((rs) => [e, ...(rs ?? [])])} />

      <div className="mt-6 flex flex-wrap gap-2 max-lg:scrollbar-none max-lg:-mx-4 max-lg:mt-3 max-lg:flex-nowrap max-lg:overflow-x-auto max-lg:px-4">
        {[["", `All (${total})`] as const, ...ENQUIRY_STATUSES.map((s) => [s, `${STATUS_LABEL[s]} (${counts[s] ?? 0})`] as const)].map(([k, l]) => (
          <button key={k} type="button" className={`${status === k ? "chip-on chip" : "chip"} max-lg:tap max-lg:shrink-0 max-lg:whitespace-nowrap`} onClick={() => set("status", k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 max-lg:scrollbar-none max-lg:-mx-4 max-lg:flex-nowrap max-lg:overflow-x-auto max-lg:px-4" role="group" aria-label="Who logged it">
        {[
          ["", "All sources"],
          ["website", "Website"],
          ["staff", "Logged by staff"],
        ].map(([k, l]) => (
          <button key={k} type="button" className={`${source === k && !params.get("staff") ? "chip-on chip" : "chip"} max-lg:tap max-lg:shrink-0 max-lg:whitespace-nowrap`} onClick={() => setParams((pr) => { const n = new URLSearchParams(pr); if (k) n.set("source", k); else n.delete("source"); n.delete("staff"); return n; }, { replace: true })}>
            {l}
          </button>
        ))}
      </div>
      <div className="relative mt-3 max-w-md max-lg:sticky max-lg:top-14 max-lg:z-20 max-lg:-mx-4 max-lg:max-w-none max-lg:bg-paper max-lg:px-4 max-lg:py-2">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle max-lg:left-7.5" />
        <input aria-label="Search enquiries" className="field !rounded-full pl-10" placeholder="Reference, name, mobile or business" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && set("q", q.trim())} onBlur={() => set("q", q.trim())} />
      </div>

      {error && <p className="mt-6 rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
      {!rows ? (
        <div className="mt-10 flex justify-center">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-10 text-center text-muted">No enquiries match.</p>
      ) : (
        <ul className="mt-6 grid gap-3" data-testid="admin-enquiries">
          {rows.map((e) => (
            <EnquiryRow key={e.id} e={e} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} onSaved={(n) => setRows((rs) => rs!.map((r) => (r.id === n.id ? n : r)))} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EnquiryRow({ e, open, onToggle, onSaved }: { e: AdminEnquiryRow; open: boolean; onToggle: () => void; onSaved: (e: AdminEnquiryRow) => void }) {
  const admin = useAdmin();
  const editable = canManage(admin);
  const toast = useToast();
  const [status, setStatus] = useState<EnquiryStatus>(e.status);
  const [notes, setNotes] = useState(e.adminNotes ?? "");
  const [pts, setPts] = useState("");
  const [busy, setBusy] = useState(false);
  const mobile = normaliseMobile(e.mobile);

  const save = async () => {
    setBusy(true);
    try {
      const r = await send<{ enquiry: AdminEnquiryRow }>(`/api/admin/enquiries/${e.id}`, "PUT", { status, adminNotes: notes });
      onSaved(r.enquiry);
      toast("Enquiry updated.", "success");
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setBusy(false);
    }
  };
  const award = async () => {
    const n = Number(pts);
    if (!Number.isInteger(n) || n === 0) return toast("Enter a whole number of points.", "error");
    setBusy(true);
    try {
      await send(`/api/admin/customers/${e.customerId}/points`, "POST", { points: n, reason: n > 0 ? `Points for enquiry ${e.reference}` : `Redeemed against ${e.reference}`, enquiryId: e.id });
      setPts("");
      toast(`${n > 0 ? "Credited" : "Debited"} ${Math.abs(n)} points to ${e.customerName}.`, "success");
    } catch (err) {
      toast(errorText(err), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="card overflow-hidden" data-testid="admin-enquiry">
      <button type="button" className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 p-4 text-left hover:bg-paper" onClick={onToggle} aria-expanded={open}>
        <span className="num font-semibold">{e.reference}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[e.status]}`}>{STATUS_LABEL[e.status]}</span>
        <span className="min-w-0 flex-1 truncate text-sm">
          {e.contactName}
          {e.business ? ` · ${e.business}` : ""} <span className="text-muted">· {e.location}</span>
        </span>
        {e.source !== "website" && (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-600" data-testid="enquiry-source">
            {e.source === "phone" ? "Phone" : e.source === "whatsapp" ? "WhatsApp" : "Visit"}
            {e.createdBy ? ` · ${e.createdBy.name}` : ""}
          </span>
        )}
        {e.customerId && <UserRound className="size-4 text-verdi-600" aria-label="Registered customer" />}
        <span className="num text-sm">{e.totalPaise != null ? formatPaise(e.totalPaise) : "—"}</span>
        <span className="text-xs text-muted">{dt(e.createdAt)}</span>
        <ChevronDown className={`size-4 text-subtle transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ActionBar testId="enquiry-actions">
          <a className="btn-ghost tap min-w-0 flex-1" href={`tel:+${mobile ?? e.mobile.replace(/\D/g, "")}`}>
            <Phone className="size-4 shrink-0" /> Call
          </a>
          <a className="btn-ghost tap min-w-0 flex-1" target="_blank" rel="noopener" href={`https://wa.me/${mobile ?? e.mobile.replace(/\D/g, "")}?text=${encodeURIComponent(`Hello ${e.contactName}, this is VERDI SOLARR SOLUTION regarding your enquiry ${e.reference}.`)}`}>
            <WhatsAppIcon className="size-4 shrink-0" /> WhatsApp
          </a>
          <Link className="btn-primary tap min-w-0 flex-1" to="/admin/quotations/new" state={{ enquiry: e }}>
            <FileText className="size-4 shrink-0" /> Quote
          </Link>
        </ActionBar>
      )}
      {open && (
        <div className="grid gap-5 border-t border-line p-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="min-w-0">
            <table className="w-full text-sm">
              <tbody>
                {e.items.map((i, k) => (
                  <tr key={k} className="border-b border-line/60 last:border-0">
                    <td className="py-1.5 pr-2">
                      {i.productId ? (
                        <Link className="hover:underline" to={`/admin/products/${i.productId}`}>
                          {i.name}
                        </Link>
                      ) : (
                        i.name
                      )}
                      <span className="block text-xs text-muted">{[i.brand, i.model].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td className="num py-1.5 pr-2 text-right">× {i.quantity}</td>
                    <td className="num py-1.5 text-right">{i.unitPaise != null ? formatPaise(i.unitPaise) : "on request"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {e.comments && <ClampText className="mt-3 rounded-xl bg-paper p-3 text-sm whitespace-pre-wrap [&>div]:max-lg:line-clamp-3">{e.comments}</ClampText>}
            <div className="mt-3 flex flex-wrap gap-2 max-lg:hidden">
              <a className="btn-ghost btn-sm" href={`tel:+${mobile ?? e.mobile.replace(/\D/g, "")}`}>
                <Phone className="size-3.5" /> {mobile ? formatMobile(mobile) : e.mobile}
              </a>
              <a className="btn-ghost btn-sm" target="_blank" rel="noopener" href={`https://wa.me/${mobile ?? e.mobile.replace(/\D/g, "")}?text=${encodeURIComponent(`Hello ${e.contactName}, this is VERDI SOLARR SOLUTION regarding your enquiry ${e.reference}.`)}`}>
                <WhatsAppIcon className="size-3.5" /> WhatsApp
              </a>
              <Link className="btn-ghost btn-sm" to="/admin/quotations/new" state={{ enquiry: e }} data-testid="enquiry-to-quote">
                <FileText className="size-3.5" /> Create quotation
              </Link>
              {e.customerId && (
                <Link className="btn-ghost btn-sm" to={`/admin/customers?open=${e.customerId}`}>
                  <UserRound className="size-3.5" /> Customer account
                </Link>
              )}
            </div>
          </div>
          <div className="grid content-start gap-3">
            <div>
              <label htmlFor={`st-${e.id}`} className="label">
                Status
              </label>
              <div className="flex flex-wrap gap-1.5 lg:hidden" role="radiogroup" aria-label="Status" data-testid="status-segments">
                {ENQUIRY_STATUSES.map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={status === s} disabled={!editable} className={`tap rounded-full border px-3 text-sm font-medium ${status === s ? "border-ink bg-ink text-paper" : "border-line bg-card"}`} onClick={() => setStatus(s)}>
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              <select id={`st-${e.id}`} className="field max-lg:hidden" value={status} disabled={!editable} onChange={(x) => setStatus(x.target.value as EnquiryStatus)} data-testid="enquiry-status-select">
                {ENQUIRY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`nt-${e.id}`} className="label">
                Internal notes (not shown to the customer)
              </label>
              <textarea id={`nt-${e.id}`} rows={3} className="field" value={notes} disabled={!editable} onChange={(x) => setNotes(x.target.value)} />
            </div>
            {editable && (
              <div className="flex gap-2">
              <button
                type="button"
                className="btn-ghost btn-sm"
                disabled={busy}
                onClick={() => {
                  setStatus(e.status);
                  setNotes(e.adminNotes ?? "");
                  onToggle();
                }}
                data-testid="cancel-enquiry"
              >
                Cancel
              </button>
              <button type="button" className="btn-primary btn-sm justify-self-start" onClick={save} disabled={busy || (status === e.status && notes === (e.adminNotes ?? ""))} data-testid="save-enquiry">
                Save
              </button>
              </div>
            )}
            {editable && e.customerId && (
              <div className="rounded-2xl bg-paper p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <Award className="size-4 text-sun-500" /> Reward points for {e.customerName}
                </p>
                <div className="mt-2 flex gap-2">
                  <input aria-label="Points" inputMode="numeric" className="field num !py-1.5" placeholder="e.g. 250 or -100" value={pts} onChange={(x) => setPts(x.target.value.replace(/[^\d-]/g, ""))} />
                  <button type="button" className="btn-ghost btn-sm shrink-0" onClick={award} disabled={busy || !pts}>
                    Apply
                  </button>
                </div>
              </div>
            )}
            {e.updatedBy && (
              <p className="text-xs text-subtle">
                Last updated {dt(e.updatedAt)} by {e.updatedBy}
              </p>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
