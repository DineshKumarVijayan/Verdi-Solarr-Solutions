import { Award, ChevronDown, FileText, Phone, Plus, Search, UserRound } from "lucide-react";
import { usePaged } from "../../components/Pager";
import { LogEnquiry } from "./LogEnquiry";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { EnquiryAdminUpdateSchema, formatMobile, issues, normaliseMobile } from "../../../shared/admin-schemas";
import { formatPaise } from "../../../shared/money";
import { paiseToRupeeInput, rupeesToPaise } from "../../../shared/schemas";
import { CLOSED_REASON_LABEL, CLOSED_REASONS, ENQUIRY_STATUSES, type AdminEnquiryRow, type ClosedReason, type EnquiryEvent, type EnquiryStats, type EnquiryStatus } from "../../../shared/types";
import { Spinner, useToast } from "../../components/ui";
import { WhatsAppIcon } from "../../components/WhatsAppIcon";
import { api } from "../../lib/api";
import { STATUS_LABEL, STATUS_STYLE } from "../../lib/enquiry-status";
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
        intro="Every enquiry in one place: from customers using the website, and from staff reaching out by phone, WhatsApp or visits. Update the status as you follow up — signed-in customers see it in their account."
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
          ["", "Everyone"],
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
  const [sale, setSale] = useState(paiseToRupeeInput(e.salePaise ?? e.quotePaise ?? e.totalPaise ?? null));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [events, setEvents] = useState<EnquiryEvent[] | null>(null);
  useEffect(() => {
    if (!open) return;
    api<{ events: EnquiryEvent[] }>(`/api/admin/enquiries/${e.id}/history`)
      .then((r) => setEvents(r.events))
      .catch(() => setEvents([]));
  }, [open, e.id, e.updatedAt]);
  const assign = async (body: { adminId: number | null } | { take: true }) => {
    try {
      const r = await send<{ enquiry: AdminEnquiryRow }>(`/api/admin/enquiries/${e.id}/assign`, "POST", body);
      onSaved(r.enquiry);
      toast("take" in body ? "You are now responsible for this enquiry." : "Enquiry assigned.", "success");
    } catch (err) {
      toast(errorText(err), "error");
    }
  };
  const toast = useToast();
  const [status, setStatus] = useState<EnquiryStatus>(e.status);
  const [notes, setNotes] = useState(e.adminNotes ?? "");
  const [pts, setPts] = useState("");
  const [busy, setBusy] = useState(false);
  const mobile = normaliseMobile(e.mobile);

  const closing = status === "lost" || status === "cancelled";
  const salePaise = rupeesToPaise(sale);
  const dirty = status !== e.status || notes !== (e.adminNotes ?? "") || (closing && (reason !== (e.closedReason ?? "") || reasonNote !== (e.closedNote ?? ""))) || (status === "won" && salePaise !== e.salePaise);
  const save = async () => {
    const body = {
      status,
      adminNotes: notes.trim() || null,
      closedReason: closing ? reason || null : null,
      closedNote: closing ? reasonNote.trim() || null : null,
      salePaise: status === "won" ? (Number.isNaN(salePaise) ? null : salePaise) : null,
    };
    // same rules as the server, checked first so mistakes show next to the field
    const check = EnquiryAdminUpdateSchema.safeParse(body);
    if (!check.success || (status === "won" && Number.isNaN(salePaise))) {
      const er: Record<string, string> = {};
      if (status === "won" && Number.isNaN(salePaise)) er.salePaise = "Enter a valid amount, e.g. 125000 or 125000.50";
      if (!check.success) for (const i of issues(check.error)) er[i.path] ??= i.message;
      setErrs(er);
      return;
    }
    setErrs({});
    setBusy(true);
    try {
      const r = await send<{ enquiry: AdminEnquiryRow }>(`/api/admin/enquiries/${e.id}`, "PUT", body);
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
            {(e.status === "lost" || e.status === "cancelled") && e.closedReason && (
              <p className="rounded-xl bg-danger-bg px-3 py-2 text-xs text-danger" data-testid="closed-reason">
                {STATUS_LABEL[e.status]}: {CLOSED_REASON_LABEL[e.closedReason]}
                {e.closedNote ? ` — ${e.closedNote}` : ""}
              </p>
            )}
            {e.status === "won" && e.salePaise != null && (
              <p className="num rounded-xl bg-verdi-50 px-3 py-2 text-xs text-verdi-700" data-testid="sale-value">
                Sale: {formatPaise(e.salePaise)}
              </p>
            )}
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
            {editable && closing && (
              <fieldset data-testid="reason-picker">
                <legend className="label">Why was it {status === "lost" ? "lost" : "cancelled"}? <span className="text-danger">*</span></legend>
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
              </fieldset>
            )}
            {editable && status === "won" && (
              <div>
                <label htmlFor={`sale-${e.id}`} className="label">
                  Final sale amount (₹) <span className="text-danger">*</span>
                </label>
                <input id={`sale-${e.id}`} className={`field num ${errs.salePaise ? "!border-danger" : ""}`} inputMode="decimal" value={sale} onChange={(x) => setSale(x.target.value)} placeholder="e.g. 125000" data-testid="sale-input" />
                {errs.salePaise ? <p className="mt-1 text-xs text-danger">{errs.salePaise}</p> : e.quotePaise != null && <p className="mt-1 text-xs text-subtle">Latest quotation: {formatPaise(e.quotePaise)}</p>}
              </div>
            )}
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
                  setReason(e.closedReason ?? "");
                  setReasonNote(e.closedNote ?? "");
                  setErrs({});
                  onToggle();
                }}
                data-testid="cancel-enquiry"
              >
                Cancel
              </button>
              <button type="button" className="btn-primary btn-sm justify-self-start" onClick={save} disabled={busy || !dirty} data-testid="save-enquiry">
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
