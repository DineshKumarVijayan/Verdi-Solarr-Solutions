import { z } from "zod";

/* Staff bonus: a percentage of each sale a staff member wins. Money is integer paise; rates are basis
 * points (1% = 100 bp) so no floating point is ever used for amounts. */

export type BonusStatus = "pending" | "approved" | "paid";
export type BonusKind = "sale" | "reversal" | "adjustment";

/** Bonus for a sale: rate x sale, rounded half up to the nearest paisa. */
export function bonusPaise(salePaise: number, rateBasisPoints: number): number {
  return Math.round((salePaise * rateBasisPoints) / 10_000);
}

/** "2.5" -> 250 basis points; null for empty, NaN for invalid. */
export function percentToBasisPoints(input: string): number | null {
  const t = input.trim().replace(/%$/, "").trim();
  if (!t) return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return Number.NaN;
  const [w, f = ""] = t.split(".");
  const bp = Number(w) * 100 + Number(f.padEnd(2, "0"));
  return bp <= 10_000 ? bp : Number.NaN;
}
export const basisPointsToPercent = (bp: number | null) => (bp == null ? "" : (bp / 100).toFixed(2).replace(/\.?0+$/, ""));

export interface BonusEntry {
  id: number;
  staffId: number;
  staffName: string;
  enquiryId: number | null;
  enquiryRef: string | null;
  customer: string | null;
  kind: BonusKind;
  salePaise: number | null;
  rateBasisPoints: number | null;
  amountPaise: number;
  reason: string | null;
  status: BonusStatus;
  approvedBy: string | null;
  payoutId: number | null;
  createdBy: string;
  createdAt: string;
}

export interface BonusPayout {
  id: number;
  staffId: number;
  staffName: string;
  amountPaise: number;
  entryCount: number;
  paidOn: string;
  method: string | null;
  reference: string | null;
  note: string | null;
  status: "paid" | "cancelled";
  cancelReason: string | null;
  paidBy: string;
  createdAt: string;
}

export interface BonusStaffSummary {
  staffId: number;
  name: string;
  /** own rate, or null when the default applies */
  rateBasisPoints: number | null;
  effectiveBasisPoints: number;
  pendingPaise: number;
  approvedPaise: number;
  /** pending + approved, not yet paid: what a payout would settle */
  unpaidPaise: number;
  unpaidCount: number;
  paidPaise: number;
}

export interface BonusOverview {
  defaultBasisPoints: number | null;
  staff: BonusStaffSummary[];
}

export const PAYOUT_METHODS = ["With salary", "Bank transfer", "UPI", "Cash", "Cheque"] as const;

export const BonusRateSchema = z
  .object({
    staffId: z.number().int().positive().nullable(), // null = default for everyone
    rateBasisPoints: z.number().int().min(0).max(10_000).nullable(), // null on a staff member = use the default
  })
  .strict();

export const BonusApproveSchema = z.object({ entryIds: z.array(z.number().int().positive()).min(1).max(500) }).strict();

export const BonusAdjustmentSchema = z
  .object({
    staffId: z.number().int().positive(),
    amountPaise: z
      .number()
      .int()
      .refine((n) => n !== 0, "Enter an amount")
      .refine((n) => Math.abs(n) <= 100_000_000_00, "Amount is too large"),
    reason: z.string().trim().min(3, "Say why (shown to the staff member)").max(300),
  })
  .strict();

export const BonusPayoutSchema = z
  .object({
    staffId: z.number().int().positive(),
    entryIds: z.array(z.number().int().positive()).min(1, "Choose at least one bonus to pay").max(1000),
    /** the total the person saw before confirming; refused if the unpaid amount changed meanwhile */
    expectedPaise: z.number().int(),
    paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the payment date"),
    method: z.string().trim().max(40).default(""),
    reference: z.string().trim().max(120).default(""),
    note: z.string().trim().max(300).default(""),
  })
  .strict();

export const BonusCancelSchema = z.object({ reason: z.string().trim().min(3, "Say why this payment is cancelled").max(300) }).strict();
