import { KeyRound, LogOut, ShieldAlert } from "lucide-react";
import { ADMIN_NAV, navAllowed } from "./nav";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router";
import type { AdminIdentity } from "../../../shared/types";
import { Modal, Spinner } from "../../components/ui";
import { markActive } from "../../lib/idle";
import { IDLE_MINUTES } from "../../../shared/session";
import { AdminLogin, ChangePasswordForm } from "./AdminAuth";
import { AdminTabBar, AdminTopBar } from "./AdminMobile";
import { api, ApiError } from "../../lib/api";
import { usePageMeta } from "../../lib/seo";

const NAV = ADMIN_NAV;

const AdminCtx = createContext<AdminIdentity | null>(null);
export const useAdmin = () => useContext(AdminCtx)!;

export default function AdminLayout() {
  usePageMeta("Admin", undefined, { noindex: true });
  const [state, setState] = useState<{ admin?: AdminIdentity; error?: ApiError; notice?: string; relogin?: string } | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const signedIn = (admin: AdminIdentity) => {
    markActive();
    setState({ admin });
    setPwOpen(false);
    window.dispatchEvent(new CustomEvent("vs:admin-signed-in", { detail: admin }));
  };
  // Session ended (idle timeout, password changed elsewhere, account disabled): back to sign-in.
  useEffect(() => {
    const expired = () =>
      setState((s) => (s?.admin ? { ...s, relogin: `You were signed out (after ${IDLE_MINUTES} minutes of inactivity, or from another device). Sign in again to continue — your unsaved changes are still on the page.` } : s));
    const out = () => setState((s) => (s?.admin && !s.relogin ? { error: new ApiError(401, "signed_out", "Signed out.") } : s));
    window.addEventListener("vs:admin-expired", expired);
    window.addEventListener("vs:admin-signed-out", out);
    return () => {
      window.removeEventListener("vs:admin-expired", expired);
      window.removeEventListener("vs:admin-signed-out", out);
    };
  }, []);

  const check = useCallback(() => {
    api<{ admin: AdminIdentity }>("/api/admin/me")
      .then((r) => setState({ admin: r.admin }))
      .catch((e: ApiError) => {
        if (e.status === 401) document.cookie = "vs_staff=; Path=/; Max-Age=0"; // session expired: drop the "signed in" hint
        setState({ error: e });
      });
  }, []);
  useEffect(check, [check]);

  if (!state)
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-3 text-muted">
        <Spinner /> Checking your access…
      </div>
    );

  if (state.error?.status === 401) return <AdminLogin onDone={signedIn} notice={state.notice} />;
  if (state.error) {
    return (
      <div className="container-x py-24">
        <div className="card mx-auto max-w-md p-8 text-center">
          <ShieldAlert className="mx-auto size-9 text-sun-500" />
          <h1 className="mt-4 text-2xl font-semibold">Admin unavailable</h1>
          <p className="mt-2 text-sm text-muted">{state.error.message}</p>
          <button type="button" className="btn-ghost mt-6" onClick={check}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const admin = state.admin!;
  const signOut = async () => {
    await api("/api/admin/logout", { method: "POST", body: "{}" }).catch(() => undefined);
    document.cookie = "vs_staff=; Path=/; Max-Age=0";
    setState({ error: new ApiError(401, "signed_out", "Signed out.") });
    window.dispatchEvent(new Event("vs:admin-expired"));
  };
  return (
    <AdminCtx.Provider value={admin}>
      <AdminTopBar />
      <div className="border-b border-line bg-ink text-paper max-lg:hidden">
        <div className="container-x flex flex-wrap items-center gap-3 py-3">
          <span className="rounded-full bg-sun-400 px-2.5 py-0.5 font-mono text-[10px] font-semibold tracking-widest text-ink uppercase">Admin</span>
          <nav aria-label="Admin" className="scrollbar-none -mx-1 order-last flex min-w-0 basis-full gap-1 overflow-x-auto px-1 max-lg:[mask-image:linear-gradient(90deg,black_90%,transparent)] lg:flex-wrap lg:overflow-visible">
            {NAV.filter((n) => navAllowed(n, admin.role)).map((n) => (
              <NavLink key={n.to} end={n.end} to={n.to} className={({ isActive }) => `inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm whitespace-nowrap lg:px-2 ${isActive ? "bg-white/10 text-paper" : "text-paper/70 hover:text-paper"}`}>
                <n.icon className="size-4" /> {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-xs text-paper/60">
            <span className="hidden sm:inline">
              {admin.displayName || admin.email.split("@")[0]} · <span className="text-paper/90">{admin.role.replace("_", " ")}</span>
            </span>
            <button type="button" onClick={() => setPwOpen(true)} className="inline-flex items-center gap-1 hover:text-paper" data-testid="admin-change-password">
              <KeyRound className="size-3.5" /> Password
            </button>
            <button type="button" onClick={signOut} className="inline-flex items-center gap-1 hover:text-paper" data-testid="admin-sign-out">
              <LogOut className="size-3.5" /> Sign out
            </button>
          </div>
        </div>
      </div>
      <Outlet key={admin.email} />
      <AdminTabBar admin={admin} onPassword={() => setPwOpen(true)} onSignOut={signOut} />
      {state.relogin && (
        <div className="fixed inset-0 z-[80] overflow-auto bg-ink/75 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Sign in again" data-testid="relogin-overlay">
          <AdminLogin onDone={signedIn} notice={state.relogin} />
        </div>
      )}
      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title="Change your password" description="Your other devices will be signed out.">
        <div className="p-5">
          {pwOpen && <ChangePasswordForm initialLogin={admin.email} lockLogin onDone={signedIn} onCancel={() => setPwOpen(false)} />}
        </div>
      </Modal>
    </AdminCtx.Provider>
  );
}
