import { CalendarClock, FileText, Inbox } from "lucide-react";
import { Link } from "react-router";
import { formatPaise } from "../../../shared/money";
import type { MyDay } from "../../../shared/types";
import { ADMIN_STATUS_LABEL } from "../../lib/enquiry-status";

const short = (ymd: string) => new Date(ymd + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** "My day": what the signed-in staff member should do today. Same block on phones and desktop. */
export function MyDayCard({ day, className = "" }: { day: MyDay; className?: string }) {
  const overdue = day.followUps.filter((f) => f.followUpOn < day.today).length;
  const nothing = day.followUps.length === 0 && day.unassigned.length === 0 && day.quotes.length === 0 && day.noDate === 0;
  return (
    <section className={`card p-4 sm:p-5 ${className}`} aria-labelledby="myday-h" data-testid="my-day">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="myday-h" className="text-base font-semibold sm:text-lg">
          My day
        </h2>
        <p className="text-xs text-muted">
          {new Date(day.today + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>
      {nothing ? (
        <p className="mt-2 text-sm text-muted">Nothing due today. New enquiries you take and follow-up dates you set will show here.</p>
      ) : (
        <div className="mt-3 grid gap-4 lg:grid-cols-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <CalendarClock className="size-4 text-verdi-600" /> Follow-ups due
              {overdue > 0 && <span className="rounded-full bg-danger-bg px-2 py-0.5 text-xs text-danger">{overdue} overdue</span>}
            </h3>
            {day.followUps.length === 0 ? (
              <p className="mt-1 text-sm text-muted">None due.</p>
            ) : (
              <ul className="mt-1 divide-y divide-line/70" data-testid="my-day-followups">
                {day.followUps.map((f) => (
                  <li key={f.id}>
                    <Link to={`/admin/enquiries?q=${encodeURIComponent(f.reference)}`} className="flex min-h-11 items-center gap-2 py-1.5 text-sm hover:underline">
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${f.followUpOn < day.today ? "bg-danger-bg text-danger" : "bg-sun-100 text-ink"}`}>{f.followUpOn < day.today ? short(f.followUpOn) : "Today"}</span>
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className="shrink-0 text-xs text-muted">{ADMIN_STATUS_LABEL[f.status]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {day.noDate > 0 && (
              <Link to="/admin/enquiries?owner=me" className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-verdi-700 hover:underline" data-testid="my-day-nodate">
                {day.noDate} of your open enquiries {day.noDate === 1 ? "has" : "have"} no follow-up date: set one
              </Link>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Inbox className="size-4 text-verdi-600" /> New, nobody responsible yet
            </h3>
            {day.unassigned.length === 0 ? (
              <p className="mt-1 text-sm text-muted">None waiting.</p>
            ) : (
              <>
                <ul className="mt-1 divide-y divide-line/70" data-testid="my-day-unassigned">
                  {day.unassigned.slice(0, 5).map((u) => (
                    <li key={u.id}>
                      <Link to={`/admin/enquiries?q=${encodeURIComponent(u.reference)}`} className="flex min-h-11 items-center gap-2 py-1.5 text-sm hover:underline">
                        <span className="min-w-0 flex-1 truncate">{u.name}</span>
                        <span className="shrink-0 text-xs text-muted">{u.source === "website" ? "Website" : "Staff"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link to="/admin/enquiries?owner=none" className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-verdi-700 hover:underline">
                  Open one and tap “Take this enquiry”
                </Link>
              </>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <FileText className="size-4 text-verdi-600" /> My quotations expiring
            </h3>
            {day.quotes.length === 0 ? (
              <p className="mt-1 text-sm text-muted">None in the next 3 days.</p>
            ) : (
              <ul className="mt-1 divide-y divide-line/70" data-testid="my-day-quotes">
                {day.quotes.map((q) => (
                  <li key={q.id}>
                    <Link to={`/admin/quotations/${q.id}`} className="flex min-h-11 items-center gap-2 py-1.5 text-sm hover:underline">
                      <span className="min-w-0 flex-1 truncate">
                        {q.number} · {q.customerName}
                      </span>
                      <span className="num shrink-0 text-xs">{formatPaise(q.totalPaise)}</span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${q.validUntil < day.today ? "bg-sun-100 text-ink" : "bg-paper-2 text-muted"}`}>{q.validUntil < day.today ? "Expired" : `Until ${short(q.validUntil)}`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
