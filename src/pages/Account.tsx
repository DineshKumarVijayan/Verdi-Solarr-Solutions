import { Award, ClipboardList, KeyRound, LogOut, RotateCcw, ShieldCheck, UserRound } from "lucide-react";
import { usePaged } from "../components/Pager";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { formatMobile, PASSWORD_MIN } from "../../shared/admin-schemas";
import { formatPaise } from "../../shared/money";
import type { EnquiryView, RewardEntry } from "../../shared/types";
import { m } from "../components/motion";
import { Spinner, useToast } from "../components/ui";
import { WhatsAppIcon } from "../components/WhatsAppIcon";
import { useAccount } from "../lib/account";
import { api, ApiError } from "../lib/api";
import { useBasket } from "../lib/basket";
import { useCatalogue } from "../lib/catalogue";
import { STATUS_LABEL, STATUS_STYLE } from "../lib/enquiry-status";
import { usePageMeta } from "../lib/seo";
import { useRefreshOnReturn } from "../lib/refresh";
import { useSite } from "../lib/site";

const dateFmt = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

type FieldErrors = Record<string, string>;
function fieldErrors(e: unknown): FieldErrors {
  const out: FieldErrors = {};
  if (e instanceof ApiError && Array.isArray(e.details)) for (const d of e.details as { path: string; message: string }[]) out[d.path] ??= d.message;
  return out;
}

export default function Account() {
  usePageMeta("My account", "Sign in to see your enquiry history and reward points.", { noindex: true });
  const { customer, checking } = useAccount();
  if (checking)
    return (
      <div className="flex min-h-[50vh] items-center justify-center gap-3 text-muted">
        <Spinner /> Loading your account…
      </div>
    );
  return customer ? <Dashboard /> : <AuthForms />;
}

// ------------------------------------------------------------------ sign in / register

function AuthForms() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"signin" | "register">(params.get("mode") === "register" ? "register" : "signin");
  const { login, register } = useAccount();
  const toast = useToast();
  const SITE = useSite();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errs, setErrs] = useState<FieldErrors>({});
  const [f, setF] = useState({ login: "", password: "", name: "", mobile: "", email: "", business: "", city: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  useEffect(() => {
    const m = params.get("mode");
    if (m === "register" || m === "signin") setMode(m);
  }, [params]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrs({});
    try {
      if (mode === "signin") await login(f.login, f.password);
      else await register({ name: f.name, mobile: f.mobile, email: f.email, business: f.business, city: f.city, password: f.password });
      toast(mode === "signin" ? "Signed in" : "Account created — welcome!", "success");
      const next = params.get("next");
      if (next && next.startsWith("/") && !next.startsWith("//")) nav(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
      setErrs(fieldErrors(err));
    } finally {
      setBusy(false);
    }
  };

  const input = (k: keyof typeof f, label: string, type = "text", ac?: string, req = false, hint?: string) => (
    <div>
      <label htmlFor={`a-${k}`} className="label">
        {label} {req && <span className="text-danger">*</span>}
      </label>
      <input id={`a-${k}`} type={type} autoComplete={ac} autoCapitalize={type === "text" && k !== "name" && k !== "business" && k !== "city" ? "none" : undefined} className={`field ${errs[k] ? "!border-danger" : ""}`} value={f[k]} onChange={set(k)} aria-invalid={!!errs[k]} />
      {errs[k] ? <p className="mt-1 text-xs text-danger">{errs[k]}</p> : hint ? <p className="mt-1 text-xs text-subtle">{hint}</p> : null}
    </div>
  );

  return (
    <div className="container-x grid gap-10 py-14 max-lg:gap-4 max-lg:py-5 lg:grid-cols-[1fr_1.1fr] lg:items-center">
      <div>
        <p className="eyebrow">Customer account</p>
        <h1 className="mt-2 text-4xl font-semibold max-sm:text-2xl sm:text-5xl">Track every enquiry in one place.</h1>
        <ul className="mt-8 grid gap-4 text-sm max-lg:hidden">
          {[
            { icon: ClipboardList, t: "Enquiry history", d: "Every enquiry you send is saved with its reference number, products, quantities and status." },
            { icon: RotateCcw, t: "Re-order in one tap", d: "Put a previous enquiry back into your basket and send it again." },
            { icon: Award, t: "Reward points", d: "See the reward points credited to your account by the VERDI team." },
          ].map((x) => (
            <li key={x.t} className="flex gap-3">
              <x.icon className="mt-0.5 size-5 shrink-0 text-verdi-600" />
              <span>
                <span className="font-semibold">{x.t}.</span> <span className="text-muted">{x.d}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card p-6 max-sm:p-4 sm:p-8">
        <div className="flex rounded-full bg-paper-2 p-1" role="tablist" aria-label="Account">
          {(["signin", "register"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={mode === k}
              onClick={() => {
                setMode(k);
                setError(null);
                setErrs({});
              }}
              className={`relative flex-1 rounded-full py-2 text-sm font-semibold max-lg:min-h-11 ${mode === k ? "text-paper" : "text-muted"}`}
            >
              {mode === k && <m.span layoutId="acct-tab" className="absolute inset-0 rounded-full bg-ink" />}
              <span className="relative">{k === "signin" ? "Sign in" : "Create account"}</span>
            </button>
          ))}
        </div>
        <form className="mt-6 grid gap-3" onSubmit={submit} noValidate data-testid={`${mode}-form`}>
          {mode === "signin" ? (
            <>
              {input("login", "Mobile number or email", "text", "username", true)}
              {input("password", "Password", "password", "current-password", true)}
            </>
          ) : (
            <>
              {input("name", "Your name", "text", "name", true)}
              {input("mobile", "Mobile number", "tel", "tel", true, "10-digit Indian mobile number. You sign in with this.")}
              {input("email", "Email (optional)", "email", "email")}
              <div className="grid gap-3 sm:grid-cols-2">
                {input("business", "Business name", "text", "organization")}
                {input("city", "City", "text", "address-level2")}
              </div>
              {input("password", "Choose a password", "password", "new-password", true, `At least ${PASSWORD_MIN} characters.`)}
            </>
          )}
          {error && (
            <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <button type="submit" className="btn-primary mt-1 w-full" disabled={busy} data-testid="account-submit">
            {busy ? <Spinner className="size-4" /> : <UserRound className="size-4" />} {mode === "signin" ? "Sign in" : "Create account"}
          </button>
          {mode !== "signin" && (
            <p className="text-center text-[11px] leading-snug text-subtle">
              By creating an account you agree to our{" "}
              <Link to="/terms" className="underline">
                terms
              </Link>{" "}
              and{" "}
              <Link to="/privacy" className="underline">
                privacy policy
              </Link>
              .
            </p>
          )}
          {mode === "signin" ? (
            <p className="text-center text-xs text-muted">
              Forgot your password?{" "}
              <a className="font-semibold text-verdi-700 underline" href={`${SITE.whatsappUrl}?text=${encodeURIComponent("Hello VERDI SOLARR, please send me a password reset link for my account.")}`} target="_blank" rel="noopener">
                Message us on WhatsApp
              </a>{" "}
              and we’ll send you a reset link.
            </p>
          ) : (
            <p className="flex gap-2 text-xs text-subtle">
              <ShieldCheck className="size-4 shrink-0 text-verdi-600" /> Your password is stored only as a salted one-way hash. We never see it and never share your details.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ dashboard

function Dashboard() {
  const { customer, logout, setCustomer } = useAccount();
  const c = customer!;
  const [enquiries, setEnquiries] = useState<EnquiryView[] | null>(null);
  const pg = usePaged(enquiries ?? [], "account.enquiries");
  const [rewards, setRewards] = useState<{ balance: number; entries: RewardEntry[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // phones: Enquiries · Rewards · Profile tabs (desktop shows all three columns as before)
  const [tab, setTab] = useState<"enquiries" | "rewards" | "profile">("enquiries");
  const hide = (t: typeof tab) => (tab === t ? "" : "max-lg:hidden");

  const [tick, setTick] = useState(0);
  useRefreshOnReturn(() => setTick((t) => t + 1)); // enquiry progress and points update while the page is open
  useEffect(() => {
    Promise.all([api<{ enquiries: EnquiryView[] }>("/api/account/enquiries"), api<{ balance: number; entries: RewardEntry[] }>("/api/account/rewards")])
      .then(([e, r]) => {
        setEnquiries(e.enquiries);
        setRewards(r);
        if (r.balance !== c.points) setCustomer({ ...c, points: r.balance });
      })
      .catch((e: ApiError) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return (
    <div className="container-x py-10 max-lg:pt-4">
      <div className="flex flex-wrap items-end justify-between gap-4 max-lg:card max-lg:items-center max-lg:gap-3 max-lg:p-4">
        <div className="min-w-0">
          <p className="eyebrow">My account</p>
          <h1 className="mt-1 text-3xl font-semibold max-sm:text-2xl sm:text-4xl" data-testid="account-name">
            Hello, {c.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-muted max-lg:truncate max-lg:text-xs">
            {[c.business, formatMobile(c.mobile), c.email].filter(Boolean).join(" · ")} · Member since {dateFmt(c.createdAt)}
          </p>
        </div>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={async () => {
            await logout();
          }}
          data-testid="sign-out"
        >
          <LogOut className="size-4" /> Sign out
        </button>
        <p className="num flex basis-full items-center gap-2 rounded-2xl bg-ink px-3 py-2 text-sm text-paper lg:hidden" data-testid="points-chip">
          <Award className="size-4 text-sun-400" /> {c.points} reward points
        </p>
      </div>
      <div role="tablist" aria-label="My account" className="m-tabs top-14 mt-4 lg:hidden" data-testid="account-tabs">
        {(
          [
            ["enquiries", "Enquiries"],
            ["rewards", "Rewards"],
            ["profile", "Profile"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className="m-tab" onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {error && <p className="mt-6 rounded-xl bg-danger-bg p-3 text-sm text-danger">{error}</p>}

      <div className="mt-8 grid min-w-0 grid-cols-1 gap-6 max-lg:mt-4 lg:grid-cols-[1.6fr_1fr]">
        <section aria-labelledby="enq-h" className={`min-w-0 ${hide("enquiries")}`}>
          <h2 id="enq-h" className="text-xl font-semibold">
            Enquiry history
          </h2>
          {!enquiries ? (
            <div className="mt-6">
              <Spinner />
            </div>
          ) : enquiries.length === 0 ? (
            <div className="card mt-4 p-8 text-center">
              <ClipboardList className="mx-auto size-8 text-subtle" />
              <p className="mt-3 font-semibold">No enquiries yet</p>
              <p className="mt-1 text-sm text-muted">Enquiries you send while signed in appear here.</p>
              <Link to="/products" className="btn-primary btn-sm mt-4">
                Browse products
              </Link>
            </div>
          ) : (
            <ul className="mt-4 grid gap-3" data-testid="enquiry-history">
              {pg.items.map((e) => (
                <EnquiryCard key={e.id} e={e} />
              ))}
            </ul>
          )}
          {pg.pager}
        </section>

        <aside className={`grid min-w-0 content-start gap-6 ${tab === "enquiries" ? "max-lg:hidden" : ""}`}>
          <div className={hide("rewards")}>
            <RewardsCard rewards={rewards} />
          </div>
          <div className={hide("profile")}>
            <ProfileCard />
          </div>
          <div className={hide("profile")}>
            <PasswordCard />
          </div>
        </aside>
      </div>
    </div>
  );
}

function EnquiryCard({ e }: { e: EnquiryView }) {
  const basket = useBasket();
  const { byId } = useCatalogue();
  const toast = useToast();
  const nav = useNavigate();
  const available = e.items.filter((i) => i.productId && byId(i.productId));
  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="num font-semibold">{e.reference}</p>
          <p className="text-xs text-muted">{dateFmt(e.createdAt)}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[e.status]}`} data-testid="enquiry-status">
          {STATUS_LABEL[e.status]}
        </span>
      </div>
      <ul className="mt-3 grid gap-1 text-sm">
        {e.items.map((i, k) => (
          <li key={k} className="flex justify-between gap-3">
            <span className="min-w-0 truncate">
              <span className="num text-muted">{i.quantity} ×</span> {i.name}
            </span>
            {i.unitPaise != null && <span className="num shrink-0 text-muted">{formatPaise(i.unitPaise)}</span>}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <p className="text-sm">{e.totalPaise != null ? <span className="num font-semibold">Indicative {formatPaise(e.totalPaise)}</span> : <span className="text-muted">Prices on request</span>}</p>
        {available.length > 0 && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-verdi-700 hover:underline"
            onClick={() => {
              for (const i of available) {
                const p = byId(i.productId!)!;
                basket.add(p.id, i.quantity, { sellingPaise: p.price.sellingPaise, version: p.price.version });
              }
              toast(`${available.length} product(s) added to your basket`, "success");
              nav("/enquiry");
            }}
          >
            <RotateCcw className="size-3.5" /> Enquire again
          </button>
        )}
      </div>
    </li>
  );
}

function RewardsCard({ rewards }: { rewards: { balance: number; entries: RewardEntry[] } | null }) {
  const SITE = useSite();
  return (
    <section className="relative overflow-hidden rounded-3xl bg-ink p-6 text-paper" aria-labelledby="rw-h">
      <div className="absolute -top-16 -right-16 size-48 rounded-full bg-sun-400/25 blur-3xl" aria-hidden="true" />
      <p id="rw-h" className="eyebrow !text-sun-300">
        Reward points
      </p>
      <p className="num mt-2 text-5xl font-semibold" data-testid="points-balance">
        {rewards ? rewards.balance.toLocaleString("en-IN") : "—"}
      </p>
      <p className="mt-2 text-xs text-paper/60">
        Points are credited by the VERDI team.{" "}
        <a className="underline" href={`${SITE.whatsappUrl}?text=${encodeURIComponent("Hello VERDI SOLARR, I would like to know about redeeming my reward points.")}`} target="_blank" rel="noopener">
          Ask us about redeeming them
        </a>
        .
      </p>
      {rewards && rewards.entries.length > 0 && (
        <ul className="mt-4 grid max-h-56 gap-2 overflow-auto border-t border-white/10 pt-3 text-sm">
          {rewards.entries.map((r) => (
            <li key={r.id} className="flex justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate">{r.reason}</span>
                <span className="text-[11px] text-paper/50">
                  {dateFmt(r.createdAt)}
                  {r.enquiryReference ? ` · ${r.enquiryReference}` : ""}
                </span>
              </span>
              <span className={`num shrink-0 font-semibold ${r.points > 0 ? "text-verdi-300" : "text-sun-300"}`}>
                {r.points > 0 ? "+" : ""}
                {r.points.toLocaleString("en-IN")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProfileCard() {
  const { customer, setCustomer } = useAccount();
  const c = customer!;
  const toast = useToast();
  const [f, setF] = useState({ name: c.name, email: c.email ?? "", business: c.business ?? "", city: c.city ?? "" });
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<FieldErrors>({});
  return (
    <form
      className="card grid gap-3 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErrs({});
        try {
          const r = await api<{ customer: typeof c }>("/api/account/profile", { method: "PUT", body: JSON.stringify(f) });
          setCustomer(r.customer);
          toast("Profile saved", "success");
        } catch (err) {
          setErrs(fieldErrors(err));
          toast(err instanceof ApiError ? err.message : "Could not save", "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="font-semibold">Profile</h2>
      {(
        [
          ["name", "Name"],
          ["business", "Business name"],
          ["city", "City"],
          ["email", "Email"],
        ] as const
      ).map(([k, l]) => (
        <div key={k}>
          <label htmlFor={`p-${k}`} className="label">
            {l}
          </label>
          <input id={`p-${k}`} className="field" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          {errs[k] && <p className="mt-1 text-xs text-danger">{errs[k]}</p>}
        </div>
      ))}
      <p className="text-xs text-subtle">Mobile {formatMobile(c.mobile)} is your sign-in ID. To change it, contact us.</p>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={busy}
          onClick={() => {
            setF({ name: c.name, email: c.email ?? "", business: c.business ?? "", city: c.city ?? "" });
            setErrs({});
          }}
        >
          Cancel
        </button>
        <button type="submit" className="btn-primary btn-sm max-lg:tap max-lg:sticky max-lg:bottom-[calc(4.75rem+env(safe-area-inset-bottom))] max-lg:w-full" disabled={busy || (f.name === c.name && f.email === (c.email ?? "") && f.business === (c.business ?? "") && f.city === (c.city ?? ""))}>
          {busy && <Spinner className="size-4" />} Save profile
        </button>
      </div>
    </form>
  );
}

function PasswordCard() {
  const toast = useToast();
  const [f, setF] = useState({ currentPassword: "", newPassword: "" });
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<FieldErrors>({});
  return (
    <form
      className="card grid gap-3 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErrs({});
        try {
          await api("/api/account/password", { method: "PUT", body: JSON.stringify(f) });
          setF({ currentPassword: "", newPassword: "" });
          toast("Password changed. Other devices have been signed out.", "success");
        } catch (err) {
          setErrs(fieldErrors(err));
          toast(err instanceof ApiError ? err.message : "Could not change password", "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="flex items-center gap-2 font-semibold">
        <KeyRound className="size-4 text-verdi-600" /> Change password
      </h2>
      <div>
        <label htmlFor="pw-cur" className="label">
          Current password
        </label>
        <input id="pw-cur" type="password" autoComplete="current-password" className="field" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} />
        {errs.currentPassword && <p className="mt-1 text-xs text-danger">{errs.currentPassword}</p>}
      </div>
      <div>
        <label htmlFor="pw-new" className="label">
          New password
        </label>
        <input id="pw-new" type="password" autoComplete="new-password" className="field" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} />
        {errs.newPassword && <p className="mt-1 text-xs text-danger">{errs.newPassword}</p>}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-ghost btn-sm"
          disabled={busy || (!f.currentPassword && !f.newPassword)}
          onClick={() => {
            setF({ currentPassword: "", newPassword: "" });
            setErrs({});
          }}
        >
          Cancel
        </button>
        <button type="submit" className="btn-primary btn-sm" disabled={busy || !f.currentPassword || !f.newPassword}>
          {busy && <Spinner className="size-4" />} Update password
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ reset (link from admin)

export function AccountReset() {
  usePageMeta("Reset your password", undefined, { noindex: true });
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { refresh } = useAccount();
  const nav = useNavigate();
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="container-x py-20">
      <form
        className="card mx-auto grid max-w-md gap-4 p-8"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await api("/api/account/reset", { method: "POST", body: JSON.stringify({ token, newPassword: pw }) });
            await refresh();
            toast("Password updated — you are signed in.", "success");
            nav("/account");
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Could not reset password.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <KeyRound className="size-8 text-verdi-600" />
        <h1 className="text-2xl font-semibold">Set a new password</h1>
        <div>
          <label htmlFor="rp" className="label">
            New password
          </label>
          <input id="rp" type="password" autoComplete="new-password" className="field" value={pw} onChange={(e) => setPw(e.target.value)} />
          <p className="mt-1 text-xs text-subtle">At least {PASSWORD_MIN} characters.</p>
        </div>
        {error && <p className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Link to="/" className="btn-ghost">
            Cancel
          </Link>
          <button type="submit" className="btn-primary" disabled={busy || pw.length < PASSWORD_MIN || !token}>
            {busy && <Spinner className="size-4" />} Save new password
          </button>
        </div>
        <p className="text-xs text-muted">
          Link expired?{" "}
          <Link to="/contact" className="inline-flex items-center gap-1 font-semibold text-verdi-700 underline">
            <WhatsAppIcon className="size-3" /> Ask us for a new one
          </Link>
        </p>
      </form>
    </div>
  );
}
