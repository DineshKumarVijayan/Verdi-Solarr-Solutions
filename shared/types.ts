import type { StockStatus } from "./stock";
// Shared public data contracts between the Worker and the browser.
// NOTE: nothing admin-only (UpdatedBy, audit data, admin emails) may appear in the public types.

export interface PublicPrice {
  sellingPaise: number | null; // null => price pending / on request
  mrpPaise: number | null;
  gstIncluded: boolean;
  gstRate: number | null; // percent, e.g. 18
  unit: string; // "per piece", "per metre" ...
  version: number;
  updatedAt: string;
}

export interface PublicSpec {
  k: string; // key
  l: string; // label
  v: string; // value
  u: string | null; // unit
  g: string; // group
}

export interface PublicProduct {
  id: number;
  sku: string;
  slug: string;
  name: string;
  seriesKey: string | null;
  seriesName: string | null;
  variant: string | null;
  model: string | null;
  brandId: number;
  categoryId: number;
  short: string | null;
  description: string | null;
  highlights: string[];
  featured: boolean;
  /** availability set by the owner/admin (missing in old cached data = in stock) */
  stock: StockStatus;
  /** shown as a "Special offer" tag; the % off is worked out from the listed MRP */
  offer: { label: string | null } | null;
  price: PublicPrice;
  datasheet: string | null; // public URL
  images: { url: string; alt: string | null }[];
  specs: PublicSpec[];
}

export interface PublicBrand {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  logo?: string | null;
  website?: string | null;
}

export interface PublicFieldPhoto {
  src: string;
  caption: string;
  tag: string;
  tall: boolean;
}

/** A question & answer written by the owner/admin (Admin → Settings → Questions & answers). */
export interface PublicFaq {
  id: number;
  topic: string;
  q: string;
  a: string;
  /** Tamil wording (optional) */
  qTa: string | null;
  aTa: string | null;
  /** extra words people may use when asking (comma separated) */
  k: string;
}

export const SITE_SETTING_KEYS = [
  "contactPerson",
  "phone",
  "whatsapp",
  "email",
  "address",
  "businessHours",
  "instagramUrl",
  "facebookUrl",
  "youtubeUrl",
  "linkedinUrl",
  "announcement",
  "announcementLink",
] as const;
export type SiteSettingKey = (typeof SITE_SETTING_KEYS)[number];

export interface PublicCategory {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  sort: number;
}

export interface PublicCatalogue {
  /** Snapshot format. Bumped when fields are added so stale snapshots are rebuilt. */
  schema?: number;
  version: number;
  publishedAt: string;
  brands: PublicBrand[];
  categories: PublicCategory[];
  products: PublicProduct[];
  /** Admin-managed "In the field" gallery. */
  fieldPhotos?: PublicFieldPhoto[];
  /** Admin-written questions & answers (FAQ page and the website helper). */
  faqs?: PublicFaq[];
  /** Admin-managed business details & links (whitelisted keys only). */
  settings?: Partial<Record<SiteSettingKey, string>>;
}

export interface RevalidatedItem {
  productId: number;
  found: boolean;
  active: boolean;
  name: string | null;
  model: string | null;
  brand: string | null;
  price: PublicPrice | null;
  changed: boolean;
}

export type AdminRole = "owner" | "admin" | "price_editor" | "viewer";
/** What each role is called in the admin ("viewer" is the stored value for sales staff). */
export const ROLE_LABEL: Record<AdminRole, string> = { owner: "Owner", admin: "Admin", price_editor: "Price editor", viewer: "Sales staff" };

export interface AdminIdentity {
  /** AdminUsers.AdminId of the signed-in staff member */
  id: number;
  email: string;
  displayName: string | null;
  role: AdminRole;
}

export interface AdminPriceRow {
  productId: number;
  sku: string;
  name: string;
  model: string | null;
  brand: string;
  brandSlug: string;
  category: string;
  categorySlug: string;
  isActive: boolean;
  sellingPaise: number | null;
  mrpPaise: number | null;
  gstIncluded: boolean;
  gstRate: number | null;
  unit: string;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}

export interface PriceHistoryRow {
  historyId: number;
  oldPricePaise: number | null;
  newPricePaise: number | null;
  oldMrpPaise: number | null;
  newMrpPaise: number | null;
  oldGstRate: number | null;
  newGstRate: number | null;
  changedBy: string;
  changedAt: string;
  reason: string | null;
}

export interface AdminDashboard {
  activeProducts: number;
  inactiveProducts: number;
  brands: number;
  categories: { name: string; slug: string; count: number }[];
  missingPrices: number;
  missingImages: number;
  missingDatasheets: number;
  recentPrices: { productId: number; name: string; sellingPaise: number | null; updatedAt: string; updatedBy: string | null }[];
  recentActivity: { auditId: number; adminIdentity: string; action: string; entityType: string; entityId: string | null; createdAt: string }[];
  catalogueVersion: number | null;
  cataloguePublishedAt: string | null;
  newEnquiries: number;
  customers: number;
}

// ------------------------------------------------------------- admin content

export interface AdminBrand {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  website: string | null;
  logoKey: string | null;
  logoUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

export interface AdminCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
}

export interface AdminProductListRow {
  id: number;
  sku: string;
  slug: string;
  name: string;
  model: string | null;
  seriesName: string | null;
  brand: string;
  category: string;
  isActive: boolean;
  isFeatured: boolean;
  stock: StockStatus;
  onOffer: boolean;
  offerLabel: string | null;
  sellingPaise: number | null;
  images: number;
  hasDatasheet: boolean;
  updatedAt: string;
}

export interface AdminSpec {
  key: string;
  label: string;
  value: string;
  unit: string | null;
  group: string;
}

export interface AdminMedia {
  id: number;
  type: "image" | "datasheet" | "document";
  storageKey: string;
  url: string;
  alt: string | null;
  title: string | null;
  isPrimary: boolean;
  sortOrder: number;
}

export interface AdminProductDetail {
  id: number;
  sku: string;
  slug: string;
  name: string;
  brandId: number;
  categoryId: number;
  seriesKey: string | null;
  seriesName: string | null;
  variant: string | null;
  model: string | null;
  short: string | null;
  description: string | null;
  highlights: string[];
  isActive: boolean;
  isFeatured: boolean;
  stock: StockStatus;
  onOffer: boolean;
  offerLabel: string | null;
  updatedAt: string;
  updatedBy: string | null;
  specs: AdminSpec[];
  media: AdminMedia[];
  price: { sellingPaise: number | null; mrpPaise: number | null; gstRate: number | null; gstIncluded: boolean; unit: string; version: number } | null;
}

export interface AdminFaq {
  id: number;
  topic: string;
  question: string;
  answer: string;
  questionTa: string;
  answerTa: string;
  keywords: string;
  sortOrder: number;
  isActive: boolean;
}

export interface AdminFieldPhoto {
  id: number;
  storageKey: string;
  url: string;
  caption: string;
  tag: string;
  tall: boolean;
  sortOrder: number;
  isActive: boolean;
}

export interface AdminUserRow {
  id: number;
  email: string;
  mobile: string | null;
  hasPassword: boolean;
  mustChangePassword: boolean;
  displayName: string | null;
  role: AdminRole;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

// ------------------------------------------------------------------ customers

export type EnquiryStatus = "new" | "contacted" | "quoted" | "won" | "lost" | "cancelled";
export const ENQUIRY_STATUSES: EnquiryStatus[] = ["new", "contacted", "quoted", "won", "lost", "cancelled"];
/** The pipeline staff work with: New -> Contacted -> Quoted -> Won | Not won ('lost'). 'cancelled' is legacy (merged into Not won). */
export const PIPELINE_STATUSES = ["new", "contacted", "quoted", "won", "lost"] as const satisfies readonly EnquiryStatus[];

export interface CustomerProfile {
  id: number;
  name: string;
  mobile: string;
  email: string | null;
  business: string | null;
  city: string | null;
  points: number;
  createdAt: string;
}

export interface EnquiryItemView {
  productId: number | null;
  name: string;
  brand: string | null;
  model: string | null;
  quantity: number;
  unitPaise: number | null;
  unit: string | null;
  gstRate: number | null;
  gstIncluded: boolean;
}

export interface EnquiryView {
  id: number;
  reference: string;
  status: EnquiryStatus;
  createdAt: string;
  totalPaise: number | null;
  pricesVerified: boolean;
  location: string;
  comments: string | null;
  items: EnquiryItemView[];
}

export interface RewardEntry {
  id: number;
  points: number;
  reason: string;
  enquiryReference: string | null;
  createdAt: string;
}

export type EnquirySource = "website" | "phone" | "whatsapp" | "visit";

export interface AdminEnquiryRow extends EnquiryView {
  source: EnquirySource;
  /** staff member who logged it (null for website enquiries) */
  createdBy: { id: number; name: string } | null;
  /** staff member responsible for it (assigned / picked up; the creator for staff-logged enquiries) */
  owner: { id: number; name: string } | null;
  /** why it was not won */
  closedReason: ClosedReason | null;
  closedNote: string | null;
  closedAt: string | null;
  /** next follow-up date (YYYY-MM-DD), open enquiries only */
  followUpOn: string | null;
  /** customer loyalty points from this sale: in their account, or waiting because they have no account yet */
  points: { credited: number; waiting: number };
  /** the most recent quotation made from this enquiry */
  latestQuote: { id: number; number: string; status: "draft" | "sent" | "accepted" | "declined"; validUntil: string; totalPaise: number } | null;
  /** final sale value in paise when won */
  salePaise: number | null;
  /** total of the latest quotation made from this enquiry (pre-fills the sale value) */
  quotePaise: number | null;
  quoteCount: number;
  customerId: number | null;
  customerName: string | null;
  contactName: string;
  business: string | null;
  mobile: string;
  adminNotes: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface AdminCustomerRow {
  id: number;
  name: string;
  mobile: string;
  email: string | null;
  business: string | null;
  city: string | null;
  isActive: boolean;
  points: number;
  enquiries: number;
  createdAt: string;
  lastLoginAt: string | null;
}

/** Enquiries logged per staff member, bucketed by day / month / year (India time). */
/** Why an enquiry was not won. 'duplicate' does not count against the staff member in Performance. */
export const CLOSED_REASONS = ["price", "bought_elsewhere", "postponed", "unavailable", "delivery_time", "no_response", "budget", "order_cancelled", "duplicate", "other"] as const;
export type ClosedReason = (typeof CLOSED_REASONS)[number];
export const CLOSED_REASON_LABEL: Record<ClosedReason, string> = {
  price: "Price too high",
  bought_elsewhere: "Bought elsewhere",
  postponed: "Postponed / not ready",
  unavailable: "Product not available",
  delivery_time: "Delivery time too long",
  no_response: "No response from customer",
  budget: "Budget / financing",
  order_cancelled: "Order cancelled by customer",
  duplicate: "Duplicate / wrong entry",
  other: "Other",
};

/** One step in an enquiry's history (stage change or (re)assignment). */
export interface EnquiryEvent {
  id: number;
  kind: "created" | "status" | "assigned";
  fromStatus: EnquiryStatus | null;
  toStatus: EnquiryStatus | null;
  assignedTo: string | null;
  reason: ClosedReason | null;
  note: string | null;
  salePaise: number | null;
  by: string | null;
  at: string;
}

/** Sales pipeline per staff member (owner / admin only). Counts enquiries created in the date range. */
export interface EnquiryStats {
  period: "day" | "month" | "year";
  from: string;
  to: string;
  source: "all" | "website" | "staff";
  staff: {
    id: number;
    name: string;
    total: number;
    contacted: number;
    quoted: number;
    won: number;
    /** not won (excluding duplicates) */
    lost: number;
    open: number;
    /** open enquiries whose follow-up date has passed (right now, whatever the date range) */
    overdue: number;
    salePaise: number;
    avgDaysToQuote: number | null;
    avgDaysToClose: number | null;
  }[];
  /** enquiries in the range nobody is responsible for yet */
  unassigned: number;
  buckets: { bucket: string; staffId: number | null; total: number; won: number; salePaise: number }[];
  reasons: { reason: ClosedReason; count: number; staffId: number | null }[];
  websiteTotal: number;
}

/** The signed-in staff member's day: follow-ups due, new enquiries to pick up, quotations waiting. */
export interface MyDay {
  today: string;
  followUps: { id: number; reference: string; name: string; mobile: string; status: EnquiryStatus; followUpOn: string }[];
  /** stage changes, assignments and logs this person made today (India time) */
  doneToday: number;
  /** open enquiries of mine without a follow-up date */
  noDate: number;
  unassigned: { id: number; reference: string; name: string; source: EnquirySource; createdAt: string }[];
  quotes: { id: number; number: string; customerName: string; customerMobile: string | null; totalPaise: number; status: "draft" | "sent"; validUntil: string }[];
}
