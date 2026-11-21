// Quotation contracts and arithmetic shared by the Worker (authoritative) and the admin UI (live totals).
// Money is integer paise throughout; percentage discounts are basis points (1250 = 12.5 %).

import { z } from "zod";

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "declined"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export type DiscountType = "none" | "pct" | "amount";

/** Admin-only quotation settings (kept out of the public catalogue snapshot). */
export const QUOTE_SETTING_KEYS = ["quoteGstin", "quoteTerms", "quoteBank", "quoteSignatory", "quoteValidDays", "quoteUpiQr", "quoteUpiId"] as const;

/** Public URL of an uploaded file (storage key "r2:logo/2026/11/abc.png" -> /api/media/logo/2026/11/abc.png). */
export const mediaPath = (key: string) => (key.startsWith("r2:") ? `/api/media/${key.slice(3)}` : key);
export type QuoteSettingKey = (typeof QUOTE_SETTING_KEYS)[number];
export type QuoteSettings = Partial<Record<QuoteSettingKey, string>>;

/** Generic terms used when the business has not entered its own (no invented commitments). */
export const DEFAULT_TERMS = ["Prices are quoted in Indian Rupees.", "GST is as indicated against each item.", "Prices and availability are subject to confirmation at the time of order."].join("\n");

const MAX_PAISE = 100_000_000_000;

export const QuoteItemInputSchema = z
  .object({
    productId: z.number().int().positive().nullable(),
    name: z.string().trim().max(200).default(""), // used for custom lines only
    unit: z.string().trim().max(40).default(""), // custom lines only
    qty: z.number().int().min(1, "Quantity must be at least 1.").max(100000),
    unitPaise: z.number().int().min(0).max(MAX_PAISE).nullable(), // used only when the product has no listed price, or for custom lines
    discountType: z.enum(["none", "pct", "amount"]),
    discountValue: z.number().int().min(0).max(MAX_PAISE),
  })
  .strict();

export const QuoteInputSchema = z
  .object({
    customerName: z.string().trim().min(1, "Enter the customer's name.").max(120),
    customerCompany: z.string().trim().max(160).default(""),
    customerMobile: z.string().trim().max(20).default(""),
    customerEmail: z.union([z.literal(""), z.string().trim().email("Enter a valid email address.").max(160)]).default(""),
    customerAddress: z.string().trim().max(400).default(""),
    notes: z.string().trim().max(2000).default(""),
    validDays: z.number().int().min(1).max(365),
    items: z.array(QuoteItemInputSchema).min(1, "Add at least one product.").max(100),
    /** the enquiry this quotation answers (set when created from Enquiries) */
    enquiryId: z.number().int().positive().nullable().optional(),
  })
  .strict();
export type QuoteInput = z.infer<typeof QuoteInputSchema>;

export interface QuoteItem {
  productId: number | null;
  name: string;
  brand: string | null;
  model: string | null;
  unit: string;
  gstNote: string | null;
  imageUrl: string | null;
  qty: number;
  unitPaise: number;
  discountType: DiscountType;
  discountValue: number;
  discountPaise: number;
  lineTotalPaise: number;
}

export interface Quote {
  id: number;
  number: string;
  status: QuoteStatus;
  customerName: string;
  customerCompany: string | null;
  customerMobile: string | null;
  customerEmail: string | null;
  customerAddress: string | null;
  notes: string | null;
  validDays: number;
  subtotalPaise: number;
  discountPaise: number;
  totalPaise: number;
  shareUrl: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
  /** staff member the quotation belongs to */
  owner: { id: number; name: string } | null;
  /** the enquiry it answers */
  enquiryId: number | null;
  enquiryReference: string | null;
  items: QuoteItem[];
}

export type QuoteRow = Omit<Quote, "items" | "customerAddress" | "notes"> & { itemCount: number };

/** Discount for one line, clamped so a line can never go below zero. */
export function lineAmounts(unitPaise: number, qty: number, type: DiscountType, value: number) {
  const gross = unitPaise * qty;
  const raw = type === "pct" ? Math.round((gross * Math.min(value, 10000)) / 10000) : type === "amount" ? value : 0;
  const discount = Math.min(Math.max(raw, 0), gross);
  return { gross, discount, total: gross - discount };
}

export function quoteTotals(lines: { unitPaise: number; qty: number; discountType: DiscountType; discountValue: number }[]) {
  let subtotal = 0;
  let discount = 0;
  for (const l of lines) {
    const a = lineAmounts(l.unitPaise, l.qty, l.discountType, l.discountValue);
    subtotal += a.gross;
    discount += a.discount;
  }
  return { subtotal, discount, total: subtotal - discount };
}

export function validUntil(createdAt: string, days: number): Date {
  const d = new Date(createdAt);
  d.setDate(d.getDate() + days);
  return d;
}

/** A sent (or draft) quotation past its validity date. Shown as "Expired"; not a stored status. */
export function isExpired(q: { status: QuoteStatus; createdAt: string; validDays: number }, now = new Date()): boolean {
  return (q.status === "sent" || q.status === "draft") && validUntil(q.createdAt, q.validDays).getTime() < now.getTime();
}
