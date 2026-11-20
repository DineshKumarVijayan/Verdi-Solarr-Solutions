import { ClipboardList, Ellipsis, ExternalLink, FileText, Images, KeyRound, LayoutDashboard, Layers, LogOut, Package, Settings, ShieldCheck, Tags, Users } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import type { AdminDashboard, AdminIdentity } from "../../../shared/types";
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
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold" aria-live="polite">
        {adminTitle(pathname)}
      </h1>
      <span className="rounded-full bg-sun-400 px-2 py-0.5 font-mono text-[9px] font-semibold tracking-widest text-ink uppercase">Admin</span>
      <a href="/" className="tap -mr-2 grid place-items-center rounded-full text-paper/80" aria-label="View website">
        <ExternalLink className="size-5" />
      </a>
    </div>
  );
}

export function AdminTabBar({ admin, onPassword, onSignOut }: { admin: AdminIdentity; onPassword: () => void; onSignOut: () => void }) {
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);
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
  const moreActive = /^\/admin\/(prices|catalogue|field-photos|customers|settings|users)/.test(pathname);
  return (
    <>
      <nav aria-label="Admin quick navigation" className="tabbar lg:hidden" data-testid="admin-tab-bar">
        <div className="mx-auto flex max-w-lg items-stretch">
          <NavLink to="/admin" end className={cls}>
            <LayoutDashboard className="size-5" /> Home
          </NavLink>
          <NavLink to="/admin/products" className={cls}>
            <Package className="size-5" /> Products
          </NavLink>
          <NavLink to="/admin/enquiries" className={cls} aria-label={`Enquiries, ${newEnq} new`}>
            <span className="relative">
              <ClipboardList className="size-5" />
              {newEnq > 0 && (
                <span className="tab-badge" data-testid="admin-new-enquiries">
                  {newEnq}
                </span>
              )}
            </span>
            Enquiries
          </NavLink>
          <NavLink to="/admin/quotations" className={cls}>
            <FileText className="size-5" /> Quotes
          </NavLink>
          <button type="button" className={`tabbar-item ${more || moreActive ? "!text-verdi-700" : ""}`} onClick={() => setMore(true)} aria-haspopup="dialog" aria-expanded={more} data-testid="admin-tab-more">
            <Ellipsis className="size-5" /> More
          </button>
        </div>
      </nav>
      <BottomSheet open={more} onClose={() => setMore(false)} title="Admin" testId="admin-more-sheet">
        <p className="mb-1 truncate text-sm text-muted">
          {admin.displayName || admin.email.split("@")[0]} · <span className="font-medium text-ink">{admin.role.replace("_", " ")}</span>
        </p>
        <SheetGroup title="Catalogue">
          <Tile to="/admin/prices" icon={<Tags />}>Prices</Tile>
          <Tile to="/admin/catalogue" icon={<Layers />}>Brands &amp; categories</Tile>
          <Tile to="/admin/field-photos" icon={<Images />}>Field photos</Tile>
        </SheetGroup>
        <SheetGroup title="People & site">
          <Tile to="/admin/customers" icon={<Users />}>Customers</Tile>
          <Tile to="/admin/settings" icon={<Settings />}>Settings</Tile>
          {admin.role === "owner" && <Tile to="/admin/users" icon={<ShieldCheck />}>Staff</Tile>}
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
