import { Check, ChevronRight, ListChecks, Minus, Percent, Plus, Wallet, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { basisPointsToPercent, PAYOUT_METHODS, percentToBasisPoints, type BonusEntry, type BonusOverview, type BonusPayout, type BonusStaffSummary } from "../../../shared/bonus";
import { formatPaise } from "../../../shared/money";
import { rupeesToPaise } from "../../../shared/schemas";
import { BottomSheet, MobileTabs, useIsPhone } from "../../components/mobile/kit";
import { usePaged } from "../../components/Pager";
import { Modal, Spinner, useToast } from "../../components/ui";
import { api } from "../../lib/api";
import { usePageMeta } from "../../lib/seo";
import { useAdmin } from "./AdminLayout";
import { useRefreshOnReturn } from "../../lib/refresh";
import { canManage, dt, errorText, PageHead, send, ExportButton } from "./kit";

/* Staff bonus: owner/admin set rates, approve, adjust and pay (settling the unpaid balance so nothing is
 * paid twice); every staff member sees their own bonus under "My bonus". */

const today = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const money = (p: number) => <span className={`num ${p < 0 ? "text-danger" : ""}`}>{formatPaise(p)}</span>;
const KIND: Record<BonusEntry["kind"], string> = {
  sale: "Sale",
  reversal: "Reversed",
  adjustment: "Adjustment",
};
const STATUS_STYLE: Record<BonusEntry["status"], string> = {
  pending: "bg-sun-100 text-sun-600",
  approved: "bg-sky-100 text-sky-600",
  paid: "bg-verdi-50 text-verdi-700",
};

/** Bottom sheet on phones, dialog on desktop. */
function Panel({ open, onClose, title, children, footer, testId }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; testId?: string }) {
  const phone = useIsPhone();
  return phone ? (
    <BottomSheet open={open} onClose={onClose} title={title} footer={footer} testId={testId}>
      {children}
    </BottomSheet>
  ) : (
    <Modal open={open} onClose={onClose} title={title} size="lg" footer={footer}>
      <div className="p-5" data-testid={testId}>
        {children}
      </div>
    </Modal>
  );
}

function EntryRow({ e, showStaff, selectable, checked, onCheck }: { e: BonusEntry; showStaff?: boolean; selectable?: boolean; checked?: boolean; onCheck?: (v: boolean) => void }) {
  return (
    <li className="flex items-start gap-3 py-2.5" data-testid="bonus-entry">
      {selectable && <input type="checkbox" className="mt-1 size-5 shrink-0 accent-verdi-600" checked={checked} onChange={(x) => onCheck?.(x.target.checked)} aria-label={`Select bonus ${e.id}`} />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {e.kind === "adjustment" ? e.reason : (e.customer ?? "—")}
          {e.enquiryRef && <span className="num ml-1.5 text-xs font-normal text-muted">{e.enquiryRef}</span>}
        </p>
        <p className="truncate text-xs text-muted">
          {showStaff && `${e.staffName} · `}
          {KIND[e.kind]}
          {e.salePaise != null && e.kind === "sale" && (
            <>
              {" "}
              · {basisPointsToPercent(e.rateBasisPoints)}% of {formatPaise(e.salePaise)}
            </>
          )}
          {e.kind === "reversal" && e.reason ? ` · ${e.reason}` : ""} · {dt(e.createdAt)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold">{money(e.amountPaise)}</p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[e.status]}`}>{e.status === "pending" ? "Pending" : e.status === "approved" ? "Approved" : "Paid"}</span>
      </div>
    </li>
  );
}

function PayoutRow({ p, onCancel }: { p: BonusPayout; onCancel?: () => void }) {
  return (
    <li className={`flex items-start gap-3 py-2.5 ${p.status === "cancelled" ? "opacity-60" : ""}`} data-testid="bonus-payout">
      <Wallet className="mt-0.5 size-4 shrink-0 text-verdi-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium max-lg:truncate">
          {p.staffName} ·{" "}
          {new Date(`${p.paidOn}T00:00:00`).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
        <p className="truncate text-xs text-muted">
          {[p.method, p.reference, `${p.entryCount} bonus${p.entryCount === 1 ? "" : "es"}`, `by ${p.paidBy}`].filter(Boolean).join(" · ")}
          {p.status === "cancelled" && ` · cancelled: ${p.cancelReason}`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-sm font-semibold ${p.status === "cancelled" ? "line-through" : ""}`}>{money(p.amountPaise)}</p>
        {onCancel && p.status === "paid" && (
          <button type="button" className="text-xs text-danger underline max-lg:tap" onClick={onCancel}>
            Cancel payment
          </button>
        )}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------------------------- owner/admin
export default function Bonus() {
  usePageMeta("Staff bonus", undefined, { noindex: true });
  const admin = useAdmin();
  const toast = useToast();
  const [ov, setOv] = useState<BonusOverview | null>(null);
  const [list, setList] = useState<{
    entries: BonusEntry[];
    payouts: BonusPayout[];
  } | null>(null);
  const [staffF, setStaffF] = useState<number | null>(null);
  const [statusF, setStatusF] = useState<"unpaid" | "pending" | "approved" | "paid" | "">("unpaid");
  const [error, setError] = useState<string | null>(null);
  const [rateFor, setRateFor] = useState<BonusStaffSummary | "default" | null>(null);
  const [payFor, setPayFor] = useState<BonusStaffSummary | null>(null);
  const [adjust, setAdjust] = useState(false);
  const [cancelP, setCancelP] = useState<BonusPayout | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState("staff");
  const [sheetFor, setSheetFor] = useState<BonusStaffSummary | null>(null);

  const manager = canManage(admin);
  const load = useCallback(() => {
    if (!manager) return; // staff see "My bonus" below; the owner view is not theirs to load
    const sp = new URLSearchParams();
    if (staffF) sp.set("staff", String(staffF));
    if (statusF === "unpaid") sp.set("unpaid", "1");
    else if (statusF) sp.set("status", statusF);
    Promise.all([api<BonusOverview>("/api/admin/bonus"), api<{ entries: BonusEntry[]; payouts: BonusPayout[] }>(`/api/admin/bonus/entries?${sp}`)])
      .then(([o, l]) => {
        setOv(o);
        setList(l);
        setPicked(new Set());
      })
      .catch((e) => setError(errorText(e)));
  }, [staffF, statusF, manager]);
  useEffect(load, [load]);
  useRefreshOnReturn(load);

  const entries = usePaged(list?.entries ?? [], "bonus.entries");
  const payouts = usePaged(list?.payouts ?? [], "bonus.payouts", 5);
  if (!canManage(admin)) return <MyBonusPage />;

  const approvePicked = async (ids: number[]) => {
    if (!ids.length) return;
    try {
      const r = await send<{ approved: number }>("/api/admin/bonus/approve", "POST", { entryIds: ids });
      toast(`Approved ${r.approved} bonus${r.approved === 1 ? "" : "es"}.`, "success");
      load();
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  const pendingPicked = (list?.entries ?? []).filter((e) => picked.has(e.id) && e.status === "pending").map((e) => e.id);

  return (
    <div className="container-x py-10 max-lg:pt-3 max-lg:pb-24">
      <PageHead
        title="Staff bonus"
        intro="Bonus = the staff member's % of each sale they win. Created automatically when an enquiry is marked won; approve it, then pay it with the salary. Paying settles the balance, so nothing can be paid twice."
        actions={
          <>
            <ExportButton
              name="Staff bonus"
              build={async () => {
                const all = await api<{
                  entries: BonusEntry[];
                  payouts: BonusPayout[];
                }>("/api/admin/bonus/entries");
                return [
                  {
                    name: "Balances",
                    columns: [
                      { header: "Staff member" },
                      { header: "Rate %", type: "number" },
                      { header: "Waiting approval (₹)", type: "money" },
                      { header: "Approved (₹)", type: "money" },
                      { header: "Unpaid total (₹)", type: "money" },
                      { header: "Paid so far (₹)", type: "money" },
                    ],
                    rows: (ov?.staff ?? []).map((x) => [x.name, x.effectiveBasisPoints / 100, x.pendingPaise / 100, x.approvedPaise / 100, x.unpaidPaise / 100, x.paidPaise / 100]),
                  },
                  ...bonusSheets(all.entries, all.payouts),
                ];
              }}
            />
            <button type="button" className="btn-ghost btn-sm max-lg:tap" onClick={() => setAdjust(true)} data-testid="bonus-adjust-open">
              <Plus className="size-4" /> Adjustment
            </button>
          </>
        }
      />
      {error && <p className="mt-4 rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
      {!ov ? (
        <div className="mt-10 flex justify-center">
          <Spinner />
        </div>
      ) : (
        <>
          <MobileTabs
            active={tab}
            onChange={setTab}
            className="-mx-4 mt-4"
            testId="bonus-tabs"
            tabs={[
              {
                id: "staff",
                label: "Staff",
                dot: ov.staff.some((x) => x.unpaidPaise > 0),
                panel: (
                  <>
                    <div className="card mt-5 flex flex-wrap items-center justify-between gap-3 p-4 max-lg:mt-3 max-lg:flex-nowrap max-lg:p-3" data-testid="default-rate">
                      <p className="text-sm max-lg:text-xs">
                        Default bonus for everyone: <b className="num text-lg max-lg:text-base">{ov.defaultBasisPoints == null ? "not set" : `${basisPointsToPercent(ov.defaultBasisPoints)}%`}</b> of the sale amount
                      </p>
                      <button type="button" className="btn-ghost btn-sm max-lg:tap max-lg:shrink-0" onClick={() => setRateFor("default")} data-testid="edit-default-rate">
                        Change
                      </button>
                    </div>

                    <ul className="mt-4 grid gap-3 max-lg:mt-3 max-lg:gap-2 md:grid-cols-2 xl:grid-cols-3" data-testid="bonus-staff">
                      {ov.staff.map((s) => (
                        <li key={s.staffId} className="card p-4 max-lg:relative max-lg:px-3.5 max-lg:py-3">
                          <div className="flex items-start justify-between gap-2 max-lg:items-center">
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{s.name}</p>
                              <p className="truncate text-xs text-muted lg:hidden">
                              {basisPointsToPercent(s.effectiveBasisPoints)}% bonus
                                {s.pendingPaise > 0 ? ` · ${formatPaise(s.pendingPaise)} to approve` : ""}
                              </p>
                              <button type="button" className="text-xs text-verdi-700 underline max-lg:hidden" onClick={() => setRateFor(s)}>
                                {s.rateBasisPoints == null ? `Default rate (${basisPointsToPercent(s.effectiveBasisPoints)}%)` : `Own rate ${basisPointsToPercent(s.rateBasisPoints)}%`} · change
                              </button>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <div className="text-right">
                                <p className="text-[11px] text-muted">Unpaid</p>
                                <p className={`num text-xl font-semibold max-lg:text-base ${s.unpaidPaise <= 0 ? "max-lg:text-muted" : ""}`} data-testid="unpaid-amount">
                                  {formatPaise(s.unpaidPaise)}
                                </p>
                              </div>
                              <ChevronRight className="size-4 text-subtle lg:hidden" aria-hidden="true" />
                            </div>
                          </div>
                          <p className="num mt-2 text-xs text-muted max-lg:hidden">
                            Pending {formatPaise(s.pendingPaise)} · approved {formatPaise(s.approvedPaise)} · paid so far {formatPaise(s.paidPaise)}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2 max-lg:hidden">
                            <button type="button" className="btn-primary btn-sm max-lg:tap" disabled={s.unpaidPaise <= 0} onClick={() => setPayFor(s)} data-testid="pay-bonus">
                              <Wallet className="size-4" /> Pay bonus
                            </button>
                            <button type="button" className="btn-ghost btn-sm max-lg:tap" onClick={() => setStaffF(staffF === s.staffId ? null : s.staffId)}>
                              {staffF === s.staffId ? "Show everyone" : "Details"}
                            </button>
                          </div>
                          <button
                            type="button"
                            className="absolute inset-0 rounded-[inherit] lg:hidden"
                            aria-label={`${s.name}: unpaid ${formatPaise(s.unpaidPaise)}. Open`}
                            onClick={() => setSheetFor(s)}
                            data-testid="bonus-staff-open"
                          />
                        </li>
                      ))}
                    </ul>
                  </>
                ),
              },
              {
                id: "bonuses",
                label: `Bonuses${list ? ` (${list.entries.length})` : ""}`,
                panel: (
                  <section className="card mt-5 p-4 max-lg:mt-3 sm:p-5" aria-labelledby="be-h">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 id="be-h" className="font-semibold">
                        Bonuses {staffF ? `· ${ov.staff.find((s) => s.staffId === staffF)?.name ?? ""}` : ""}
                      </h2>
                      {staffF && (
                        <button type="button" className="chip chip-on tap gap-1 lg:hidden" onClick={() => setStaffF(null)}>
                          Everyone <X className="size-3.5" />
                        </button>
                      )}
                      {pendingPicked.length > 0 && (
                        <button type="button" className="btn-primary btn-sm max-lg:tap" onClick={() => void approvePicked(pendingPicked)} data-testid="approve-selected">
                          <Check className="size-4" /> Approve {pendingPicked.length}
                        </button>
                      )}
                    </div>
                    <div className="scrollbar-none -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Show">
                      {(
                        [
                          ["unpaid", "Unpaid"],
                          ["pending", "Pending"],
                          ["approved", "Approved"],
                          ["paid", "Paid"],
                          ["", "All"],
                        ] as const
                      ).map(([k, l]) => (
                        <button key={k} type="button" className={`chip shrink-0 max-lg:tap ${statusF === k ? "chip-on" : ""}`} onClick={() => setStatusF(k)}>
                          {l}
                        </button>
                      ))}
                    </div>
                    {!list ? (
                      <Spinner className="mt-4 size-5" />
                    ) : list.entries.length === 0 ? (
                      <p className="mt-4 text-sm text-muted">No bonuses here.</p>
                    ) : (
                      <>
                        <ul className="mt-2 divide-y divide-line/70">
                          {entries.items.map((e) => (
                            <EntryRow
                              key={e.id}
                              e={e}
                              showStaff={!staffF}
                              selectable={e.status === "pending"}
                              checked={picked.has(e.id)}
                              onCheck={(v) =>
                                setPicked((s) => {
                                  const n = new Set(s);
                                  if (v) n.add(e.id);
                                  else n.delete(e.id);
                                  return n;
                                })
                              }
                            />
                          ))}
                        </ul>
                        {entries.pager}
                      </>
                    )}
                  </section>
                ),
              },
              {
                id: "payments",
                label: "Payments",
                panel: (
                  <section className="card mt-5 p-4 max-lg:mt-3 sm:p-5" aria-labelledby="bp-h">
                    <h2 id="bp-h" className="font-semibold">
                      Payments
                    </h2>
                    {!list || list.payouts.length === 0 ? (
                      <p className="mt-3 text-sm text-muted">No bonus payments yet.</p>
                    ) : (
                      <>
                        <ul className="mt-2 divide-y divide-line/70">
                          {payouts.items.map((p) => (
                            <PayoutRow key={p.id} p={p} onCancel={() => setCancelP(p)} />
                          ))}
                        </ul>
                        {payouts.pager}
                      </>
                    )}
                  </section>
                ),
              },
            ]}
          />

          {sheetFor && (
            <StaffSheet
              s={sheetFor}
              onClose={() => setSheetFor(null)}
              onPay={() => (setSheetFor(null), setPayFor(sheetFor))}
              onRate={() => (setSheetFor(null), setRateFor(sheetFor))}
              onList={() => (setSheetFor(null), setStaffF(sheetFor.staffId), setTab("bonuses"), window.scrollTo({ top: 0 }))}
            />
          )}
          <RatePanel target={rateFor} defaultBp={ov.defaultBasisPoints} onClose={() => setRateFor(null)} onSaved={load} />
          {payFor && <PayPanel staff={payFor} onClose={() => setPayFor(null)} onDone={load} />}
          <AdjustPanel open={adjust} staff={ov.staff} onClose={() => setAdjust(false)} onSaved={load} />
          <CancelPanel payout={cancelP} onClose={() => setCancelP(null)} onDone={load} />
        </>
      )}
    </div>
  );
}

/** Phones: one staff member's bonus at a glance, with the actions in reach of the thumb. */
function StaffSheet({ s, onClose, onPay, onRate, onList }: { s: BonusStaffSummary; onClose: () => void; onPay: () => void; onRate: () => void; onList: () => void }) {
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={s.name}
      testId="bonus-staff-sheet"
      footer={
        <button type="button" className="btn-primary tap w-full" disabled={s.unpaidPaise <= 0} onClick={onPay}>
          <Wallet className="size-4" /> {s.unpaidPaise > 0 ? `Pay ${formatPaise(s.unpaidPaise)}` : "Nothing to pay"}
        </button>
      }
    >
      <div className="rounded-2xl bg-verdi-50 p-4 text-center">
        <p className="text-xs text-muted">Unpaid bonus</p>
        <p className="num mt-0.5 text-3xl font-semibold">{formatPaise(s.unpaidPaise)}</p>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {(
          [
            ["To approve", s.pendingPaise],
            ["Approved", s.approvedPaise],
            ["Paid so far", s.paidPaise],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="min-w-0 rounded-xl border border-line p-2">
            <dt className="text-[11px] text-muted">{k}</dt>
            <dd className="num mt-0.5 text-sm font-semibold [overflow-wrap:anywhere]">{formatPaise(v)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 divide-y divide-line/70 rounded-2xl border border-line">
        <button type="button" className="tap flex w-full items-center gap-3 px-3 text-left" onClick={onRate}>
          <Percent className="size-4 shrink-0 text-verdi-600" />
          <span className="min-w-0 flex-1 text-sm">
            Bonus rate <b className="num">{basisPointsToPercent(s.effectiveBasisPoints)}%</b>
            <span className="text-muted">{s.rateBasisPoints == null ? " · default" : " · own rate"}</span>
          </span>
          <span className="text-sm font-semibold text-verdi-700">Change</span>
        </button>
        <button type="button" className="tap flex w-full items-center gap-3 px-3 text-left" onClick={onList}>
          <ListChecks className="size-4 shrink-0 text-verdi-600" />
          <span className="min-w-0 flex-1 text-sm">See their bonuses</span>
          <ChevronRight className="size-4 text-subtle" />
        </button>
      </div>
    </BottomSheet>
  );
}

function RatePanel({ target, defaultBp, onClose, onSaved }: { target: BonusStaffSummary | "default" | null; defaultBp: number | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isDefault = target === "default";
  const [v, setV] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setErr(null);
    setV(target === "default" ? basisPointsToPercent(defaultBp) : target ? basisPointsToPercent(target.rateBasisPoints) : "");
  }, [target, defaultBp]);
  const save = async (useDefault = false) => {
    const bp = useDefault ? null : percentToBasisPoints(v);
    if (!useDefault && (bp === null || Number.isNaN(bp))) return setErr("Enter a percentage between 0 and 100, e.g. 2 or 2.5");
    try {
      await send("/api/admin/bonus/rates", "PUT", {
        staffId: isDefault ? null : (target as BonusStaffSummary).staffId,
        rateBasisPoints: bp,
      });
      toast("Bonus rate saved. It applies to sales won from now on.", "success");
      onSaved();
      onClose();
    } catch (e) {
      setErr(errorText(e));
    }
  };
  return (
    <Panel
      open={!!target}
      onClose={onClose}
      title={isDefault ? "Default bonus rate" : `Bonus rate · ${(target as BonusStaffSummary | null)?.name ?? ""}`}
      testId="rate-panel"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {!isDefault && (
            <button type="button" className="btn-ghost tap lg:min-h-0" onClick={() => void save(true)}>
              Use default
            </button>
          )}
          <button type="button" className="btn-primary tap lg:min-h-0" onClick={() => void save()} data-testid="save-rate">
            Save
          </button>
        </div>
      }
    >
      <label htmlFor="rate-in" className="label">
        Bonus % of the sale amount
      </label>
      <div className="relative max-w-40">
        <input id="rate-in" className="field num pr-8" inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="e.g. 2" data-testid="rate-input" />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted">%</span>
      </div>
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
      <p className="mt-3 text-xs text-muted">The rate is locked into each bonus when the sale is won, so changing it never alters bonuses already earned.</p>
    </Panel>
  );
}

function PayPanel({ staff, onClose, onDone }: { staff: BonusStaffSummary; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [entries, setEntries] = useState<BonusEntry[] | null>(null);
  const [upTo, setUpTo] = useState(today());
  const [off, setOff] = useState<Set<number>>(new Set());
  const [paidOn, setPaidOn] = useState(today());
  const [method, setMethod] = useState<string>(PAYOUT_METHODS[0]);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reload = useCallback(() => {
    api<{ entries: BonusEntry[] }>(`/api/admin/bonus/entries?staff=${staff.staffId}&unpaid=1`)
      .then((r) => setEntries(r.entries))
      .catch((e) => setErr(errorText(e)));
  }, [staff.staffId]);
  useEffect(reload, [reload]);
  const inRange = useMemo(() => (entries ?? []).filter((e) => new Date(new Date(e.createdAt).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10) <= upTo), [entries, upTo]);
  const chosen = inRange.filter((e) => !off.has(e.id));
  const total = chosen.reduce((a, e) => a + e.amountPaise, 0);
  const pending = chosen.filter((e) => e.status === "pending").length;

  const pay = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await send<{ payout: BonusPayout }>("/api/admin/bonus/payouts", "POST", {
        staffId: staff.staffId,
        entryIds: chosen.map((e) => e.id),
        expectedPaise: total,
        paidOn,
        method,
        reference,
        note,
      });
      toast(`Paid ${formatPaise(r.payout.amountPaise)} to ${staff.name}. Their unpaid bonus is settled.`, "success");
      onDone();
      onClose();
    } catch (e) {
      setErr(errorText(e));
      reload(); // show what is really unpaid now
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      open
      onClose={onClose}
      title={`Pay bonus · ${staff.name}`}
      testId="pay-panel"
      footer={
        <div className="grid gap-2">
          {err && <p className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{err}</p>}
          <button type="button" className="btn-primary tap w-full" disabled={busy || chosen.length === 0 || total <= 0} onClick={() => void pay()} data-testid="confirm-pay">
            {busy ? <Spinner className="size-4" /> : <Wallet className="size-4" />} Pay {formatPaise(total)}
            {pending > 0 ? ` (approves ${pending})` : ""}
          </button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-3">
          <label className="grid text-xs text-muted">
            Bonuses up to
            <input type="date" className="field !py-2" value={upTo} max={today()} onChange={(e) => setUpTo(e.target.value || today())} />
          </label>
          <label className="grid text-xs text-muted">
            Paid on
            <input type="date" className="field !py-2" value={paidOn} onChange={(e) => setPaidOn(e.target.value || today())} data-testid="paid-on" />
          </label>
        </div>
        {!entries ? (
          <Spinner className="size-5" />
        ) : inRange.length === 0 ? (
          <p className="text-sm text-muted">Nothing unpaid up to this date.</p>
        ) : (
          <ul className="divide-y divide-line/70 rounded-2xl border border-line px-3" data-testid="pay-entries">
            {inRange.map((e) => (
              <EntryRow
                key={e.id}
                e={e}
                selectable
                checked={!off.has(e.id)}
                onCheck={(v) =>
                  setOff((s) => {
                    const n = new Set(s);
                    if (v) n.delete(e.id);
                    else n.add(e.id);
                    return n;
                  })
                }
              />
            ))}
          </ul>
        )}
        <fieldset>
          <legend className="label">How it was paid</legend>
          <div className="flex flex-wrap gap-2">
            {PAYOUT_METHODS.map((m) => (
              <button key={m} type="button" aria-pressed={method === m} className={`chip max-lg:tap ${method === m ? "chip-on" : ""}`} onClick={() => setMethod(m)}>
                {m}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="field" placeholder="Reference (e.g. Nov salary, UTR no.)" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} aria-label="Payment reference" />
          <input className="field" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} aria-label="Note" />
        </div>
        <p className="num rounded-xl bg-paper-2 p-3 text-sm">
          {chosen.length} bonus{chosen.length === 1 ? "" : "es"} · total <b>{formatPaise(total)}</b>. After paying, {staff.name}'s unpaid bonus for these becomes ₹0.
        </p>
      </div>
    </Panel>
  );
}

function AdjustPanel({ open, staff, onClose, onSaved }: { open: boolean; staff: BonusStaffSummary[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [who, setWho] = useState<number | "">("");
  const [sign, setSign] = useState<1 | -1>(1);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (busy) return; // a double tap must not add the adjustment twice
    const p = rupeesToPaise(amount);
    if (!who) return setErr("Choose the staff member");
    if (p === null || Number.isNaN(p) || p <= 0) return setErr("Enter the amount, e.g. 500");
    if (reason.trim().length < 3) return setErr("Say why (the staff member sees this)");
    setBusy(true);
    try {
      await send("/api/admin/bonus/adjustments", "POST", {
        staffId: who,
        amountPaise: sign * p,
        reason: reason.trim(),
      });
      toast("Adjustment added.", "success");
      setAmount("");
      setReason("");
      setErr(null);
      onSaved();
      onClose();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel
      open={open}
      onClose={onClose}
      title="Bonus adjustment"
      testId="adjust-panel"
      footer={
        <button type="button" className="btn-primary tap w-full" onClick={() => void save()} disabled={busy} data-testid="save-adjustment">
          Add adjustment
        </button>
      }
    >
      <div className="grid gap-3">
        <select className="field" value={who} onChange={(e) => setWho(e.target.value ? Number(e.target.value) : "")} aria-label="Staff member">
          <option value="">Choose staff member</option>
          {staff.map((s) => (
            <option key={s.staffId} value={s.staffId}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <div className="flex rounded-full border border-line bg-card p-0.5" role="radiogroup" aria-label="Add or deduct">
            <button type="button" role="radio" aria-checked={sign === 1} className={`tap grid place-items-center rounded-full px-3 ${sign === 1 ? "bg-ink text-paper" : "text-muted"}`} onClick={() => setSign(1)}>
              <Plus className="size-4" />
            </button>
            <button type="button" role="radio" aria-checked={sign === -1} className={`tap grid place-items-center rounded-full px-3 ${sign === -1 ? "bg-ink text-paper" : "text-muted"}`} onClick={() => setSign(-1)}>
              <Minus className="size-4" />
            </button>
          </div>
          <input className="field num" inputMode="decimal" placeholder="Amount (₹)" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount in rupees" data-testid="adjust-amount" />
        </div>
        <input className="field" placeholder="Reason, e.g. Festival bonus / correction" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} aria-label="Reason" data-testid="adjust-reason" />
        {err && <p className="text-xs text-danger">{err}</p>}
      </div>
    </Panel>
  );
}

function CancelPanel({ payout, onClose, onDone }: { payout: BonusPayout | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    if (reason.trim().length < 3) return setErr("Say why this payment is cancelled");
    setBusy(true);
    try {
      await send(`/api/admin/bonus/payouts/${payout!.id}/cancel`, "POST", {
        reason: reason.trim(),
      });
      toast("Payment cancelled. Its bonuses are unpaid again.", "success");
      setReason("");
      onDone();
      onClose();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel
      open={!!payout}
      onClose={onClose}
      title="Cancel this payment?"
      footer={
        <button type="button" className="btn-primary tap w-full !bg-danger" onClick={() => void go()} disabled={busy}>
          Cancel payment of {payout ? formatPaise(payout.amountPaise) : ""}
        </button>
      }
    >
      <p className="text-sm text-muted">Only if it was recorded by mistake. Its bonuses become unpaid again; the cancelled payment stays in the history.</p>
      <input className="field mt-3" placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} aria-label="Reason" />
      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
    </Panel>
  );
}

// ---------------------------------------------------------------------------------------------- staff: my bonus
export function MyBonusPage() {
  usePageMeta("My bonus", undefined, { noindex: true });
  const [list, setList] = useState<{
    entries: BonusEntry[];
    payouts: BonusPayout[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ entries: BonusEntry[]; payouts: BonusPayout[] }>("/api/admin/bonus/entries")
      .then(setList)
      .catch((e) => setError(errorText(e)));
  }, []);
  const entries = usePaged(list?.entries ?? [], "mybonus.entries");
  const payouts = usePaged(
    (list?.payouts ?? []).filter((p) => p.status === "paid"),
    "mybonus.payouts",
    5,
  );
  const sum = (f: (e: BonusEntry) => boolean) => (list?.entries ?? []).filter(f).reduce((a, e) => a + e.amountPaise, 0);
  return (
    <div className="container-x py-10 max-lg:pt-3">
      <PageHead
        title="My bonus"
        intro="Your bonus on the sales you have won. It is approved and paid by the owner, usually with your salary."
        actions={list && <ExportButton name="My bonus" build={() => bonusSheets(list.entries, list.payouts)} />}
      />
      {error && <p className="mt-4 rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
      {!list ? (
        <div className="mt-10 flex justify-center">
          <Spinner />
        </div>
      ) : (
        <>
          <dl className="mt-5 grid grid-cols-3 gap-2" data-testid="my-bonus-totals">
            {[
              ["Waiting for approval", sum((e) => e.status === "pending")],
              ["Approved, to be paid", sum((e) => e.status === "approved")],
              ["Paid so far", sum((e) => e.status === "paid")],
            ].map(([k, v]) => (
              <div key={k as string} className="card p-3 sm:p-4">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="num mt-1 truncate text-lg max-lg:text-base max-lg:whitespace-normal max-lg:[overflow-wrap:anywhere] sm:text-2xl">{formatPaise(v as number)}</dd>
              </div>
            ))}
          </dl>
          <section className="card mt-5 p-4 sm:p-5">
            <h2 className="font-semibold">Bonuses</h2>
            {list.entries.length === 0 ? (
              <p className="mt-3 text-sm text-muted">
                No bonuses yet. They appear here when an enquiry you are responsible for is marked won.{" "}
                <Link to="/admin/enquiries?owner=me" className="text-verdi-700 underline">
                  My enquiries
                </Link>
              </p>
            ) : (
              <>
                <ul className="mt-2 divide-y divide-line/70">
                  {entries.items.map((e) => (
                    <EntryRow key={e.id} e={e} />
                  ))}
                </ul>
                {entries.pager}
              </>
            )}
          </section>
          <section className="card mt-5 p-4 sm:p-5">
            <h2 className="font-semibold">Payments received</h2>
            {payouts.items.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No payments yet.</p>
            ) : (
              <>
                <ul className="mt-2 divide-y divide-line/70">
                  {payouts.items.map((p) => (
                    <PayoutRow key={p.id} p={p} />
                  ))}
                </ul>
                {payouts.pager}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** Bonus lines and payments as spreadsheet tables. */
function bonusSheets(entries: BonusEntry[], payouts: BonusPayout[]) {
  return [
    {
      name: "Bonus lines",
      columns: [
        { header: "Date", type: "datetime" as const },
        { header: "Staff member" },
        { header: "Type" },
        { header: "Enquiry" },
        { header: "Customer" },
        { header: "Sale (₹)", type: "money" as const },
        { header: "Rate %", type: "number" as const },
        { header: "Bonus (₹)", type: "money" as const },
        { header: "Status" },
        { header: "Reason" },
      ],
      rows: entries.map((e) => [
        e.createdAt,
        e.staffName,
        e.kind === "sale" ? "Sale" : e.kind === "reversal" ? "Reversal" : "Adjustment",
        e.enquiryRef,
        e.customer,
        e.salePaise == null ? null : e.salePaise / 100,
        e.rateBasisPoints == null ? null : e.rateBasisPoints / 100,
        e.amountPaise / 100,
        e.status === "pending" ? "Waiting approval" : e.status === "approved" ? "Approved" : "Paid",
        e.reason,
      ]),
    },
    {
      name: "Payments",
      columns: [
        { header: "Paid on", type: "date" as const },
        { header: "Staff member" },
        { header: "Amount (₹)", type: "money" as const },
        { header: "Bonus lines", type: "number" as const },
        { header: "Method" },
        { header: "Reference" },
        { header: "Note" },
        { header: "Status" },
        { header: "Paid by" },
      ],
      rows: payouts.map((p) => [p.paidOn, p.staffName, p.amountPaise / 100, p.entryCount, p.method, p.reference, p.note, p.status === "paid" ? "Paid" : `Cancelled: ${p.cancelReason ?? ""}`, p.paidBy]),
    },
  ];
}
