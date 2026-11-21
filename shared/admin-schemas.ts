import { z } from "zod";
import { EnquiryCustomerSchema, MAX_PAISE } from "./schemas";

// ======================================================================
// Admin content management
// ======================================================================

const paise = z.number().int("Amount must be whole paise").min(0, "Price cannot be negative").max(MAX_PAISE, "Price is unrealistically large");

const slug = z
  .string()
  .trim()
  .min(2, "Slug is too short")
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and hyphens only");

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const storageKey = z
  .string()
  .trim()
  .max(300)
  .regex(/^(\/[a-zA-Z0-9/_.-]+|r2:[a-zA-Z0-9][a-zA-Z0-9/_.-]*)$/, "Invalid file reference")
  .refine((v) => !v.includes(".."), "Invalid file reference");

const optHttpsUrl = z
  .string()
  .trim()
  .max(300)
  .regex(/^(https:\/\/[^\s"'<>]+)?$/, "Must be a full https:// link")
  .nullish()
  .transform((v) => (v ? v : null));

/** Turn any name into a URL slug ("Anchor 540 Wp TOPCon" -> "anchor-540-wp-topcon"). */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s_-]/g, " ")
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/, "");
}

/** Spec key from a label ("Max. power (Pmax)" -> "max_power_pmax"). */
export function specKeyFrom(label: string): string {
  return slugify(label).replace(/-/g, "_").slice(0, 60) || "spec";
}

export const BrandInputSchema = z
  .object({
    name: z.string().trim().min(1, "Brand name is required").max(80),
    slug,
    description: optText(1000),
    website: optHttpsUrl,
    logoKey: storageKey.or(z.literal("")).nullish().transform((v) => (v ? v : null)),
    sortOrder: z.number().int().min(0).max(100000).default(0),
    isActive: z.boolean().default(true),
  })
  .strict();
export type BrandInput = z.infer<typeof BrandInputSchema>;

export const CategoryInputSchema = z
  .object({
    name: z.string().trim().min(1, "Category name is required").max(80),
    slug,
    description: optText(1000),
    sortOrder: z.number().int().min(0).max(100000).default(0),
    isActive: z.boolean().default(true),
  })
  .strict();
export type CategoryInput = z.infer<typeof CategoryInputSchema>;

export const SpecInputSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1, "Key is required")
      .max(60)
      .regex(/^[a-z0-9_]+$/, "Spec keys use lowercase letters, numbers and _"),
    label: z.string().trim().min(1, "Label is required").max(120),
    value: z.string().trim().min(1, "Value is required").max(500),
    unit: optText(30),
    group: z
      .string()
      .trim()
      .max(60)
      .default("General")
      .transform((v) => v || "General"),
  })
  .strict();

export const ProductPriceInputSchema = z
  .object({
    sellingPricePaise: paise.nullable(),
    mrpPaise: paise.nullable(),
    gstIncluded: z.boolean(),
    gstRate: z.union([z.literal(0), z.literal(5), z.literal(12), z.literal(18), z.literal(28)]).nullable(),
    priceUnit: z.string().trim().min(1).max(40),
  })
  .strict()
  .refine((v) => v.mrpPaise === null || v.sellingPricePaise === null || v.sellingPricePaise <= v.mrpPaise, {
    message: "Selling price cannot exceed MRP",
    path: ["sellingPricePaise"],
  });

export const ProductInputSchema = z
  .object({
    sku: z
      .string()
      .trim()
      .min(2, "SKU is required")
      .max(60)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, "SKU may use letters, numbers and . _ / -"),
    slug,
    name: z.string().trim().min(2, "Product name is required").max(160),
    brandId: z.number().int().positive("Choose a brand"),
    categoryId: z.number().int().positive("Choose a category"),
    seriesKey: optText(80),
    seriesName: optText(160),
    variant: optText(80),
    model: optText(120),
    short: optText(300),
    description: optText(5000),
    highlights: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
    isActive: z.boolean().default(true),
    isFeatured: z.boolean().default(false),
    specs: z
      .array(SpecInputSchema)
      .max(150)
      .default([])
      .refine((a) => new Set(a.map((s) => s.key)).size === a.length, "Each specification key must be unique"),
    /** Only used when creating a product (later price changes go through the Prices page, with history). */
    price: ProductPriceInputSchema.optional(),
    /** Optimistic concurrency token for updates (the product's UpdatedAt as last loaded). */
    expectedUpdatedAt: z.string().max(40).optional(),
  })
  .strict();
export type ProductInput = z.input<typeof ProductInputSchema>;

export const MediaInputSchema = z
  .object({
    type: z.enum(["image", "datasheet", "document"]),
    storageKey,
    alt: optText(200),
    title: optText(200),
    isPrimary: z.boolean().default(false),
  })
  .strict();

export const MediaUpdateSchema = z
  .object({
    alt: optText(200),
    title: optText(200),
    isPrimary: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(100000).optional(),
  })
  .strict();

export const FieldPhotoInputSchema = z
  .object({
    storageKey,
    caption: z.string().trim().min(2, "Caption is required").max(160),
    tag: z.string().trim().min(2, "Tag is required").max(40),
    tall: z.boolean().default(false),
    sortOrder: z.number().int().min(0).max(100000).default(0),
    isActive: z.boolean().default(true),
  })
  .strict();

export const AdminUserInputSchema = z
  .object({
    /** Optional: staff sign in with their mobile number. */
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(200)
      .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email")
      .default(""),
    displayName: optText(80),
    role: z.enum(["owner", "admin", "price_editor", "viewer"]),
    isActive: z.boolean().default(true),
    mobile: z
      .string()
      .trim()
      .transform((v, ctx) => {
        const n = normaliseMobile(v);
        if (!n) {
          ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit Indian mobile number" });
          return z.NEVER;
        }
        return n;
      }),
    /** Required when creating; when editing, empty = keep the current password. */
    password: z
      .string()
      .max(128)
      .optional()
      .refine((v) => !v || v.length >= 8, "Use at least 8 characters"),
  })
  .strict();

// ======================================================================
// Customer accounts
// ======================================================================

/** Normalise an Indian mobile number to 12 digits (91XXXXXXXXXX). Returns null if invalid. */
export function normaliseMobile(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = "91" + d;
  if (!/^91[6-9]\d{9}$/.test(d)) return null;
  return d;
}

/** 919876543210 -> "+91 98765 43210" */
export function formatMobile(n: string): string {
  return /^91\d{10}$/.test(n) ? `+91 ${n.slice(2, 7)} ${n.slice(7)}` : n;
}

const mobile = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normaliseMobile(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit Indian mobile number" });
      return z.NEVER;
    }
    return n;
  });

export const PASSWORD_MIN = 8;
const password = z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`).max(128, "Password is too long");

const optEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email")
  .nullish()
  .transform((v) => (v ? v : null));

export const RegisterSchema = z
  .object({
    name: z.string().trim().min(2, "Please enter your name").max(80),
    mobile,
    email: optEmail,
    business: optText(120),
    city: optText(80),
    password,
  })
  .strict();
export type RegisterInput = z.input<typeof RegisterSchema>;

export const LoginSchema = z
  .object({
    login: z.string().trim().min(3, "Enter your mobile number or email").max(200),
    password: z.string().min(1, "Enter your password").max(128),
  })
  .strict();

export const ProfileUpdateSchema = z
  .object({
    name: z.string().trim().min(2, "Please enter your name").max(80),
    email: optEmail,
    business: optText(120),
    city: optText(80),
  })
  .strict();

export const PasswordChangeSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(128),
    newPassword: password,
  })
  .strict();

export const AdminPasswordChangeSchema = z
  .object({
    login: z.string().trim().min(3, "Enter your mobile number").max(200),
    currentPassword: z.string().min(1, "Enter your current or temporary password").max(128),
    newPassword: password,
  })
  .strict();

export const PasswordResetSchema = z
  .object({
    token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/, "This reset link is invalid"),
    newPassword: password,
  })
  .strict();

export const EnquiryCreateSchema = z
  .object({
    customer: EnquiryCustomerSchema,
    items: z
      .array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(100000) }).strict())
      .min(1)
      .max(50),
    pricesVerified: z.boolean(),
  })
  .strict();
export type EnquiryCreate = z.infer<typeof EnquiryCreateSchema>;

/** An enquiry a staff member logs from a phone call, WhatsApp chat or visit. Products are optional. */
export const StaffEnquirySchema = z
  .object({
    source: z.enum(["phone", "whatsapp", "visit"]),
    name: z.string().trim().min(2, "Enter the customer's name").max(80),
    mobile: z.string().trim().regex(/^\+?\d[\d\s-]{8,15}\d$/, "Enter a valid mobile number"),
    business: z.string().trim().max(120).optional().default(""),
    location: z.string().trim().min(2, "Enter the customer's location").max(120),
    need: z.string().trim().max(1000).optional().default(""),
    status: z.enum(["new", "contacted", "quoted"]).default("contacted"),
    items: z
      .array(z.object({ productId: z.number().int().positive(), quantity: z.number().int().min(1).max(100000) }).strict())
      .max(50)
      .default([]),
  })
  .strict();
export type StaffEnquiry = z.infer<typeof StaffEnquirySchema>;

const CLOSED = ["price", "bought_elsewhere", "postponed", "unavailable", "delivery_time", "no_response", "budget", "other"] as const;
/** Moving an enquiry along the pipeline. Lost / cancelled need a reason ('other' needs a note); won needs the sale value. */
export const EnquiryAdminUpdateSchema = z
  .object({
    status: z.enum(["new", "contacted", "quoted", "won", "lost", "cancelled"]).optional(),
    adminNotes: optText(2000),
    closedReason: z.enum(CLOSED).nullable().optional(),
    closedNote: z.string().trim().max(500).nullable().optional(),
    salePaise: z.number().int().min(1, "Enter the sale amount").max(1_000_000_000_00).nullable().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.status === "lost" || v.status === "cancelled") && !v.closedReason) ctx.addIssue({ code: "custom", path: ["closedReason"], message: "Choose why it was lost or cancelled" });
    if ((v.status === "lost" || v.status === "cancelled") && v.closedReason === "other" && !v.closedNote?.trim()) ctx.addIssue({ code: "custom", path: ["closedNote"], message: "Describe the reason" });
    if (v.status === "won" && !v.salePaise) ctx.addIssue({ code: "custom", path: ["salePaise"], message: "Enter the final sale amount" });
  });

/** Owner/admin assign (adminId, or null to unassign); any staff member can take an unassigned enquiry. */
export const EnquiryAssignSchema = z.union([z.object({ adminId: z.number().int().positive().nullable() }).strict(), z.object({ take: z.literal(true) }).strict()]);

export const PointsAdjustSchema = z
  .object({
    points: z
      .number()
      .int()
      .min(-10_000_000)
      .max(10_000_000)
      .refine((n) => n !== 0, "Points cannot be zero"),
    reason: z.string().trim().min(3, "Please give a reason").max(200),
    enquiryId: z.number().int().positive().nullish(),
  })
  .strict();

/** Zod issues -> [{path, message}] for API error details. */
export function issues(e: z.ZodError): { path: string; message: string }[] {
  return e.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}
