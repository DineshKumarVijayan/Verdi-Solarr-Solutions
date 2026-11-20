import { Clock, ClipboardList, GitCompareArrows, Mail, MapPin, Phone, Search } from "lucide-react";
import { Accordion } from "./mobile/kit";
import { AccountMenu } from "./AccountMenu";
import { Announcement } from "./Announcement";
import { ContactFabs } from "./ContactFabs";
import { MobileTabBar } from "./MobileTabBar";
import { WhatsAppIcon } from "./WhatsAppIcon";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from "react-router";
import localPages from "../../data/local-pages.json";
import { useAccount, useStaff } from "../lib/account";
import { api } from "../lib/api";
import { useIdleSignOut } from "../lib/idle";
import { useToast } from "./ui";
import { IDLE_MINUTES } from "../../shared/session";
import { useBasket } from "../lib/basket";
import { useCatalogue } from "../lib/catalogue";
import { useCompare } from "../lib/compare";
import { useSite } from "../lib/site";
import { Logo } from "./Logo";
import { SearchPalette } from "./SearchPalette";

const NAV = [
  { to: "/products", label: "Products" },
  { to: "/learn", label: "Learn" },
  { to: "/solar-tools", label: "Solar Tools" },
  { to: "/in-the-field", label: "In the Field" },
  { to: "/contact", label: "Contact" },
];

export function Layout() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const basket = useBasket();
  const compare = useCompare();
  const loc = useLocation();
  const isHome = loc.pathname === "/";
  const isAdmin = loc.pathname.startsWith("/admin");
  const { customer, logout } = useAccount();
  const { staff, signOut: staffSignOut } = useStaff();
  const toast = useToast();
  useIdleSignOut({
    active: !!customer || !!staff,
    onTimeout: () => {
      if (customer) void logout();
      if (staff) {
        window.dispatchEvent(new Event("vs:admin-expired")); // admin screen shows the reason first
        void staffSignOut();
      }
      toast(`You were signed out after ${IDLE_MINUTES} minutes of inactivity.`, "info");
    },
    keepAlive: () => {
      if (customer) void api("/api/account/me").catch(() => undefined);
      if (staff) void api("/api/admin/me").catch(() => undefined);
    },
  });
  // Signed-in customers get their own menu item (enquiry history & reward points).
  const nav = customer ? [...NAV, { to: "/account", label: "My account" }] : NAV;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col max-lg:pb-[calc(4rem+env(safe-area-inset-bottom))]">
      <a href="#main" className="sr-only z-[70] rounded-lg bg-ink px-4 py-2 text-paper focus:not-sr-only focus:fixed focus:top-3 focus:left-3">
        Skip to content
      </a>
      <Announcement />
      <header className={`sticky top-0 z-40 border-b lg:backdrop-blur-md ${isAdmin ? "max-lg:hidden " : ""}${isHome ? "border-white/10 bg-ink/95 text-paper lg:bg-ink/85" : "border-line/70 bg-paper/95 lg:bg-paper/85"}`}>
        <div className="container-x flex h-14 items-center gap-2 sm:gap-4 lg:h-16">
          <Link to="/" aria-label="VERDI SOLARR SOLUTION — home" className="shrink-0">
            <Logo dark={isHome} mobileCompact />
          </Link>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className={`tap flex min-w-0 flex-1 items-center gap-2 rounded-full border px-3.5 text-left text-sm lg:hidden ${isHome ? "border-white/15 bg-white/5 text-paper/70" : "border-line bg-card text-muted"}`}
            data-testid="m-open-search"
          >
            <Search className="size-4 shrink-0" /> <span className="truncate">Search products</span>
          </button>
          <nav aria-label="Primary" className="ml-2 hidden items-center gap-0.5 lg:flex xl:ml-6 xl:gap-1">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-full px-3 py-2 text-sm font-medium transition xl:px-3.5 ${
                    isActive ? (isHome ? "bg-white/10" : "bg-ink text-paper") : isHome ? "text-paper/75 hover:text-paper" : "text-ink/70 hover:text-ink"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-0.5 sm:gap-1.5">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className={`hidden items-center gap-2 whitespace-nowrap rounded-full border px-3 py-2 text-sm xl:flex ${isHome ? "border-white/15 text-paper/70 hover:border-white/35" : "border-line bg-card text-muted hover:border-ink/30"}`}
              data-testid="open-search"
            >
              <Search className="size-4" /> Search products
              <kbd className="ml-4 rounded border border-current/20 px-1.5 font-mono text-[10px] opacity-70">Ctrl K</kbd>
            </button>
            <button type="button" onClick={() => setPaletteOpen(true)} className={`rounded-full p-2 max-lg:hidden sm:p-2.5 xl:hidden ${isHome ? "hover:bg-white/10" : "hover:bg-paper-2"}`} aria-label="Search products">
              <Search className="size-5" />
            </button>
            {compare.ids.length > 0 && (
              <Link to="/compare" className={`relative rounded-full p-2.5 max-lg:hidden ${isHome ? "hover:bg-white/10" : "hover:bg-paper-2"}`} aria-label={`Compare ${compare.ids.length} products`}>
                <GitCompareArrows className="size-5" />
                <span className="num absolute -top-0.5 -right-0.5 grid size-5 place-items-center rounded-full bg-verdi-500 text-[10px] font-bold text-white">{compare.ids.length}</span>
              </Link>
            )}
            <AccountMenu dark={isHome} staff={staff} onStaffSignOut={staffSignOut} />
            <Link
              to="/enquiry"
              className={`relative inline-flex items-center gap-1 rounded-full max-lg:hidden px-1.5 py-2 min-[340px]:px-2 sm:gap-2 sm:px-3.5 text-sm font-semibold ${isHome ? "bg-sun-400 text-ink hover:bg-sun-300" : "bg-ink text-paper hover:bg-ink-3"}`}
              aria-label={`Enquiry basket, ${basket.count} items`}
              data-testid="basket-link"
            >
              <ClipboardList className="size-4" />
              <span className="hidden sm:inline">Enquiry</span>
              <span className="num rounded-full bg-black/15 px-1.5 text-xs" data-testid="basket-count">
                {basket.count}
              </span>
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <Footer />
      {!isAdmin && <MobileFooter />}
      <ContactFabs />
      <MobileTabBar />
      <SearchPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ScrollRestoration />
    </div>
  );
}

function Footer() {
  const SITE = useSite();
  const { data } = useCatalogue();
  const year = new Date().getFullYear();
  const socials = (
    [
      ["Instagram", SITE.instagramUrl],
      ["Facebook", SITE.facebookUrl],
      ["YouTube", SITE.youtubeUrl],
      ["LinkedIn", SITE.linkedinUrl],
    ] as const
  ).filter(([, href]) => !!href);
  return (
    <footer className="bg-ink text-paper/75 max-lg:hidden">
      <div className="container-x grid gap-10 py-14 md:grid-cols-12">
        <div className="md:col-span-4">
          <Logo dark />
          <p className="mt-4 max-w-sm text-sm leading-relaxed">
            B2B supplier of solar panels, inverters and solar electrical components for dealers, installers, EPC contractors and businesses.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <a href={SITE.whatsappUrl} target="_blank" rel="noopener" className="btn-sun btn-sm">
              <WhatsAppIcon className="size-3.5" /> WhatsApp us
            </a>
            <a href={SITE.phoneHref} className="btn-ghost-dark btn-sm">
              <Phone className="size-3.5" /> Call
            </a>
          </div>
        </div>
        <div className="md:col-span-3">
          <h2 className="font-mono text-[0.7rem] tracking-[0.18em] text-paper/45 uppercase">Products</h2>
          <ul className="mt-4 grid gap-2 text-sm">
            {(data?.categories ?? []).slice(0, 8).map((c) => (
              <li key={c.id}>
                <Link to={`/category/${c.slug}`} className="hover:text-paper">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="md:col-span-2">
          <h2 className="font-mono text-[0.7rem] tracking-[0.18em] text-paper/45 uppercase">Explore</h2>
          <ul className="mt-4 grid gap-2 text-sm">
            <li><Link to="/learn" className="hover:text-paper">Solar Learning Hub</Link></li>
            <li><Link to="/learn/myths-vs-facts" className="hover:text-paper">Myths vs Facts</Link></li>
            <li><Link to="/solar-tools" className="hover:text-paper">Solar Tools</Link></li>
            <li><Link to="/in-the-field" className="hover:text-paper">In the field</Link></li>
            <li><Link to="/solar-tools/kit-builder" className="hover:text-paper">Kit Builder</Link></li>
            <li><Link to="/compare" className="hover:text-paper">Compare products</Link></li>
            <li><Link to="/enquiry" className="hover:text-paper">Enquiry basket</Link></li>
          </ul>
        </div>
        <address className="not-italic md:col-span-3">
          <h2 className="font-mono text-[0.7rem] tracking-[0.18em] text-paper/45 uppercase">Contact</h2>
          <ul className="mt-4 grid gap-3 text-sm">
            <li className="flex gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0 text-verdi-300" />
              <span>
                {SITE.address.map((l) => (
                  <span key={l} className="block">
                    {l}
                  </span>
                ))}
              </span>
            </li>
            <li className="flex gap-2.5">
              <Phone className="mt-0.5 size-4 shrink-0 text-verdi-300" />
              <a href={SITE.phoneHref} className="hover:text-paper">
                {SITE.phoneDisplay}
              </a>
            </li>
            <li className="flex gap-2.5">
              <Mail className="mt-0.5 size-4 shrink-0 text-verdi-300" />
              <a href={`mailto:${SITE.email}`} className="break-all hover:text-paper">
                {SITE.email}
              </a>
            </li>
            {SITE.businessHours && (
              <li className="flex gap-2.5">
                <Clock className="mt-0.5 size-4 shrink-0 text-verdi-300" />
                <span>{SITE.businessHours}</span>
              </li>
            )}
          </ul>
          {socials.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="Social media" data-testid="social-links">
              {socials.map(([label, href]) => (
                <li key={label}>
                  <a href={href} target="_blank" rel="noopener me" className="inline-block rounded-full border border-white/15 px-3 py-1 text-xs hover:border-white/40 hover:text-paper">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </address>
      </div>
      <div className="border-t border-white/10">
        <div className="container-x flex flex-col gap-2 py-5 text-xs text-paper/45 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {SITE.name}. Brand names and trademarks belong to their respective owners. Specifications are taken from manufacturer datasheets.
          </p>
          <p className="flex gap-4">
            <Link to="/privacy" className="hover:text-paper">
              Privacy policy
            </Link>
            <Link to="/terms" className="hover:text-paper">
              Terms of use
            </Link>
          </p>
          <nav aria-label="Solar products near you" className="flex flex-wrap gap-x-3 gap-y-1">
            {localPages.pages.map((p) => (
              <Link key={p.slug} to={`/${p.slug}`} className="hover:text-paper/80">
                {p.title}
              </Link>
            ))}
          </nav>
          <Link to="/admin" reloadDocument className="hover:text-paper/80" rel="nofollow">
            Staff sign-in
          </Link>
        </div>
      </div>
    </footer>
  );
}

/** Phones (< lg): contact first, then link groups as collapsed accordions, so the footer is under one screen. */
function MobileFooter() {
  const SITE = useSite();
  const { data } = useCatalogue();
  const year = new Date().getFullYear();
  const link = "block py-2 text-sm text-paper/75 active:text-paper";
  return (
    <footer className="bg-ink px-4 pt-6 pb-4 text-paper/75 lg:hidden" data-testid="mobile-footer">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Logo dark compact />
        <div className="flex flex-wrap gap-2">
          <a href={SITE.whatsappUrl} target="_blank" rel="noopener" className="btn-sun tap" aria-label="WhatsApp us">
            <WhatsAppIcon className="size-4" /> WhatsApp
          </a>
          <a href={SITE.phoneHref} className="btn-ghost-dark tap" aria-label={`Call ${SITE.phoneDisplay}`}>
            <Phone className="size-4" /> Call
          </a>
        </div>
      </div>
      <address className="mt-4 grid gap-1.5 text-sm not-italic">
        <span className="flex gap-2">
          <MapPin className="mt-0.5 size-4 shrink-0 text-verdi-300" />
          <span>{SITE.address.join(", ")}</span>
        </span>
        <a href={`mailto:${SITE.email}`} className="flex gap-2 break-all">
          <Mail className="mt-0.5 size-4 shrink-0 text-verdi-300" />
          {SITE.email}
        </a>
        {SITE.businessHours && (
          <span className="flex gap-2">
            <Clock className="mt-0.5 size-4 shrink-0 text-verdi-300" />
            {SITE.businessHours}
          </span>
        )}
      </address>
      <div className="mt-3 border-t border-white/10 [&_.m-acc]:border-white/10 [&_summary]:text-paper">
        <Accordion title="Products">
          {(data?.categories ?? []).map((c) => (
            <Link key={c.id} to={`/category/${c.slug}`} className={link}>
              {c.name}
            </Link>
          ))}
        </Accordion>
        <Accordion title="Explore">
          <Link to="/learn" className={link}>Solar Learning Hub</Link>
          <Link to="/learn/myths-vs-facts" className={link}>Myths vs Facts</Link>
          <Link to="/solar-tools" className={link}>Solar Tools</Link>
          <Link to="/solar-tools/kit-builder" className={link}>Kit Builder</Link>
          <Link to="/in-the-field" className={link}>In the field</Link>
          <Link to="/compare" className={link}>Compare products</Link>
        </Accordion>
        <Accordion title="Locations">
          {localPages.pages.map((p) => (
            <Link key={p.slug} to={`/${p.slug}`} className={link}>
              {p.title}
            </Link>
          ))}
        </Accordion>
        <Accordion title="Legal">
          <Link to="/privacy" className={link}>Privacy policy</Link>
          <Link to="/terms" className={link}>Terms of use</Link>
          <Link to="/admin" reloadDocument rel="nofollow" className={link}>Staff sign-in</Link>
        </Accordion>
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-paper/45">
        © {year} {SITE.name}. Brand names and trademarks belong to their respective owners. Specifications are taken from manufacturer datasheets.
      </p>
    </footer>
  );
}
