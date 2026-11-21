import { ArrowRight, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { EnquiryStats } from "../../../shared/types";
import { Accordion } from "../../components/mobile/kit";
import { Spinner } from "../../components/ui";
import { api, ApiError } from "../../lib/api";
import { usePageMeta } from "../../lib/seo";
import { PageHead } from "./kit";
import { usePaged } from "../../components/Pager";

type Period = EnquiryStats["period"];
const PERIODS: [Period, string][] = [
  ["day", "Daily"],
  ["month", "Monthly"],
  ["year", "Yearly"],
];

const label = (bucket: string, period: Period) => {
  if (period === "year") return bucket;
  if (period === "month") return new Date(`${bucket}-01T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  return new Date(`${bucket}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

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

/** Owner / admin: how many enquiries each staff member logged per day, month or year, and how many were won. */
export default function Performance() {
  usePageMeta("Staff performance", undefined, { noindex: true });
  const [params, setParams] = useSearchParams();
  const period = (["day", "month", "year"] as const).find((p) => p === params.get("period")) ?? "day";
  const staffId = Number(params.get("staff") ?? 0) || null;
  const [data, setData] = useState<EnquiryStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams({ period });
    if (params.get("from")) sp.set("from", params.get("from")!);
    if (params.get("to")) sp.set("to", params.get("to")!);
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

  const series = useMemo(() => {
    if (!data) return [];
    const totals = new Map<string, { total: number; won: number }>();
    for (const b of data.buckets) {
      if (staffId && b.staffId !== staffId) continue;
      const t = totals.get(b.bucket) ?? { total: 0, won: 0 };
      t.total += b.total;
      t.won += b.won;
      totals.set(b.bucket, t);
    }
    return allBuckets(data.from, data.to, data.period).map((k) => ({ bucket: k, ...(totals.get(k) ?? { total: 0, won: 0 }) }));
  }, [data, staffId]);

  const table = usePaged(useMemo(() => [...series].reverse(), [series]), "performance.table");
  const staff = data?.staff ?? [];
  const shownStaff = staffId ? staff.filter((s) => s.id === staffId) : staff;
  const sum = shownStaff.reduce((a, s) => ({ total: a.total + s.total, quoted: a.quoted + s.quoted, won: a.won + s.won }), { total: 0, quoted: 0, won: 0 });
  const maxStaff = Math.max(1, ...staff.map((s) => s.total));
  const maxBar = Math.max(1, ...series.map((x) => x.total));

  return (
    <div className="container-x py-10 max-lg:pt-3">
      <PageHead title="Staff performance" intro="Enquiries your staff created by reaching out to customers (phone, WhatsApp, visits), with how many became quotations and orders. Website enquiries from customers are shown for comparison. India time." />

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
        <label className="grid min-w-40 flex-1 text-xs text-muted sm:flex-none">
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
      </div>

      {error && <p className="mt-6 rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}
      {!data && !error && (
        <div className="mt-10 flex justify-center">
          <Spinner />
        </div>
      )}

      {data && (
        <>
          <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="performance-totals">
            {[
              ["Staff outreach", sum.total],
              ["Quoted or won", sum.quoted],
              ["Won", sum.won],
              ["From customers (website)", data.websiteTotal],
            ].map(([k, v]) => (
              <div key={k} className="card p-3 sm:p-4">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="num mt-1 text-2xl">{v}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.3fr]">
            <section className="card p-4 sm:p-5" aria-labelledby="lb-h">
              <h2 id="lb-h" className="flex items-center gap-2 font-semibold">
                <Trophy className="size-4 text-sun-500" /> Enquiries logged per staff member
              </h2>
              {staff.length === 0 ? (
                <p className="mt-3 text-sm text-muted">No staff accounts yet.</p>
              ) : (
                <ol className="mt-3 grid gap-3" data-testid="leaderboard">
                  {staff.map((s, i) => (
                    <li key={s.id} className={staffId && staffId !== s.id ? "opacity-45" : ""}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <button type="button" className="min-w-0 truncate text-left font-medium hover:underline" onClick={() => set({ staff: staffId === s.id ? null : String(s.id) })}>
                          <span className="num mr-1.5 text-xs text-subtle">{i + 1}</span>
                          {s.name}
                        </button>
                        <span className="num shrink-0 text-xs text-muted">
                          <b className="text-sm text-ink">{s.total}</b> · {s.won} won{s.total ? ` (${Math.round((s.won / s.total) * 100)}%)` : ""}
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-paper-2" aria-hidden="true">
                        <div className="h-full rounded-full bg-verdi-500" style={{ width: `${(s.total / maxStaff) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="card min-w-0 p-4 sm:p-5" aria-labelledby="tr-h">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="tr-h" className="font-semibold">
                  {PERIODS.find(([p]) => p === period)![1]} enquiries {staffId ? `· ${staff.find((s) => s.id === staffId)?.name ?? ""}` : "· all staff"}
                </h2>
                <span className="num text-xs text-muted">max {maxBar}</span>
              </div>
              <div className="relative mt-4 flex h-40 items-end gap-[2px] border-b border-line" role="img" aria-label={`Bar chart of ${series.length} periods; see the table below for exact numbers`} data-testid="trend-chart">
                {series.map((x) => (
                  <div key={x.bucket} className="group relative flex h-full min-w-0 flex-1 items-end" tabIndex={0} aria-label={`${label(x.bucket, period)}: ${x.total} logged, ${x.won} won`}>
                    <div className={`w-full rounded-t-[4px] ${x.total ? "bg-verdi-500 group-hover:bg-verdi-700" : "bg-transparent"}`} style={{ height: `${(x.total / maxBar) * 100}%`, minHeight: x.total ? 3 : 0 }} />
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-[11px] whitespace-nowrap text-paper group-hover:block group-focus:block">
                      {label(x.bucket, period)} · {x.total} logged · {x.won} won
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
                      <th className="py-1 text-right font-medium">Logged</th>
                      <th className="py-1 text-right font-medium">Won</th>
                    </tr>
                  </thead>
                  <tbody>
                    {table.items.map((x) => (
                      <tr key={x.bucket} className="border-t border-line/60">
                        <td className="py-1.5">{label(x.bucket, period)}</td>
                        <td className="num py-1.5 text-right">{x.total}</td>
                        <td className="num py-1.5 text-right">{x.won}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {table.pager}
              </Accordion>
            </section>
          </div>

          <Link to={`/admin/enquiries?source=staff${staffId ? `&staff=${staffId}` : ""}`} className="mt-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-verdi-700 hover:underline">
            See these enquiries <ArrowRight className="size-4" />
          </Link>
        </>
      )}
    </div>
  );
}
