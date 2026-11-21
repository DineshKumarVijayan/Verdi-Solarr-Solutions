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

export interface AdminIdentity {
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
  updatedAt: string;
  updatedBy: string | null;
  specs: AdminSpec[];
  media: AdminMedia[];
  price: { sellingPaise: number | null; mrpPaise: number | null; gstRate: number | null; gstIncluded: boolean; unit: string; version: number } | null;
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
export interface EnquiryStats {
  period: "day" | "month" | "year";
  from: string;
  to: string;
  staff: { id: number; name: string; total: number; won: number; quoted: number; lost: number }[];
  buckets: { bucket: string; staffId: number; total: number; won: number }[];
  websiteTotal: number;
}
