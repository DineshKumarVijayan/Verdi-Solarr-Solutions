import { ArrowRight, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { formatPaise } from "../../../shared/money";
import { CLOSED_REASON_LABEL, type EnquiryStats } from "../../../shared/types";
import { Accordion } from "../../components/mobile/kit";
import { usePaged } from "../../components/Pager";
import { Spinner } from "../../components/ui";
import { api, ApiError } from "../../lib/api";
import { usePageMeta } from "../../lib/seo";
import { PageHead, ExportButton } from "./kit";

type Period = EnquiryStats["period"];
type Metric = "total" | "won" | "salePaise";
const PERIODS: [Period, string][] = [
  ["day", "Daily"],
  ["month", "Monthly"],
  ["year", "Yearly"],
];
const METRICS: [Metric, string][] = [
  ["total", "Enquiries"],
  ["won", "Won"],
  ["salePaise", "Sales ₹"],
];
const SOURCES: [string, string][] = [
  ["", "All enquiries"],
  ["website", "From website"],
  ["staff", "Staff outreach"],
];

const label = (bucket: string, period: Period) => {
  if (period === "year") return bucket;
  if (period === "month") return new Date(`${bucket}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  return new Date(`${bucket}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const days = (d: number | null) => (d == null ? "—" : `${d} d`);
/** Whole rupees for compact figures (exact values are in the tables). */
const rupees = (p: number) => formatPaise(Math.round(p / 100) * 100).replace(/\.00$/, "");

/** Every day / month / year between from and to, so quiet periods show as zero instead of disappearing. */
function allBuckets(from: string, to: string, period: Period): string[] {
  const out: string[] = [];
  if (period === "year") {
    for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) out.push(String(y));
  } else if (period === "month") {
    let y = Number(from.slice(0, 4));
    let m = Number(from.slice(5, 7));
    const end = to.slice(0, 7);
    for (let i = 0; i < 240; i++) {
      const k = `${y}-${String(m).padStart(2, "0")}`;
      out.push(k);
      if (k >= end) break;
      m++;
      if (m > 12) (m = 1), y++;
    }
  } else {
    const d = new Date(`${from}T00:00:00Z`);
    for (let i = 0; i < 400 && d.toISOString().slice(0, 10) <= to; i++) {
      out.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
  }
  return out;
}

/**
 * Owner / admin: the sales pipeline per staff member — enquiries they are responsible for, how many reached
 * a quotation and a sale (with value), lost/cancelled with reasons, and how fast — by day, month or year.
 */
export default function Performance() {
  usePageMeta("Staff performance", undefined, { noindex: true });
  const [params, setParams] = useSearchParams();
  const period = (["day", "month", "year"] as const).find((p) => p === params.get("period")) ?? "day";
  const staffId = Number(params.get("staff") ?? 0) || null;
  const source = params.get("source") ?? "";
  const [metric, setMetric] = useState<Metric>("total");
  const [data, setData] = useState<EnquiryStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams({ period });
    for (const k of ["from", "to", "source"]) if (params.get(k)) sp.set(k, params.get(k)!);
    setError(null);
    api<EnquiryStats>(`/api/admin/enquiries/stats?${sp}`)
      .then(setData)
      .catch((e: ApiError) => setError(e.message));
  }, [period, params]);

  const set = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k);
        return n;
      },
      { replace: true },
    );

  const staff = data?.staff ?? [];
  const shown = staffId ? staff.filter((s) => s.id === staffId) : staff;
  const sum = shown.reduce(
    (a, s) => ({ total: a.total + s.total, quoted: a.quoted + s.quoted, won: a.won + s.won, lost: a.lost + s.lost, sale: a.sale + s.salePaise, overdue: a.overdue + s.overdue }),
    { total: 0, quoted: 0, won: 0, lost: 0, sale: 0, overdue: 0 },
  );

  const series = useMemo(() => {
    if (!data) return [];
    const totals = new Map<string, { total: number; won: number; salePaise: number }>();
    for (const b of data.buckets) {
      if (staffId && b.staffId !== staffId) continue;
      const t = totals.get(b.bucket) ?? { total: 0, won: 0, salePaise: 0 };
      t.total += b.total;
      t.won += b.won;
      t.salePaise += b.salePaise;
      totals.set(b.bucket, t);
    }
    return allBuckets(data.from, data.to, data.period).map((k) => ({ bucket: k, ...(totals.get(k) ?? { total: 0, won: 0, salePaise: 0 }) }));
  }, [data, staffId]);
  const table = usePaged(useMemo(() => [...series].reverse(), [series]), "performance.table");
  const maxBar = Math.max(1, ...series.map((x) => x[metric]));
  const fmtMetric = (v: number) => (metric === "salePaise" ? rupees(v) : String(v));

  const reasons = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data?.reasons ?? []) if (!staffId || r.staffId === staffId) m.set(r.reason, (m.get(r.reason) ?? 0) + r.count);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [data, staffId]);
  const maxReason = Math.max(1, ...reasons.map(([, n]) => n));

  return (
    <div className="container-x py-10 max-lg:pt-3">
      <PageHead
        actions={
          data && (
            <ExportButton
              name={`Staff performance ${data.from} to ${data.to}`}
              build={() => [
                {
                  name: "By staff",
                  columns: [{ header: "Staff member" }, { header: "Enquiries", type: "number" }, { header: "Contacted", type: "number" }, { header: "Quoted", type: "number" }, { header: "Won", type: "number" }, { header: "Not won", type: "number" }, { header: "Open", type: "number" }, { header: "Overdue follow-ups", type: "number" }, { header: "Win rate %", type: "number" }, { header: "Sales (₹)", type: "money" }, { header: "Avg days to quote", type: "number" }, { header: "Avg days to close", type: "number" }],
                  rows: data.staff.map((x) => [x.name, x.total, x.contacted, x.quoted, x.won, x.lost, x.open, x.overdue, x.total ? Math.round((x.won / x.total) * 1000) / 10 : null, x.salePaise / 100, x.avgDaysToQuote, x.avgDaysToClose]),
                },
                {
                  name: `By ${data.period}`,
                  columns: [{ header: data.period === "day" ? "Day" : data.period === "month" ? "Month" : "Year" }, { header: "Staff member" }, { header: "Enquiries", type: "number" }, { header: "Won", type: "number" }, { header: "Sales (₹)", type: "money" }],
                  rows: data.buckets.map((b) => [b.bucket, data.staff.find((x) => x.id === b.staffId)?.name ?? "Unassigned", b.total, b.won, b.salePaise / 100]),
                },
                {
                  name: "Not won reasons",
                  columns: [{ header: "Reason" }, { header: "Staff member" }, { header: "Enquiries", type: "number" }],
                  rows: data.reasons.map((r) => [CLOSED_REASON_LABEL[r.reason as keyof typeof CLOSED_REASON_LABEL] ?? r.reason, data.staff.find((x) => x.id === r.staffId)?.name ?? "Unassigned", r.count]),
                },
              ]}
            />
          )
        }
        title="Staff performance"
        intro="Enquiries each staff member is responsible for, from first contact to quotation and final sale, with reasons when an enquiry is not won (duplicates and wrong entries do not count for or against anyone), and overdue follow-ups. Counts enquiries created in the chosen dates (India time)." />

      {/* filters: one row above the charts */}
      <div className="mt-5 flex flex-wrap items-end gap-2" data-testid="performance-filters">
        <div className="flex rounded-full border border-line bg-card p-1" role="radiogroup" aria-label="Group by">
          {PERIODS.map(([p, l]) => (
            <button key={p} type="button" role="radio" aria-checked={period === p} className={`tap rounded-full px-3 text-sm font-medium lg:min-h-0 lg:py-1.5 ${period === p ? "bg-ink text-paper" : "text-muted"}`} onClick={() => set({ period: p === "day" ? null : p, from: null, to: null })}>
              {l}
            </button>
          ))}
        </div>
        <label className="grid text-xs text-muted">
          From
          <input type="date" className="field !py-2" value={data?.from ?? ""} max={data?.to} onChange={(e) => set({ from: e.target.value || null })} />
        </label>
        <label className="grid text-xs text-muted">
          To
          <input type="date" className="field !py-2" value={data?.to ?? ""} min={data?.from} onChange={(e) => set({ to: e.target.value || null })} />
        </label>
        <label className="grid min-w-36 flex-1 text-xs text-muted sm:flex-none">
          Staff member
          <select className="field !py-2" value={staffId ?? ""} onChange={(e) => set({ staff: e.target.value || null })} data-testid="staff-filter">
            <option value="">All staff</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-36 flex-1 text-xs text-muted sm:flex-none">
          Source
          <select className="field !py-2" value={source} onChange={(e) => set({ source: e.target.value || null })} data-testid="source-filter">
            {SOURCES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="mt-6 rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
      {!data && !error && (
        <div className="mt-10 flex justify-center">
          <Spinner />
        </div>
      )}

      {data && (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7" data-testid="performance-totals">
            {[
              ["Enquiries", String(sum.total)],
              ["Reached quotation", `${sum.quoted} · ${pct(sum.quoted, sum.total)}`],
              ["Won (sales)", `${sum.won} · ${pct(sum.won, sum.total)}`],
              ["Sales value", rupees(sum.sale)],
              ["Not won", String(sum.lost)],
              ["Overdue follow-ups", String(sum.overdue)],
              ["Unassigned", staffId ? "—" : String(data.unassigned)],
            ].map(([k, v]) => (
              <div key={k} className="card p-3 sm:p-4">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="num mt-1 truncate text-xl sm:text-2xl">{v}</dd>
              </div>
            ))}
          </dl>

          {/* per staff member: desktop table, phone cards */}
          <section className="card mt-5 p-4 sm:p-5" aria-labelledby="lb-h">
            <h2 id="lb-h" className="flex items-center gap-2 font-semibold">
              <Trophy className="size-4 text-sun-500" /> Pipeline per staff member
            </h2>
            {staff.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No staff accounts yet.</p>
            ) : (
              <>
                <div className="mt-3 overflow-x-auto max-md:hidden">
                  <table className="w-full text-sm" data-testid="leaderboard">
                    <thead className="text-left text-xs text-muted">
                      <tr className="border-b border-line">
                        {["Staff member", "Enquiries", "Contacted", "Quoted", "Won", "Not won", "Open", "Overdue", "Win rate", "Sales", "Days to quote", "Days to close"].map((h, i) => (
                          <th key={h} className={`py-2 pr-3 font-medium ${i ? "text-right" : ""}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {staff.map((s) => (
                        <tr key={s.id} className={`border-b border-line/60 last:border-0 ${staffId && staffId !== s.id ? "opacity-45" : ""}`}>
                          <td className="py-2 pr-3">
                            <button type="button" className="font-medium hover:underline" onClick={() => set({ staff: staffId === s.id ? null : String(s.id) })}>
                              {s.name}
                            </button>
                          </td>
                          {[s.total, s.contacted, s.quoted, s.won, s.lost, s.open, s.overdue].map((n, i) => (
                            <td key={i} className={`num py-2 pr-3 text-right ${i === 6 && n > 0 ? "font-semibold text-danger" : ""}`}>
                              {n}
                            </td>
                          ))}
                          <td className="num py-2 pr-3 text-right">{pct(s.won, s.total)}</td>
                          <td className="num py-2 pr-3 text-right">{rupees(s.salePaise)}</td>
                          <td className="num py-2 pr-3 text-right">{days(s.avgDaysToQuote)}</td>
                          <td className="num py-2 text-right">{days(s.avgDaysToClose)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ol className="mt-3 grid gap-2 md:hidden" data-testid="leaderboard-cards">
                  {staff.map((s) => (
                    <li key={s.id} className={`rounded-2xl border border-line p-3 ${staffId && staffId !== s.id ? "opacity-45" : ""}`}>
                      <div className="flex items-baseline justify-between gap-2">
                        <button type="button" className="tap -my-2 min-w-0 truncate text-left font-semibold" onClick={() => set({ staff: staffId === s.id ? null : String(s.id) })}>
                          {s.name}
                        </button>
                        <span className="num shrink-0 text-sm font-semibold">{rupees(s.salePaise)}</span>
                      </div>
                      {/* funnel: enquiries -> quoted -> won */}
                      <div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs" aria-label="Enquiries, quoted, won">
                        {(
                          [
                            ["Enquiries", s.total],
                            ["Quoted", s.quoted],
                            ["Won", s.won],
                          ] as const
                        ).map(([k, n]) => (
                          <div key={k} className="rounded-xl bg-paper-2/70 py-1.5">
                            <p className="num text-base text-ink">{n}</p>
                            <p className="text-muted">{k}</p>
                          </div>
                        ))}
                      </div>
                      <p className="num mt-2 text-xs text-muted">
                        Win rate {pct(s.won, s.total)} · not won {s.lost} · open {s.open} · <span className={s.overdue > 0 ? "font-semibold text-danger" : ""}>overdue {s.overdue}</span> · quote in {days(s.avgDaysToQuote)} · close in {days(s.avgDaysToClose)}
                      </p>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </section>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.3fr_1fr]">
            <section className="card min-w-0 p-4 sm:p-5" aria-labelledby="tr-h">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="tr-h" className="font-semibold">
                  {PERIODS.find(([p]) => p === period)![1]} {METRICS.find(([m]) => m === metric)![1].toLowerCase()} {staffId ? `· ${staff.find((s) => s.id === staffId)?.name ?? ""}` : "· all staff"}
                </h2>
                <div className="flex rounded-full border border-line bg-card p-0.5" role="radiogroup" aria-label="Show">
                  {METRICS.map(([m, l]) => (
                    <button key={m} type="button" role="radio" aria-checked={metric === m} className={`tap rounded-full px-2.5 text-xs font-medium lg:min-h-0 lg:py-1 ${metric === m ? "bg-ink text-paper" : "text-muted"}`} onClick={() => setMetric(m)}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <p className="num mt-1 text-xs text-muted">highest: {fmtMetric(maxBar)}</p>
              <div className="relative mt-3 flex h-40 items-end gap-[2px] border-b border-line" role="img" aria-label={`Bar chart of ${series.length} periods; see the table below for exact numbers`} data-testid="trend-chart">
                {series.map((x) => (
                  <div key={x.bucket} className="group relative flex h-full min-w-0 flex-1 items-end" tabIndex={0} aria-label={`${label(x.bucket, period)}: ${x.total} enquiries, ${x.won} won, ${rupees(x.salePaise)}`}>
                    <div className={`w-full rounded-t-[4px] ${x[metric] ? "bg-verdi-500 group-hover:bg-verdi-700" : "bg-transparent"}`} style={{ height: `${(x[metric] / maxBar) * 100}%`, minHeight: x[metric] ? 3 : 0 }} />
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-[11px] whitespace-nowrap text-paper group-hover:block group-focus:block">
                      {label(x.bucket, period)} · {x.total} enquiries · {x.won} won · {rupees(x.salePaise)}
                    </span>
                  </div>
                ))}
              </div>
              {series.length > 0 && (
                <div className="mt-1 flex justify-between text-[10px] text-subtle">
                  <span>{label(series[0].bucket, period)}</span>
                  {series.length > 2 && <span>{label(series[Math.floor(series.length / 2)].bucket, period)}</span>}
                  <span>{label(series[series.length - 1].bucket, period)}</span>
                </div>
              )}
              <Accordion title={<span className="text-sm">Show as a table</span>} className="mt-3">
                <table className="w-full text-sm" data-testid="trend-table">
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th className="py-1 font-medium">Period</th>
                      <th className="py-1 text-right font-medium">Enquiries</th>
                      <th className="py-1 text-right font-medium">Won</th>
                      <th className="py-1 text-right font-medium">Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.items.map((x) => (
                      <tr key={x.bucket} className="border-t border-line/60">
                        <td className="py-1.5">{label(x.bucket, period)}</td>
                        <td className="num py-1.5 text-right">{x.total}</td>
                        <td className="num py-1.5 text-right">{x.won}</td>
                        <td className="num py-1.5 text-right">{formatPaise(x.salePaise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {table.pager}
              </Accordion>
            </section>

            <section className="card p-4 sm:p-5" aria-labelledby="rs-h">
              <h2 id="rs-h" className="font-semibold">
                Why enquiries were not won
              </h2>
              {reasons.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No enquiries closed as Not won in this period.</p>
              ) : (
                <ol className="mt-3 grid gap-3" data-testid="lost-reasons">
                  {reasons.map(([r, n]) => (
                    <li key={r}>
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate">{CLOSED_REASON_LABEL[r as keyof typeof CLOSED_REASON_LABEL]}</span>
                        <span className="num shrink-0 font-semibold">{n}</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-paper-2" aria-hidden="true">
                        <div className="h-full rounded-full bg-verdi-500" style={{ width: `${(n / maxReason) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              <Link to="/admin/enquiries?status=lost" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-verdi-700 hover:underline">
                See Not won enquiries <ArrowRight className="size-4" />
              </Link>
            </section>
          </div>

          <Link to={`/admin/enquiries${staffId ? `?owner=${staffId}` : ""}`} className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-verdi-700 hover:underline">
            See these enquiries <ArrowRight className="size-4" />
          </Link>
        </>
      )}
    </div>
  );
}
