import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, FileText, Inbox, Phone, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { formatPaise } from "../../../shared/money";
import type { MyDay } from "../../../shared/types";
import { ADMIN_STATUS_LABEL } from "../../lib/enquiry-status";
import { WhatsAppMenu } from "./WhatsAppMenu";

const short = (ymd: string) => new Date(ymd + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const daysLate = (ymd: string, today: string) => Math.round((Date.parse(today) - Date.parse(ymd)) / 86400_000);
const greeting = () => {
  const h = new Date(Date.now() + 5.5 * 3600_000).getUTCHours(); // India time
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

/** One thing to do: an overdue or due follow-up, a new enquiry nobody has taken, or a quotation running out. */
type Task =
  | { kind: "late" | "today"; id: number; title: string; sub: string; ref: string; mobile: string; to: string }
  | { kind: "new"; id: number; title: string; sub: string; to: string }
  | { kind: "quote"; id: number; title: string; sub: string; mobile: string | null; to: string; quote: string; amount: string; until: string };

const TONE = {
  late: { dot: "bg-danger", chip: "bg-danger-bg text-danger", label: "Overdue" },
  today: { dot: "bg-sun-500", chip: "bg-sun-100 text-ink", label: "Due today" },
  new: { dot: "bg-sky-500", chip: "bg-sky-100 text-sky-800", label: "New" },
  quote: { dot: "bg-violet-500", chip: "bg-violet-100 text-violet-800", label: "Quote" },
} as const;

function tasksOf(day: MyDay): Task[] {
  const late = day.followUps.filter((f) => f.followUpOn < day.today);
  const due = day.followUps.filter((f) => f.followUpOn >= day.today);
  const enq = (f: MyDay["followUps"][number], kind: "late" | "today"): Task => ({
    kind,
    id: f.id,
    title: f.name,
    sub: kind === "late" ? `${daysLate(f.followUpOn, day.today)} day${daysLate(f.followUpOn, day.today) === 1 ? "" : "s"} overdue · ${ADMIN_STATUS_LABEL[f.status]}` : `Follow up today · ${ADMIN_STATUS_LABEL[f.status]}`,
    ref: f.reference,
    mobile: f.mobile,
    to: `/admin/enquiries?q=${encodeURIComponent(f.reference)}`,
  });
  return [
    ...late.map((f) => enq(f, "late")),
    ...due.map((f) => enq(f, "today")),
    ...day.unassigned.map((u): Task => ({ kind: "new", id: u.id, title: u.name, sub: `${u.source === "website" ? "Website" : "Staff"} enquiry · nobody has taken it`, to: `/admin/enquiries?q=${encodeURIComponent(u.reference)}` })),
    ...day.quotes.map(
      (q): Task => ({
        kind: "quote",
        id: q.id,
        title: q.customerName,
        sub: `${q.number} · ${formatPaise(q.totalPaise)} · ${q.validUntil < day.today ? "expired" : `valid until ${short(q.validUntil)}`}`,
        mobile: q.customerMobile,
        to: `/admin/quotations/${q.id}`,
        quote: q.number,
        amount: formatPaise(q.totalPaise),
        until: short(q.validUntil),
      }),
    ),
  ];
}

/** Progress ring: what the person has already done today against what is still waiting. */
function Ring({ done, left }: { done: number; left: number }) {
  const total = done + left;
  const pct = total ? done / total : 1;
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-16 shrink-0 place-items-center" role="img" aria-label={`${done} done today, ${left} still to do`}>
      <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-paper-3" />
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" strokeLinecap="round" className="stroke-verdi-600 transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <span className="num text-sm font-semibold">{done}</span>
    </div>
  );
}

function Counter({ n, label, tone, icon, to }: { n: number; label: string; tone: keyof typeof TONE; icon: ReactNode; to: string }) {
  return (
    <Link to={to} className={`flex min-h-16 items-center gap-2.5 rounded-2xl border p-3 transition hover:-translate-y-0.5 hover:shadow-sm motion-reduce:transform-none ${n ? "border-line bg-card" : "border-dashed border-line/80 bg-transparent opacity-70"}`} data-testid={`myday-count-${tone}`}>
      <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${TONE[tone].chip} [&>svg]:size-4.5`}>{icon}</span>
      <span className="min-w-0">
        <span className="num block text-xl leading-none font-semibold">{n}</span>
        <span className="mt-0.5 block text-xs leading-tight text-muted">{label}</span>
      </span>
    </Link>
  );
}

/** "My day": a short board of what needs this person today, with the single most urgent thing first. */
export function MyDayCard({ day, name, className = "" }: { day: MyDay; name: string | null; className?: string }) {
  const tasks = tasksOf(day);
  const [next, ...rest] = tasks;
  const late = tasks.filter((t) => t.kind === "late").length;
  const today = tasks.filter((t) => t.kind === "today").length;
  const left = late + today;
  const summary = tasks.length === 0 ? "You're all caught up." : `${tasks.length} thing${tasks.length === 1 ? "" : "s"} need${tasks.length === 1 ? "s" : ""} you today${late ? `, ${late} overdue` : ""}.`;
  return (
    <section className={`overflow-hidden rounded-3xl border border-line bg-gradient-to-br from-verdi-50 via-card to-sun-50/60 ${className}`} aria-labelledby="myday-h" data-testid="my-day">
      <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* left: greeting, progress and counters */}
        <div className="min-w-0">
          <div className="flex items-center gap-4">
            <Ring done={day.doneToday} left={left} />
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-verdi-700 uppercase">
                My day · {new Date(day.today + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
              </p>
              <h2 id="myday-h" className="truncate text-lg font-semibold sm:text-xl">
                {greeting()}
                {name ? `, ${name.split(" ")[0]}` : ""}
              </h2>
              <p className="text-sm text-muted" data-testid="myday-summary">
                {summary} {day.doneToday > 0 && <span className="whitespace-nowrap">{day.doneToday} update{day.doneToday === 1 ? "" : "s"} done.</span>}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Counter n={late} label="Overdue follow-ups" tone="late" icon={<AlertTriangle />} to="/admin/enquiries?owner=me&followup=overdue" />
            <Counter n={today} label="Follow up today" tone="today" icon={<CalendarClock />} to="/admin/enquiries?owner=me&followup=today" />
            <Counter n={day.unassigned.length} label="New, not taken" tone="new" icon={<Inbox />} to="/admin/enquiries?owner=none&status=new" />
            <Counter n={day.quotes.length} label="Quotes expiring" tone="quote" icon={<FileText />} to="/admin/quotations?owner=me&expiring=1" />
          </div>
          {day.noDate > 0 && (
            <Link to="/admin/enquiries?owner=me&followup=none" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-verdi-700 hover:underline" data-testid="my-day-nodate">
              <CalendarClock className="size-3.5" /> {day.noDate} open enquir{day.noDate === 1 ? "y has" : "ies have"} no follow-up date. Set one so nothing slips.
            </Link>
          )}
        </div>

        {/* right: the one thing to do next, then the rest */}
        <div className="min-w-0">
          {!next ? (
            <div className="grid h-full place-items-center rounded-2xl border border-dashed border-verdi-200 bg-card/70 p-6 text-center" data-testid="myday-clear">
              <div>
                <CheckCircle2 className="mx-auto size-8 text-verdi-600" />
                <p className="mt-2 font-semibold">Nothing waiting for you</p>
                <p className="mt-1 text-sm text-muted">Log a call you made, or set follow-up dates on your open enquiries.</p>
                <Link to="/admin/enquiries?log=1" className="btn-primary btn-sm mt-3 max-lg:tap">
                  Log an enquiry
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-line bg-card p-4 shadow-sm" data-testid="myday-next">
                <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted uppercase">
                  <Sparkles className="size-3.5 text-sun-500" /> Up next
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] normal-case ${TONE[next.kind].chip}`}>{TONE[next.kind].label}</span>
                </p>
                <p className="mt-2 truncate text-lg font-semibold">{next.title}</p>
                <p className="text-sm text-muted">{next.sub}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(next.kind === "late" || next.kind === "today") && (
                    <>
                      <a className="btn-primary btn-sm max-lg:tap" href={`tel:+${next.mobile.replace(/\D/g, "").replace(/^(\d{10})$/, "91$1")}`}>
                        <Phone className="size-4" /> Call
                      </a>
                      <WhatsAppMenu phone={next.mobile} keys={["waFollowUp", "waFirstContact", "waQuoteReminder"]} vars={{ name: next.title, reference: next.ref, staff: name }} className="btn-ghost btn-sm max-lg:tap" />
                    </>
                  )}
                  {next.kind === "quote" && next.mobile && (
                    <WhatsAppMenu phone={next.mobile} keys={["waQuoteReminder", "waFollowUp"]} vars={{ name: next.title, quote: next.quote, amount: next.amount, validUntil: next.until, staff: name }} className="btn-primary btn-sm max-lg:tap" label="Send reminder" />
                  )}
                  <Link to={next.to} className={`${next.kind === "new" ? "btn-primary" : "btn-ghost"} btn-sm max-lg:tap`} data-testid="myday-next-open">
                    {next.kind === "new" ? "Open and take it" : "Open"} <ArrowRight className="size-4" />
                  </Link>
                </div>
              </div>
              {rest.length > 0 && (
                <ol className="mt-3 grid gap-1.5" aria-label="Then" data-testid="myday-then">
                  {rest.slice(0, 4).map((t) => (
                    <li key={`${t.kind}-${t.id}`}>
                      <Link to={t.to} className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-card/80">
                        <span className={`size-2 shrink-0 rounded-full ${TONE[t.kind].dot}`} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{t.title}</span>
                          <span className="block truncate text-xs text-muted">{t.sub}</span>
                        </span>
                        <span className="sr-only">{TONE[t.kind].label}</span>
                        <ArrowRight className="size-4 shrink-0 text-subtle" />
                      </Link>
                    </li>
                  ))}
                  {rest.length > 4 && <li className="px-2 text-xs text-muted">and {rest.length - 4} more: use the counters above.</li>}
                </ol>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
