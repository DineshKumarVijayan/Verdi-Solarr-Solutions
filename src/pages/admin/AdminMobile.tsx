import { Ellipsis, ExternalLink, KeyRound, LogOut } from "lucide-react";
import { ADMIN_NAV, navAllowed } from "./nav";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { ROLE_LABEL, type AdminDashboard, type AdminIdentity } from "../../../shared/types";
import { BottomSheet, SheetGroup } from "../../components/mobile/kit";
import { api } from "../../lib/api";

/* Admin shell on phones (< lg): slim top bar, bottom tabs and a "More" sheet.
 * The desktop admin bar is unchanged (it is hidden below lg instead). */

const TITLES: [RegExp, string][] = [
  [/^\/admin\/?$/, "Dashboard"],
  [/^\/admin\/products\/new/, "New product"],
  [/^\/admin\/products\/\d+/, "Edit product"],
  [/^\/admin\/products/, "Products"],
  [/^\/admin\/prices/, "Prices"],
  [/^\/admin\/catalogue/, "Brands & categories"],
  [/^\/admin\/field-photos/, "Field photos"],
  [/^\/admin\/enquiries/, "Enquiries"],
  [/^\/admin\/quotations\/.+/, "Quotation"],
  [/^\/admin\/quotations/, "Quotations"],
  [/^\/admin\/performance/, "Staff performance"],
  [/^\/admin\/bonus/, "Staff bonus"],
  [/^\/admin\/my-bonus/, "My bonus"],
  [/^\/admin\/customers/, "Customers"],
  [/^\/admin\/settings/, "Settings"],
  [/^\/admin\/users/, "Staff"],
];
export const adminTitle = (path: string) => TITLES.find(([re]) => re.test(path))?.[1] ?? "Admin";

const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023.98px)").matches;

export function AdminTopBar() {
  const { pathname } = useLocation();
  return (
    <div className="m-topbar border-white/10 bg-ink text-paper lg:hidden" data-testid="admin-topbar">
      <Link to="/admin" aria-label="Admin dashboard" className="tap -ml-1 grid shrink-0 place-items-center">
        <img src="/brand/verdi-mark.png" alt="" width={32} height={33} className="size-8" />
      </Link>
      <p className="min-w-0 flex-1 truncate text-base font-semibold" aria-live="polite">
        {adminTitle(pathname)}
      </p>
      <span className="rounded-full bg-sun-400 px-2 py-0.5 font-mono text-[9px] font-semibold tracking-widest text-ink uppercase">Admin</span>
      <a href="/" className="tap -mr-2 grid place-items-center rounded-full text-paper/80" aria-label="View website">
        <ExternalLink className="size-5" />
      </a>
    </div>
  );
}

export function AdminTabBar({ admin, onPassword, onSignOut }: { admin: AdminIdentity; onPassword: () => void; onSignOut: () => void }) {
  const { pathname, search } = useLocation();
  const [more, setMore] = useState(false);
  // Each list remembers its last search/filters: tapping its tab again returns there.
  useEffect(() => {
    const root = ADMIN_NAV.find((n) => n.to !== "/admin" && pathname === n.to);
    if (root) {
      try {
        sessionStorage.setItem(`verdi.admin.last:${root.to}`, pathname + search);
      } catch {
        /* storage blocked */
      }
    }
  }, [pathname, search]);
  const lastUrl = (to: string) => {
    try {
      return sessionStorage.getItem(`verdi.admin.last:${to}`) ?? to;
    } catch {
      return to;
    }
  };
  const [newEnq, setNewEnq] = useState(0);
  useEffect(() => setMore(false), [pathname]);
  // "new enquiries" badge (phones only; reuses the dashboard counts endpoint)
  useEffect(() => {
    if (!isPhone()) return;
    let live = true;
    api<AdminDashboard>("/api/admin/dashboard")
      .then((d) => live && setNewEnq(d.newEnquiries))
      .catch(() => undefined);
    return () => void (live = false);
  }, [pathname]);
  const cls = ({ isActive }: { isActive: boolean }) => `tabbar-item ${isActive ? "!text-verdi-700" : ""}`;
  const allowed = ADMIN_NAV.filter((n) => navAllowed(n, admin.role));
  const tabs = allowed.filter((n) => n.tab);
  const sections = allowed.filter((n) => !n.tab);
  const moreActive = sections.some((n) => pathname.startsWith(n.to));
  return (
    <>
      <nav aria-label="Admin quick navigation" className="tabbar lg:hidden" data-testid="admin-tab-bar">
        <div className="mx-auto flex max-w-lg items-stretch">
          {tabs.map((n) => (
            <NavLink key={n.to} to={pathname === n.to ? n.to : lastUrl(n.to)} end={n.end} className={({ isActive }) => cls({ isActive: isActive || (n.to !== "/admin" && pathname.startsWith(n.to)) })} aria-label={n.to === "/admin/enquiries" ? `Enquiries, ${newEnq} new` : undefined}>
              <span className="relative">
                <n.icon className="size-5" />
                {n.to === "/admin/enquiries" && newEnq > 0 && (
                  <span className="tab-badge" data-testid="admin-new-enquiries">
                    {newEnq}
                  </span>
                )}
              </span>
              {n.tabLabel ?? n.label}
            </NavLink>
          ))}
          <button type="button" className={`tabbar-item ${more || moreActive ? "!text-verdi-700" : ""}`} onClick={() => setMore(true)} aria-haspopup="dialog" aria-expanded={more} data-testid="admin-tab-more">
            <Ellipsis className="size-5" /> More
          </button>
        </div>
      </nav>
      <BottomSheet open={more} onClose={() => setMore(false)} title="Admin" testId="admin-more-sheet">
        <p className="mb-1 truncate text-sm text-muted">
          {admin.displayName || admin.email.split("@")[0]} · <span className="font-medium text-ink">{ROLE_LABEL[admin.role]}</span>
        </p>
        <SheetGroup title="Sections">
          {sections.map((n) => (
            <Tile key={n.to} to={n.to} icon={<n.icon />}>
              {n.sheetLabel ?? n.label}
            </Tile>
          ))}
        </SheetGroup>
        <SheetGroup title="Your account">
          <Tile onClick={() => (setMore(false), onPassword())} icon={<KeyRound />} testId="m-admin-change-password">
            Password
          </Tile>
          <Tile onClick={() => (setMore(false), onSignOut())} icon={<LogOut />} testId="m-admin-sign-out">
            Sign out
          </Tile>
          <Tile href="/" icon={<ExternalLink />}>View website</Tile>
        </SheetGroup>
      </BottomSheet>
    </>
  );
}

function Tile({ to, href, onClick, icon, children, testId }: { to?: string; href?: string; onClick?: () => void; icon: ReactNode; children: ReactNode; testId?: string }) {
  const body = (
    <>
      <span className="[&>svg]:size-6">{icon}</span>
      {children}
    </>
  );
  if (to) return <NavLink to={to} className={({ isActive }) => `sheet-tile ${isActive ? "!bg-verdi-50 !text-verdi-700" : ""}`}>{body}</NavLink>;
  if (href) return <a href={href} className="sheet-tile">{body}</a>;
  return <button type="button" className="sheet-tile" onClick={onClick} data-testid={testId}>{body}</button>;
}
