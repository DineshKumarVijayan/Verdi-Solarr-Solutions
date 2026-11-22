import { BookOpen, CircleHelp, Sparkles, Calculator, Camera, ClipboardList, Ellipsis, FileText, GitCompareArrows, GraduationCap, House, LayoutDashboard, LayoutGrid, LogOut, Mail, MapPin, Phone, Scale, UserRound, Wrench } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { useAccount, useStaff } from "../lib/account";
import { useBasket } from "../lib/basket";
import { useCompare } from "../lib/compare";
import { useSite } from "../lib/site";
import { useCatalogue } from "../lib/catalogue";
import { BottomSheet, SheetGroup } from "./mobile/kit";
import { WhatsAppIcon } from "./WhatsAppIcon";

/**
 * App-style bottom navigation on phones/tablets (< lg): Home · Products · Enquiry · Learn · More.
 * WhatsApp and Call live in the More sheet (and in the action bars on product/enquiry pages).
 * Hidden in the admin area, which has its own tab bar.
 */
export function MobileTabBar() {
  const basket = useBasket();
  const { pathname } = useLocation();
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [pathname]);
  if (pathname.startsWith("/admin")) return null;
  const navCls = ({ isActive }: { isActive: boolean }) => `tabbar-item ${isActive ? "!text-verdi-700" : ""}`;
  const learnActive = pathname.startsWith("/learn") || pathname.startsWith("/solar-tools");
  return (
    <>
      <nav aria-label="Quick navigation" className="tabbar lg:hidden" data-testid="tab-bar">
        <div className="mx-auto flex max-w-lg items-stretch">
          <NavLink to="/" end className={navCls}>
            <House className="size-5" /> Home
          </NavLink>
          <NavLink to="/products" className={({ isActive }) => navCls({ isActive: isActive || pathname.startsWith("/category/") })}>
            <LayoutGrid className="size-5" /> Products
          </NavLink>
          <NavLink to="/enquiry" className={navCls} aria-label={`Enquiry basket, ${basket.count} items`}>
            <span className="relative">
              <ClipboardList className="size-5" />
              {basket.count > 0 && (
                <span className="tab-badge" data-testid="tab-basket-count">
                  {basket.count}
                </span>
              )}
            </span>
            Enquiry
          </NavLink>
          <NavLink to="/learn" className={() => navCls({ isActive: learnActive })}>
            <GraduationCap className="size-5" /> Learn
          </NavLink>
          <button type="button" className={`tabbar-item ${more ? "!text-verdi-700" : ""}`} onClick={() => setMore(true)} aria-haspopup="dialog" aria-expanded={more} data-testid="tab-more">
            <Ellipsis className="size-5" /> More
          </button>
        </div>
      </nav>
      <PublicMoreSheet open={more} onClose={() => setMore(false)} />
    </>
  );
}

function Tile({ to, href, icon, children, badge, external, onClick, tone = "" }: { to?: string; href?: string; icon: ReactNode; children: ReactNode; badge?: number; external?: boolean; onClick?: () => void; tone?: string }) {
  const body = (
    <>
      <span className={`relative ${tone}`}>
        {icon}
        {!!badge && <span className="tab-badge">{badge}</span>}
      </span>
      {children}
    </>
  );
  if (to) return <Link to={to} className="sheet-tile" reloadDocument={to === "/admin"}>{body}</Link>;
  if (href) return <a href={href} className="sheet-tile" {...(external ? { target: "_blank", rel: "noopener" } : {})}>{body}</a>;
  return <button type="button" className="sheet-tile" onClick={onClick}>{body}</button>;
}

function PublicMoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const SITE = useSite();
  const { data } = useCatalogue();
  const compare = useCompare();
  const basket = useBasket();
  const { customer, logout } = useAccount();
  const { staff, signOut } = useStaff();
  const i = "size-6";
  return (
    <BottomSheet open={open} onClose={onClose} title="More" testId="more-sheet">
      {(customer || staff) && (
        <div className="mb-1 flex items-center justify-between gap-3 rounded-2xl bg-paper-2/60 px-3 py-2.5 text-sm" data-testid="mobile-signed-in">
          <span className="min-w-0 truncate">
            Signed in as <b>{customer ? customer.name : staff!.displayName || staff!.email}</b>
            {!customer && staff ? " (staff)" : ""}
          </span>
          <button type="button" className="tap inline-flex shrink-0 items-center gap-1 rounded-full px-2 font-medium text-muted" onClick={() => (customer ? logout() : signOut())}>
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
      <SheetGroup title="Talk to us">
        <Tile href={SITE.whatsappUrl} external icon={<WhatsAppIcon className={i} />} tone="text-[#1f9e4f]">
          WhatsApp
        </Tile>
        <Tile href={SITE.phoneHref} icon={<Phone className={i} />} tone="text-sky-600">
          Call
        </Tile>
        <Tile to="/contact" icon={<MapPin className={i} />}>
          Contact &amp; address
        </Tile>
        <Tile
          onClick={() => {
            onClose();
            window.dispatchEvent(new CustomEvent("vs:helper-open", { detail: null }));
          }}
          icon={<Sparkles className={i} />}
          tone="text-verdi-600"
        >
          Ask VERDI Helper
        </Tile>
        {!!data?.faqs?.length && (
          <Tile to="/faq" icon={<CircleHelp className={i} />}>
            Questions &amp; answers
          </Tile>
        )}
      </SheetGroup>
      <SheetGroup title="Shop">
        <Tile to="/products" icon={<LayoutGrid className={i} />}>
          All products
        </Tile>
        <Tile to="/compare" icon={<GitCompareArrows className={i} />} badge={compare.ids.length}>
          Compare
        </Tile>
        <Tile to="/enquiry" icon={<ClipboardList className={i} />} badge={basket.count}>
          Enquiry basket
        </Tile>
      </SheetGroup>
      <SheetGroup title="Learn & tools">
        <Tile to="/learn" icon={<BookOpen className={i} />}>
          Learning hub
        </Tile>
        <Tile to="/solar-tools" icon={<Calculator className={i} />}>
          Solar tools
        </Tile>
        <Tile to="/solar-tools/kit-builder" icon={<Wrench className={i} />}>
          Kit builder
        </Tile>
        <Tile to="/in-the-field" icon={<Camera className={i} />}>
          In the field
        </Tile>
        <Tile to="/learn/myths-vs-facts" icon={<Scale className={i} />}>
          Myths vs facts
        </Tile>
        <Tile href={`mailto:${SITE.email}`} icon={<Mail className={i} />}>
          Email us
        </Tile>
      </SheetGroup>
      <SheetGroup title="Account">
        {customer ? (
          <Tile to="/account" icon={<UserRound className={i} />}>
            My account
          </Tile>
        ) : !staff ? (
          <Tile to="/account" icon={<UserRound className={i} />}>
            Sign in / Register
          </Tile>
        ) : null}
        <Tile to="/admin" icon={<LayoutDashboard className={i} />}>
          {staff ? "Admin" : "Staff sign-in"}
        </Tile>
        <Tile to="/privacy" icon={<FileText className={i} />}>
          Privacy &amp; terms
        </Tile>
      </SheetGroup>
    </BottomSheet>
  );
}
