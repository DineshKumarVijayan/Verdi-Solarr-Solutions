import type { AdminRole } from "../../../shared/types";
import { BarChart3, ClipboardList, FileText, Images, LayoutDashboard, Layers, Package, Settings, ShieldCheck, Tags, Users } from "lucide-react";

/**
 * The one list of admin sections. The desktop admin bar shows all of them; on phones the first
 * four `tab` entries are the bottom tabs and every other entry appears in the "More" sheet.
 * Add a new admin section here once and it shows up in both places.
 */
export const ADMIN_NAV = [
  { to: "/admin", label: "Dashboard", tabLabel: "Home", icon: LayoutDashboard, end: true, tab: true },
  { to: "/admin/products", label: "Products", icon: Package, tab: true },
  { to: "/admin/prices", label: "Prices", icon: Tags },
  { to: "/admin/catalogue", label: "Brands", sheetLabel: "Brands & categories", icon: Layers },
  { to: "/admin/field-photos", label: "Photos", sheetLabel: "Field photos", icon: Images },
  { to: "/admin/enquiries", label: "Enquiries", icon: ClipboardList, tab: true },
  { to: "/admin/quotations", label: "Quotations", tabLabel: "Quotes", icon: FileText, tab: true },
  { to: "/admin/performance", label: "Performance", icon: BarChart3, roles: ["owner", "admin"] },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/settings", label: "Settings", icon: Settings },
  { to: "/admin/users", label: "Staff", icon: ShieldCheck, owner: true },
] as {
  to: string;
  label: string;
  tabLabel?: string;
  sheetLabel?: string;
  icon: typeof Package;
  end?: boolean;
  tab?: boolean;
  owner?: boolean;
  /** only these roles see the section */
  roles?: AdminRole[];
}[];

/** Whether a staff role sees this section in the menus. */
export const navAllowed = (n: (typeof ADMIN_NAV)[number], role: AdminRole) => (!n.owner || role === "owner") && (!n.roles || n.roles.includes(role));
