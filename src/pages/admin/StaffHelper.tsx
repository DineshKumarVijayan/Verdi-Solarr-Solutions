import { AlertTriangle, CalendarClock, FileText, Inbox } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import lessonData from "../../../data/lessons.json";
import type { HelperAnswer, Lang } from "../../../shared/assistant";
import { staffReply, staffWelcome, type StaffContext } from "../../../shared/assistant-staff";
import type { MyDay } from "../../../shared/types";
import { ChatShell } from "../../components/assistant/ChatShell";
import { ProductCards } from "../../components/assistant/CustomerHelper";
import { api } from "../../lib/api";
import { useCatalogue } from "../../lib/catalogue";
import { useSite } from "../../lib/site";
import { useAdmin } from "./AdminLayout";

const LESSONS = (lessonData as { lessons: { slug: string; title: string; summary: string }[] }).lessons.map(({ slug, title, summary }) => ({ slug, title, summary }));

function Tile({ n, label, to, icon, onNavigate, tone }: { n: number; label: string; to: string; icon: ReactNode; onNavigate: () => void; tone: string }) {
  return (
    <Link to={to} onClick={onNavigate} className={`flex min-h-14 items-center gap-2 rounded-2xl border border-line bg-card p-2.5 transition hover:-translate-y-0.5 hover:shadow-sm motion-reduce:transform-none ${n ? "" : "opacity-60"}`} data-testid="helper-myday-tile">
      <span className={`grid size-8 shrink-0 place-items-center rounded-xl [&>svg]:size-4 ${tone}`}>{icon}</span>
      <span className="min-w-0">
        <span className="num block text-lg leading-none font-semibold">{n}</span>
        <span className="block truncate text-[11px] text-muted">{label}</span>
      </span>
    </Link>
  );
}

/** The signed-in person's own day (same endpoint and rules as the dashboard's My day). */
function MyDayCard({ lang, onNavigate }: { lang: Lang; onNavigate: () => void }) {
  const [day, setDay] = useState<MyDay | null | "error">(null);
  useEffect(() => {
    api<MyDay>("/api/admin/my-day")
      .then(setDay)
      .catch(() => setDay("error"));
  }, []);
  if (day === null) return <div className="h-28 animate-pulse rounded-2xl bg-paper-2" />;
  if (day === "error") return <p className="text-xs text-danger">{lang === "ta" ? "இப்போது ஏற்ற முடியவில்லை." : "Couldn't load your day right now."}</p>;
  const late = day.followUps.filter((f) => f.followUpOn < day.today);
  const today = day.followUps.filter((f) => f.followUpOn >= day.today);
  const ta = lang === "ta";
  const next = [...late, ...today].slice(0, 3);
  return (
    <div className="space-y-2" data-testid="helper-myday">
      <div className="grid grid-cols-2 gap-2">
        <Tile n={late.length} label={ta ? "தாமதமான follow-ups" : "Overdue follow-ups"} to="/admin/enquiries?owner=me&followup=overdue" icon={<AlertTriangle />} tone="bg-red-50 text-red-700" onNavigate={onNavigate} />
        <Tile n={today.length} label={ta ? "இன்று follow-up" : "Follow up today"} to="/admin/enquiries?owner=me&followup=today" icon={<CalendarClock />} tone="bg-sun-100 text-sun-600" onNavigate={onNavigate} />
        <Tile n={day.unassigned.length} label={ta ? "புதியவை, யாரும் எடுக்கவில்லை" : "New, not taken"} to="/admin/enquiries?owner=none&status=new" icon={<Inbox />} tone="bg-sky-50 text-sky-700" onNavigate={onNavigate} />
        <Tile n={day.quotes.length} label={ta ? "காலாவதியாகும் quotes" : "Quotes expiring"} to="/admin/quotations?owner=me&expiring=1" icon={<FileText />} tone="bg-verdi-50 text-verdi-800" onNavigate={onNavigate} />
      </div>
      {next.length > 0 && (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-card px-3 text-xs">
          {next.map((f) => (
            <li key={f.id}>
              <Link to={`/admin/enquiries?q=${encodeURIComponent(f.reference)}`} onClick={onNavigate} className="flex min-h-11 items-center justify-between gap-2 hover:text-verdi-700">
                <span className="min-w-0 truncate font-medium">{f.name}</span>
                <span className={`num shrink-0 ${f.followUpOn < day.today ? "text-danger" : "text-muted"}`}>{f.reference}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function StaffHelper({ open, onClose, onEnd, session, lang, setLang, starter }: { open: boolean; onClose: () => void; onEnd: () => void; session: number; lang: Lang; setLang: (l: Lang) => void; starter: string | null }) {
  const admin = useAdmin();
  const { data, index } = useCatalogue();
  const SITE = useSite();
  const ctx = useMemo<StaffContext | null>(
    () =>
      data
        ? {
            cat: data,
            index,
            lang,
            lessons: LESSONS,
            signedIn: false,
            staff: true,
            role: admin.role,
            site: { phoneDisplay: SITE.phoneDisplay, phoneHref: SITE.phoneHref, whatsappUrl: SITE.whatsappUrl, email: SITE.email, address: SITE.address, hours: SITE.businessHours, social: [] },
          }
        : null,
    [data, index, lang, admin.role, SITE],
  );
  const answer = useCallback((q: string): HelperAnswer => (ctx ? staffReply(q, ctx) : { text: "…" }), [ctx]);
  const hello = useCallback((): HelperAnswer => (ctx ? staffWelcome(ctx) : { text: lang === "ta" ? "வணக்கம்!" : "Hi!" }), [ctx, lang]);
  return (
    <ChatShell
      open={open}
      onClose={onClose}
      onEnd={onEnd}
      session={session}
      title={lang === "ta" ? "பணியாளர் உதவி" : "Staff helper"}
      subtitle={`${admin.displayName || admin.email.split("@")[0]} · ${lang === "ta" ? "நீங்கள் பார்க்க அனுமதி உள்ளவை மட்டும்" : "only what your role can see"}`}
      lang={lang}
      setLang={setLang}
      welcome={hello}
      answer={answer}
      starter={starter}
      note={lang === "ta" ? "உதவியாளர் எதையும் மாற்றாது; பக்கங்களைத் திறக்கும் மட்டுமே." : "The helper never changes anything; it only opens pages for you."}
      testId="staff-helper"
      extras={(a, close) => (
        <>
          {a.products && <ProductCards ids={a.products} onNavigate={close} canAdd={false} />}
          {a.need === "myday" && <MyDayCard lang={lang} onNavigate={close} />}
        </>
      )}
    />
  );
}
