import { Award, ClipboardCopy, KeyRound, Percent, Search } from "lucide-react";
import { basisPointsToPercent, percentToBasisPoints } from "../../../shared/bonus";
import { loyaltyPoints, type LoyaltySettings, type PendingReward } from "../../../shared/loyalty";
import { rupeesToPaise } from "../../../shared/schemas";
import { usePaged } from "../../components/Pager";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { formatMobile } from "../../../shared/admin-schemas";
import { formatPaise } from "../../../shared/money";
import type { AdminCustomerRow, EnquiryView, RewardEntry } from "../../../shared/types";
import { Modal, Spinner, useToast } from "../../components/ui";
import { WhatsAppIcon } from "../../components/WhatsAppIcon";
import { api } from "../../lib/api";
import { STATUS_LABEL, STATUS_STYLE } from "../../lib/enquiry-status";
import { useAdmin } from "./AdminLayout";
import { canManage, dt, errorText, PageHead, send, Toggle } from "./kit";

interface Detail {
  customer: AdminCustomerRow;
  enquiries: EnquiryView[];
  rewards: RewardEntry[];
}

export default function Customers() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<AdminCustomerRow[] | null>(null);
  const pg = usePaged(rows ?? [], "admin.customers");
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const openId = Number(params.get("open")) || null;

  const load = useCallback((query = "") => {
    api<{ rows: AdminCustomerRow[] }>(`/api/admin/customers?q=${encodeURIComponent(query)}`)
      .then((r) => setRows(r.rows))
      .catch((e) => setError(errorText(e)));
  }, []);
  useEffect(() => load(), [load]);

  const setOpen = (id: number | null) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (id) n.set("open", String(id));
        else n.delete("open");
        return n;
      },
      { replace: true },
    );

  return (
    <div className="container-x py-10">
      <PageHead title="Customers" intro="Customer accounts are separate from staff access. Customers sign in with their mobile number and a password; passwords are stored only as salted hashes." />
      <LoyaltyRate />
      <PendingPoints />
      <div className="relative mt-6 max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-subtle" />
        <input aria-label="Search customers" className="field !rounded-full pl-10" placeholder="Name, mobile, email or business" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(q.trim())} />
      </div>
      {error && <p className="mt-6 rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
      {!rows ? (
        <div className="mt-10 flex justify-center">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-10 text-center text-muted">No customer accounts yet.</p>
      ) : (
        <div className="card mt-6 md:overflow-x-auto">
          <table className="rtable w-full text-left text-sm md:min-w-[720px]">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="p-3 font-medium">Customer</th>
                <th className="p-3 font-medium">Mobile</th>
                <th className="p-3 text-right font-medium">Enquiries</th>
                <th className="p-3 text-right font-medium">Points</th>
                <th className="p-3 font-medium">Joined</th>
                <th className="p-3 font-medium">Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {pg.items.map((c) => (
                <tr key={c.id} className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-paper" onClick={() => setOpen(c.id)} data-testid="admin-customer-row">
                  <td className="rt-title p-3">
                    <button type="button" className="text-left font-semibold hover:underline">
                      {c.name}
                    </button>
                    {!c.isActive && <span className="ml-2 rounded-full bg-paper-3 px-2 py-0.5 text-[10px] text-muted">disabled</span>}
                    <p className="text-xs text-muted">{[c.business, c.city].filter(Boolean).join(" · ")}</p>
                  </td>
                  <td className="num p-3 max-md:text-xs max-md:text-muted">{formatMobile(c.mobile)}</td>
                  <td className="rt-chip num p-3 text-right" data-label="Enquiries">{c.enquiries}</td>
                  <td className="rt-aside num p-3 text-right font-semibold" data-label="Points">
                    {c.points.toLocaleString("en-IN")}
                    <span className="text-[11px] font-normal text-muted md:hidden"> pts</span>
                  </td>
                  <td className="rt-chip p-3 text-xs text-muted" data-label="Joined">{dt(c.createdAt)}</td>
                  <td className="rt-hide p-3 text-xs text-muted">{dt(c.lastLoginAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pg.pager}
      {openId && <CustomerModal id={openId} onClose={() => setOpen(null)} onChanged={() => load(q.trim())} />}
    </div>
  );
}

function CustomerModal({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const admin = useAdmin();
  const editable = canManage(admin);
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [pts, setPts] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"points" | "sale">("points");
  const [sale, setSale] = useState("");
  const [rate, setRate] = useState<number | null>(null);
  useEffect(() => {
    api<LoyaltySettings>("/api/admin/loyalty")
      .then((r) => setRate(r.rateBasisPoints))
      .catch(() => undefined);
  }, []);
  const salePaise = rupeesToPaise(sale);
  const salePts = salePaise && !Number.isNaN(salePaise) && rate != null ? loyaltyPoints(salePaise, rate) : null;
  const ready = mode === "points" ? !!pts && pts !== "-" && Number(pts) !== 0 : !!salePts;
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Detail>(`/api/admin/customers/${id}`)
      .then(setD)
      .catch((e) => toast(errorText(e), "error"));
  }, [id, toast]);

  const act = async (fn: () => Promise<Detail>, msg: string) => {
    setBusy(true);
    try {
      setD(await fn());
      onChanged();
      toast(msg, "success");
      return true;
    } catch (e) {
      toast(errorText(e), "error");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const c = d?.customer;
  return (
    <Modal open onClose={onClose} title={c?.name ?? "Customer"} size="lg" fullscreenOnMobile>
      {!d || !c ? (
        <div className="flex justify-center p-10">
          <Spinner />
        </div>
      ) : (
        <div className="grid gap-5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="text-sm">
              <p className="num">{formatMobile(c.mobile)}</p>
              <p className="text-muted">{[c.email, c.business, c.city].filter(Boolean).join(" · ") || "—"}</p>
              <p className="mt-1 text-xs text-subtle">
                Joined {dt(c.createdAt)} · last sign-in {dt(c.lastLoginAt)}
              </p>
            </div>
            {editable && <Toggle id="cu-active" checked={c.isActive} onChange={(v) => act(() => send(`/api/admin/customers/${id}`, "PUT", { isActive: v }), v ? "Account enabled." : "Account disabled and signed out.")} label="Account enabled" />}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-2xl bg-ink p-4 text-paper">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Award className="size-4 text-sun-300" /> Reward points
              </p>
              <p className="num mt-1 text-4xl font-semibold" data-testid="admin-points">
                {c.points.toLocaleString("en-IN")}
              </p>
              {editable && (
                <form
                  className="mt-3 grid gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const payload = mode === "points" ? { points: Number(pts), reason } : { salePaise, reason };
                    const ok = await act(() => send(`/api/admin/customers/${id}/points`, "POST", payload), "Points updated.");
                    if (ok) {
                      setPts("");
                      setSale("");
                      setReason("");
                    }
                  }}
                >
                  <div className="flex gap-1 text-xs" role="group" aria-label="Add points by">
                    {(["points", "sale"] as const).map((m) => (
                      <button key={m} type="button" aria-pressed={mode === m} className={`rounded-full px-3 py-1.5 max-lg:min-h-11 ${mode === m ? "bg-white/15 text-paper" : "text-paper/60 hover:text-paper"}`} onClick={() => setMode(m)} data-testid={`points-mode-${m}`}>
                        {m === "points" ? "Points" : "For a sale"}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    {mode === "points" ? (
                      <input aria-label="Points to add or remove" inputMode="numeric" className="field num !py-1.5 text-ink" placeholder="+500 or -200" value={pts} onChange={(e) => setPts(e.target.value.replace(/[^\d-]/g, ""))} />
                    ) : (
                      <input aria-label="Sale amount in rupees" inputMode="decimal" className="field num !py-1.5 text-ink" placeholder="Sale amount ₹" value={sale} onChange={(e) => setSale(e.target.value.replace(/[^\d.,]/g, ""))} data-testid="points-sale" />
                    )}
                    <button type="submit" className="btn-sun btn-sm shrink-0" disabled={busy || !ready || !reason.trim()}>
                      Apply
                    </button>
                  </div>
                  {mode === "sale" && (
                    <p className="text-xs text-paper/70" data-testid="points-sale-preview">
                      {rate == null ? "Loading the loyalty %…" : salePts ? `= ${salePts.toLocaleString("en-IN")} points (${basisPointsToPercent(rate)}% of the sale, 1 point = ₹1)` : `Earns ${basisPointsToPercent(rate)}% of the sale as points (1 point = ₹1).`}
                    </p>
                  )}
                  <input aria-label="Reason" className="field !py-1.5 text-ink" placeholder="Reason (shown to the customer)" value={reason} onChange={(e) => setReason(e.target.value)} />
                  {(pts || sale || reason) && (
                    <button
                      type="button"
                      className="justify-self-start text-xs text-paper/70 underline hover:text-paper"
                      onClick={() => {
                        setPts("");
                        setSale("");
                        setReason("");
                      }}
                    >
                      Cancel
                    </button>
                  )}
                </form>
              )}
              {d.rewards.length > 0 && (
                <ul className="mt-3 grid max-h-40 gap-1.5 overflow-auto border-t border-white/10 pt-2 text-xs">
                  {d.rewards.map((r) => (
                    <li key={r.id} className="flex justify-between gap-2">
                      <span className="truncate">{r.reason}</span>
                      <span className={`num shrink-0 ${r.points > 0 ? "text-verdi-300" : "text-sun-300"}`}>
                        {r.points > 0 ? "+" : ""}
                        {r.points}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-line p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <KeyRound className="size-4 text-verdi-600" /> Password reset
              </p>
              <p className="mt-1 text-xs text-muted">Creates a one-time link valid for 48 hours. Send it to the customer on WhatsApp. Any older link stops working.</p>
              {editable && (
                <button
                  type="button"
                  className="btn-ghost btn-sm mt-3"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      setLink(await send(`/api/admin/customers/${id}/reset-link`, "POST"));
                    } catch (e) {
                      toast(errorText(e), "error");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Create reset link
                </button>
              )}
              {link && (
                <div className="mt-3 grid gap-2">
                  <input readOnly aria-label="Reset link" className="field !py-1.5 text-xs" value={link.url} onFocus={(e) => e.target.select()} />
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(link.url).then(() => toast("Copied", "success"))}>
                      <ClipboardCopy className="size-3.5" /> Copy
                    </button>
                    <a className="btn-primary btn-sm" target="_blank" rel="noopener" href={`https://wa.me/${c.mobile}?text=${encodeURIComponent(`Hello ${c.name}, here is your VERDI SOLARR password reset link (valid for 48 hours): ${link.url}`)}`}>
                      <WhatsAppIcon className="size-3.5" /> Send on WhatsApp
                    </a>
                  </div>
                </div>
              )}
            </section>
          </div>

          <section>
            <h3 className="font-semibold">Enquiries ({d.enquiries.length})</h3>
            {d.enquiries.length === 0 ? (
              <p className="mt-2 text-sm text-muted">None yet.</p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {d.enquiries.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-paper p-3 text-sm">
                    <Link to={`/admin/enquiries?q=${e.reference}`} className="num font-semibold hover:underline">
                      {e.reference}
                    </Link>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[e.status]}`}>{STATUS_LABEL[e.status]}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{e.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}</span>
                    <span className="num">{e.totalPaise != null ? formatPaise(e.totalPaise) : "—"}</span>
                    <span className="text-xs text-subtle">{dt(e.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Modal>
  );
}

/** Loyalty %: every won sale earns the customer this share of the sale as points. Owner/admin can change it. */
function LoyaltyRate() {
  const admin = useAdmin();
  const toast = useToast();
  const [rate, setRate] = useState<LoyaltySettings | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<LoyaltySettings>("/api/admin/loyalty")
      .then(setRate)
      .catch(() => undefined);
  }, []);
  if (!rate) return null;
  const save = async () => {
    const bp = percentToBasisPoints(edit ?? "");
    if (bp == null || Number.isNaN(bp)) return setErr("Enter a percentage between 0 and 100 (up to two decimals).");
    setBusy(true);
    try {
      setRate(await send<LoyaltySettings>("/api/admin/loyalty", "PUT", { rateBasisPoints: bp }));
      setEdit(null);
      setErr(null);
      toast("Loyalty percentage saved. New sales use it.", "success");
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-paper p-3 text-sm" data-testid="loyalty-rate">
      <Percent className="size-4 shrink-0 text-verdi-600" />
      {edit == null ? (
        <>
          <p className="min-w-0 flex-1">
            Loyalty points: <span className="num font-semibold" data-testid="loyalty-rate-value">{basisPointsToPercent(rate.rateBasisPoints) || "0"}%</span> of each sale{" "}
            <span className="text-muted">(1 point = ₹1; added when an enquiry is marked won)</span>
          </p>
          {canManage(admin) && (
            <button type="button" className="btn-ghost btn-sm max-lg:min-h-11" onClick={() => setEdit(basisPointsToPercent(rate.rateBasisPoints))} data-testid="loyalty-rate-edit">
              Change
            </button>
          )}
        </>
      ) : (
        <form
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <label className="flex items-center gap-2">
            <span>Loyalty %</span>
            <input aria-label="Loyalty percentage" inputMode="decimal" className="field num w-24 !py-1.5" value={edit} onChange={(e) => setEdit(e.target.value)} data-testid="loyalty-rate-input" />
          </label>
          <button type="submit" className="btn-primary btn-sm max-lg:min-h-11" disabled={busy} data-testid="loyalty-rate-save">
            Save
          </button>
          <button type="button" className="btn-ghost btn-sm max-lg:min-h-11" onClick={() => (setEdit(null), setErr(null))}>
            Cancel
          </button>
          {err && (
            <p className="basis-full text-xs text-danger" role="alert">
              {err}
            </p>
          )}
        </form>
      )}
    </section>
  );
}

/** Owner/admin: buyers who earned points but have not registered yet, with a WhatsApp invite. */
function PendingPoints() {
  const admin = useAdmin();
  const [rows, setRows] = useState<PendingReward[] | null>(null);
  useEffect(() => {
    if (!canManage(admin)) return;
    api<{ rows: PendingReward[] }>("/api/admin/loyalty/pending")
      .then((r) => setRows(r.rows))
      .catch(() => undefined);
  }, [admin]);
  if (!rows || rows.length === 0) return null;
  return (
    <details className="mt-3 rounded-2xl border border-line bg-card p-3 text-sm" data-testid="pending-points">
      <summary className="cursor-pointer font-semibold max-lg:min-h-11 max-lg:content-center">
        Points waiting to be claimed ({rows.length} {rows.length === 1 ? "buyer" : "buyers"} without an account)
      </summary>
      <p className="mt-1 text-xs text-muted">They receive these points automatically when they register with this mobile number.</p>
      <ul className="mt-2 divide-y divide-line/70">
        {rows.map((r) => (
          <li key={r.mobile} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
            <span className="min-w-0 flex-1 truncate">
              {r.name ?? "Customer"} <span className="num text-muted">· {formatMobile(r.mobile)}</span>
            </span>
            <span className="num font-semibold">{r.points.toLocaleString("en-IN")} pts</span>
            <span className="text-xs text-muted">since {dt(r.since)}</span>
            <a
              className="btn-ghost btn-sm max-lg:tap"
              target="_blank"
              rel="noopener"
              href={`https://wa.me/${r.mobile}?text=${encodeURIComponent(`Hello${r.name ? " " + r.name : ""}, you have ${r.points} VERDI SOLARR SOLUTION reward points waiting. Create your free account at ${location.origin}/account?mode=register with this mobile number to receive them.`)}`}
            >
              <WhatsAppIcon className="size-3.5" /> Invite
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
