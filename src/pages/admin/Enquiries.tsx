import { Award, CalendarClock, Check, ChevronDown, FileText, Phone, Plus, RotateCcw, Search, UserRound, X } from "lucide-react";
import { usePaged } from "../../components/Pager";
import { LogEnquiry } from "./LogEnquiry";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { EnquiryAdminUpdateSchema, formatMobile, issues, normaliseMobile } from "../../../shared/admin-schemas";
import { formatPaise } from "../../../shared/money";
import { paiseToRupeeInput, rupeesToPaise } from "../../../shared/schemas";
import { CLOSED_REASON_LABEL, CLOSED_REASONS, PIPELINE_STATUSES, type AdminEnquiryRow, type ClosedReason, type EnquiryEvent, type EnquiryStats, type EnquiryStatus } from "../../../shared/types";
import { Spinner, useToast } from "../../components/ui";
import { WhatsAppIcon } from "../../components/WhatsAppIcon";
import { api } from "../../lib/api";
import { ADMIN_STATUS_LABEL as STATUS_LABEL, STATUS_HINT, STATUS_STYLE } from "../../lib/enquiry-status";
import { Accordion, ActionBar, ClampText } from "../../components/mobile/kit";
import { useAdmin } from "./AdminLayout";
import { canManage, dt, errorText, PageHead, send } from "./kit";

export default function Enquiries() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<AdminEnquiryRow[] | null>(null);
  const pg = usePaged(rows ?? [], "admin.enquiries");
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
  const owner = params.get("owner") ?? "";
  const adminMe = useAdmin();
  // owner/admin can assign: the active staff list comes from the performance endpoint (owner/admin only)
  const [staff, setStaff] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    if (!canManage(adminMe)) return;
    api<EnquiryStats>("/api/admin/enquiries/stats?period=year")
      .then((r) => setStaff(r.staff.map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => undefined);
  }, [adminMe]);

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
        intro="Every enquiry goes New → Contacted → Quoted → Won or Not won. Open one to see the next step. Signed-in customers see the progress in their account."
        actions={
          <button type="button" className="btn-primary btn-sm max-lg:tap" onClick={() => setLogging(true)} data-testid="log-enquiry-open">
            <Plus className="size-4" /> Log enquiry
          </button>
        }
      />
      <LogEnquiry open={logging} onClose={() => setLogging(false)} onSaved={(e) => setRows((rs) => [e, ...(rs ?? [])])} />

      <div className="mt-6 flex flex-wrap gap-2 max-lg:scrollbar-none max-lg:-mx-4 max-lg:mt-3 max-lg:flex-nowrap max-lg:overflow-x-auto max-lg:px-4">
        {[["", `All (${total})`] as const, ...PIPELINE_STATUSES.map((s) => [s, `${STATUS_LABEL[s]} (${(counts[s] ?? 0) + (s === "lost" ? (counts.cancelled ?? 0) : 0)})`] as const)].map(([k, l]) => (
          <button key={k} type="button" className={`${status === k ? "chip-on chip" : "chip"} max-lg:tap max-lg:shrink-0 max-lg:whitespace-nowrap`} onClick={() => set("status", k)}>
            {l}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 max-lg:scrollbar-none max-lg:-mx-4 max-lg:flex-nowrap max-lg:overflow-x-auto max-lg:px-4" role="group" aria-label="Where the enquiry came from">
        {[
          ["", "All enquiries"],
          ["website", "From customers (website)"],
          ["staff", "Staff outreach"],
        ].map(([k, l]) => (
          <button key={k} type="button" className={`${source === k && !params.get("staff") ? "chip-on chip" : "chip"} max-lg:tap max-lg:shrink-0 max-lg:whitespace-nowrap`} onClick={() => setParams((pr) => { const n = new URLSearchParams(pr); if (k) n.set("source", k); else n.delete("source"); n.delete("staff"); return n; }, { replace: true })}>
            {l}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 max-lg:scrollbar-none max-lg:-mx-4 max-lg:flex-nowrap max-lg:overflow-x-auto max-lg:px-4" role="group" aria-label="Who is responsible">
        {[
          ["", canManage(adminMe) ? "Everyone" : "Mine & unassigned"],
          ["me", "Mine"],
          ["none", "Unassigned"],
        ].map(([k, l]) => (
          <button key={k} type="button" className={`${owner === k ? "chip-on chip" : "chip"} max-lg:tap max-lg:shrink-0 max-lg:whitespace-nowrap`} onClick={() => set("owner", k)} data-testid={`owner-filter-${k || "all"}`}>
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
          {pg.items.map((e) => (
            <EnquiryRow key={e.id} e={e} staff={staff} open={open === e.id} onToggle={() => setOpen(open === e.id ? null : e.id)} onSaved={(n) => setRows((rs) => rs!.map((r) => (r.id === n.id ? n : r)))} />
          ))}
        </ul>
      )}
      {pg.pager}
    </div>
  );
}

function EnquiryRow({ e, staff, open, onToggle, onSaved }: { e: AdminEnquiryRow; staff: { id: number; name: string }[]; open: boolean; onToggle: () => void; onSaved: (e: AdminEnquiryRow) => void }) {
  const admin = useAdmin();
  const isAdmin = canManage(admin);
  // owner/admin can update any enquiry; other staff only the ones they are responsible for
  const editable = isAdmin || e.owner?.id === admin.id;
  const [reason, setReason] = useState<ClosedReason | "">(e.closedReason ?? "");
  const [reasonNote, setReasonNote] = useState(e.closedNote ?? "");
  const [sale, setSale] = useState(paiseToRupeeInput(e.salePaise ?? e.totalPaise ?? null));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<EnquiryEvent[] | null>(null);
  useEffect(() => {
    if (!open) return;
    api<{ events: EnquiryEvent[] }>(`/api/admin/enquiries/${e.id}/history`)
      .then((r) => setEvents(r.events))
      .catch(() => setEvents([]));
  }, [open, e.id, e.updatedAt]);
  const toast = useToast();
  const assign = async (body: { adminId: number | null } | { take: true }) => {
    try {
      const r = await send<{ enquiry: AdminEnquiryRow }>(`/api/admin/enquiries/${e.id}/assign`, "POST", body);
      onSaved(r.enquiry);
      toast("take" in body ? "You are now responsible for this enquiry." : "Enquiry assigned.", "success");
    } catch (err) {
      toast(errorText(err), "error");
    }
  };
  const [notes, setNotes] = useState(e.adminNotes ?? "");
  const [followUp, setFollowUp] = useState(e.followUpOn ?? "");
  // which step form is open: record a sale without a quotation, close as Not won, or reopen (owner/admin)
  const [action, setAction] = useState<null | "won" | "lost" | "reopen">(null);
  const [pts, setPts] = useState("");
  const [busy, setBusy] = useState(false);
  const mobile = normaliseMobile(e.mobile);
  const isOpenStage = e.status === "new" || e.status === "contacted" || e.status === "quoted";
  const salePaise = rupeesToPaise(sale);
  const detailsDirty = notes !== (e.adminNotes ?? "") || followUp !== (e.followUpOn ?? "");

  /** Sends one update (same rules as the server, checked first so mistakes show next to the field). */
  const submit = async (extra: Record<string, unknown>, done: string) => {
    const body = { adminNotes: notes.trim() || null, ...(isOpenStage && !extra.status ? { followUpOn: followUp || null } : {}), ...extra };
    const check = EnquiryAdminUpdateSchema.safeParse(body);
    if (!check.success || (extra.status === "won" && Number.isNaN(salePaise))) {
      const er: Record<string, string> = {};
      if (extra.status === "won" && Number.isNaN(salePaise)) er.salePaise = "Enter a valid amount, e.g. 125000 or 125000.50";
      if (!check.success) for (const i of issues(check.error)) er[i.path] ??= i.message;
      setErrs(er);
      return;
    }
    setErrs({});
    setBusy(true);
    try {
      const r = await send<{ enquiry: AdminEnquiryRow }>(`/api/admin/enquiries/${e.id}`, "PUT", body);
      onSaved(r.enquiry);
      setAction(null);
      setFollowUp(r.enquiry.followUpOn ?? "");
      toast(done, "success");
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
  const quoteLink = e.latestQuote ? `/admin/quotations/${e.latestQuote.id}` : null;

  return (
    <li className="card overflow-hidden" data-testid="admin-enquiry">
      <button type="button" className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 p-4 text-left hover:bg-paper" onClick={onToggle} aria-expanded={open}>
        <span className="num font-semibold">{e.reference}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[e.status]}`}>{STATUS_LABEL[e.status]}</span>
        {e.followUpOn && <FollowUpChip date={e.followUpOn} />}
        <span className="min-w-0 flex-1 truncate text-sm">
          {e.contactName}
          {e.business ? ` · ${e.business}` : ""} <span className="text-muted">· {e.location}</span>
        </span>
        {e.source === "website" ? (
          <span className="rounded-full bg-verdi-50 px-2 py-0.5 text-xs font-medium text-verdi-700" data-testid="enquiry-source">
            From website
          </span>
        ) : (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-600" data-testid="enquiry-source">
            Staff · {e.source === "phone" ? "Phone" : e.source === "whatsapp" ? "WhatsApp" : "Visit"}
            {e.createdBy ? ` · ${e.createdBy.name}` : ""}
          </span>
        )}
        <span className={`text-xs ${e.owner ? "text-ink/70" : "font-semibold text-sun-600"}`} data-testid="enquiry-owner">
          {e.owner ? `👤 ${e.owner.name}` : "Unassigned"}
        </span>
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
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-paper p-3 text-sm" data-testid="enquiry-assignment">
              <span className="text-muted">Responsible:</span>
              {isAdmin ? (
                <select
                  aria-label="Responsible staff member"
                  className="field !w-auto min-w-40 flex-1 !py-1.5"
                  value={e.owner?.id ?? ""}
                  onChange={(x) => void assign({ adminId: x.target.value ? Number(x.target.value) : null })}
                  data-testid="assign-select"
                >
                  <option value="">Unassigned</option>
                  {[...staff, ...(e.owner && !staff.some((x) => x.id === e.owner!.id) ? [e.owner] : [])].map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              ) : (
                <b className="font-semibold">{e.owner?.name ?? "Nobody yet"}</b>
              )}
              {!e.owner && !isAdmin && (
                <button type="button" className="btn-primary btn-sm max-lg:tap" onClick={() => void assign({ take: true })} data-testid="take-enquiry">
                  Take this enquiry
                </button>
              )}
              {e.owner && !editable && <span className="basis-full text-xs text-muted">Only {e.owner.name} or an admin can update this enquiry.</span>}
            </div>
            <StepBar status={e.status} />
            <p className="-mt-1 text-xs text-muted" data-testid="status-hint">
              {STATUS_HINT[e.status]}
            </p>
            {(e.status === "lost" || e.status === "cancelled") && e.closedReason && (
              <p className="rounded-xl bg-danger-bg px-3 py-2 text-xs text-danger" data-testid="closed-reason">
                Not won: {CLOSED_REASON_LABEL[e.closedReason]}
                {e.closedNote ? ` — ${e.closedNote}` : ""}
              </p>
            )}
            {e.status === "won" && e.salePaise != null && (
              <p className="num rounded-xl bg-verdi-50 px-3 py-2 text-xs text-verdi-700" data-testid="sale-value">
                Sale: {formatPaise(e.salePaise)}
                {e.latestQuote?.status === "accepted" ? ` (quotation ${e.latestQuote.number})` : ""}
              </p>
            )}

            {/* the next step: one main button per stage */}
            {editable && isOpenStage && action === null && (
              <div className="flex flex-wrap gap-2" data-testid="next-step">
                {e.status === "new" && (
                  <button type="button" className="btn-primary btn-sm max-lg:tap" disabled={busy} onClick={() => void submit({ status: "contacted", followUpOn: followUp || null }, "Marked as contacted.")} data-testid="next-contacted">
                    <Check className="size-4" /> Mark as contacted
                  </button>
                )}
                {e.status === "quoted" && quoteLink ? (
                  <Link className="btn-primary btn-sm max-lg:tap" to={quoteLink} data-testid="next-open-quote">
                    <FileText className="size-4" /> Open quotation {e.latestQuote!.number}
                  </Link>
                ) : (
                  <Link className={`${e.status === "contacted" ? "btn-primary" : "btn-ghost"} btn-sm max-lg:tap`} to="/admin/quotations/new" state={{ enquiry: e }} data-testid="next-quote">
                    <FileText className="size-4" /> Create quotation
                  </Link>
                )}
                {e.quoteCount === 0 && e.status !== "new" && (
                  <button type="button" className="btn-ghost btn-sm max-lg:tap" onClick={() => setAction("won")} data-testid="next-won">
                    Won without a quotation
                  </button>
                )}
                <button type="button" className="btn-ghost btn-sm text-danger max-lg:tap" onClick={() => setAction("lost")} data-testid="next-notwon">
                  <X className="size-4" /> Not won
                </button>
              </div>
            )}
            {editable && action === "won" && (
              <div className="grid gap-2 rounded-2xl border border-line p-3">
                <label htmlFor={`sale-${e.id}`} className="label !mb-0">
                  Final sale amount (₹) <span className="text-danger">*</span>
                </label>
                <input id={`sale-${e.id}`} className={`field num ${errs.salePaise ? "!border-danger" : ""}`} inputMode="decimal" value={sale} onChange={(x) => setSale(x.target.value)} placeholder="e.g. 125000" data-testid="sale-input" />
                {errs.salePaise && <p className="text-xs text-danger">{errs.salePaise}</p>}
                <p className="text-xs text-subtle">Only for sales without a quotation. Staff bonus and customer points are added from this amount.</p>
                <div className="flex gap-2">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => (setAction(null), setErrs({}))}>
                    Back
                  </button>
                  <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => void submit({ status: "won", salePaise: Number.isNaN(salePaise) ? null : salePaise }, "Marked as won.")} data-testid="confirm-won">
                    Mark as won
                  </button>
                </div>
              </div>
            )}
            {editable && action === "lost" && (
              <fieldset className="rounded-2xl border border-line p-3" data-testid="reason-picker">
                <legend className="label px-1">
                  Why was it not won? <span className="text-danger">*</span>
                </legend>
                <div className="flex flex-wrap gap-1.5">
                  {CLOSED_REASONS.map((r) => (
                    <button key={r} type="button" aria-pressed={reason === r} className={`rounded-full border px-3 py-1.5 text-xs font-medium max-lg:tap ${reason === r ? "border-ink bg-ink text-paper" : "border-line bg-card"}`} onClick={() => setReason(r)}>
                      {CLOSED_REASON_LABEL[r]}
                    </button>
                  ))}
                </div>
                {errs.closedReason && <p className="mt-1 text-xs text-danger">{errs.closedReason}</p>}
                <input className={`field mt-2 ${errs.closedNote ? "!border-danger" : ""}`} placeholder={reason === "other" ? "Describe the reason (required)" : "Details (optional)"} maxLength={500} value={reasonNote} onChange={(x) => setReasonNote(x.target.value)} aria-label="Reason details" data-testid="reason-note" />
                {errs.closedNote && <p className="mt-1 text-xs text-danger">{errs.closedNote}</p>}
                <div className="mt-2 flex gap-2">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => (setAction(null), setErrs({}))}>
                    Back
                  </button>
                  <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => void submit({ status: "lost", closedReason: reason || null, closedNote: reasonNote.trim() || null }, "Closed as Not won.")} data-testid="confirm-notwon">
                    Close as Not won
                  </button>
                </div>
              </fieldset>
            )}
            {/* closed: only the owner or an admin can reopen */}
            {isAdmin && !isOpenStage && action === null && (
              <button type="button" className="btn-ghost btn-sm justify-self-start max-lg:tap" onClick={() => setAction("reopen")} data-testid="reopen-enquiry">
                <RotateCcw className="size-4" /> Reopen
              </button>
            )}
            {isAdmin && action === "reopen" && (
              <div className="grid gap-2 rounded-2xl border border-line p-3 text-sm">
                <p>
                  Reopen as{e.status === "won" ? " (removes the sale, its staff bonus and customer points)" : ""}:
                </p>
                <div className="flex flex-wrap gap-2">
                  {(["contacted", "quoted"] as const).map((st) => (
                    <button key={st} type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => void submit({ status: st }, `Reopened as ${STATUS_LABEL[st]}.`)} data-testid={`reopen-${st}`}>
                      {STATUS_LABEL[st]}
                    </button>
                  ))}
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setAction(null)}>
                    Back
                  </button>
                </div>
                {e.latestQuote?.status === "accepted" && <p className="text-xs text-muted">This sale came from an accepted quotation: undo it on the quotation instead.</p>}
              </div>
            )}

            {/* follow-up date + internal notes */}
            {isOpenStage && (
              <div>
                <label htmlFor={`fu-${e.id}`} className="label">
                  Next follow-up
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input id={`fu-${e.id}`} type="date" className="field !w-auto !py-1.5" value={followUp} disabled={!editable} onChange={(x) => setFollowUp(x.target.value)} data-testid="followup-input" />
                  {editable &&
                    (
                      [
                        ["Tomorrow", 1],
                        ["In 3 days", 3],
                        ["Next week", 7],
                      ] as const
                    ).map(([l, d]) => (
                      <button key={l} type="button" className="chip max-lg:tap" onClick={() => setFollowUp(daysFromToday(d))}>
                        {l}
                      </button>
                    ))}
                </div>
              </div>
            )}
            <div>
              <label htmlFor={`nt-${e.id}`} className="label">
                Internal notes (not shown to the customer)
              </label>
              <textarea id={`nt-${e.id}`} rows={3} className="field" value={notes} disabled={!editable} onChange={(x) => setNotes(x.target.value)} />
            </div>
            {editable && detailsDirty && (
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  disabled={busy}
                  onClick={() => {
                    setNotes(e.adminNotes ?? "");
                    setFollowUp(e.followUpOn ?? "");
                  }}
                  data-testid="cancel-enquiry"
                >
                  Cancel
                </button>
                <button type="button" className="btn-primary btn-sm" onClick={() => void submit({}, "Saved.")} disabled={busy} data-testid="save-enquiry">
                  Save
                </button>
              </div>
            )}
            <Accordion title={<span className="text-sm">History</span>} className="rounded-2xl border border-line px-3">
              {!events ? (
                <p className="text-xs text-muted">Loading…</p>
              ) : events.length === 0 ? (
                <p className="text-xs text-muted">No changes recorded yet.</p>
              ) : (
                <ol className="grid gap-2 border-l border-line pl-3" data-testid="enquiry-history">
                  {events.map((ev) => (
                    <li key={ev.id} className="text-xs">
                      <p className="font-medium text-ink">
                        {ev.kind === "created" ? `Logged as ${STATUS_LABEL[ev.toStatus ?? "new"]}` : ev.kind === "assigned" ? (ev.assignedTo ? `Assigned to ${ev.assignedTo}` : "Unassigned") : `${STATUS_LABEL[ev.fromStatus ?? "new"]} → ${STATUS_LABEL[ev.toStatus ?? "new"]}`}
                        {ev.reason ? ` · ${CLOSED_REASON_LABEL[ev.reason]}` : ""}
                        {ev.salePaise != null ? ` · ${formatPaise(ev.salePaise)}` : ""}
                      </p>
                      {ev.note && <p className="text-muted">{ev.note}</p>}
                      <p className="text-subtle">
                        {ev.by ?? "—"} · {dt(ev.at)}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </Accordion>
            {isAdmin && e.customerId && (
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

/** YYYY-MM-DD in India, n days from today. */
function daysFromToday(n: number): string {
  return new Date(Date.now() + 5.5 * 3600_000 + n * 86400_000).toISOString().slice(0, 10);
}

/** Follow-up date on the row: red when overdue, amber today. */
function FollowUpChip({ date }: { date: string }) {
  const today = daysFromToday(0);
  const cls = date < today ? "bg-danger-bg text-danger" : date === today ? "bg-sun-100 text-ink" : "bg-paper-2 text-muted";
  const label = date < today ? "Follow-up overdue" : date === today ? "Follow up today" : `Follow up ${new Date(date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`} data-testid="followup-chip">
      <CalendarClock className="size-3.5" /> {label}
    </span>
  );
}

/** New → Contacted → Quoted → Won (or Not won). */
function StepBar({ status }: { status: EnquiryStatus }) {
  const notWon = status === "lost" || status === "cancelled";
  const steps: EnquiryStatus[] = ["new", "contacted", "quoted", notWon ? "lost" : "won"];
  const at = notWon ? 3 : steps.indexOf(status);
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label={`Stage: ${STATUS_LABEL[status]}`} data-testid="step-bar">
      {steps.map((st, i) => (
        <li key={st} className="min-w-0" aria-current={i === at ? "step" : undefined}>
          <span className={`block h-1.5 rounded-full ${i <= at ? (notWon && i === 3 ? "bg-danger" : "bg-verdi-600") : "bg-paper-3"}`} />
          <span className={`mt-1 block truncate text-[11px] ${i === at ? "font-semibold text-ink" : "text-muted"}`}>{STATUS_LABEL[st]}</span>
        </li>
      ))}
    </ol>
  );
}
