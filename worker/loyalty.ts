import { LoyaltyRateSchema, loyaltyPoints, type LoyaltySettings } from "../shared/loyalty";
import { issues, normaliseMobile } from "../shared/admin-schemas";
import type { AdminIdentity, AdminRole } from "../shared/types";
import type { Env } from "./env";
import { HttpError, nowIso } from "./http";

/* Customer loyalty points earned on sales. The rate is a % of the sale (owner/admin change it);
 * RewardTransactions stays append-only: a sale that is undone or corrected gets a reversing row. */

const MANAGERS: AdminRole[] = ["owner", "admin"];

export async function loyaltyRate(env: Env): Promise<LoyaltySettings> {
  const r = await env.DB.prepare("SELECT RateBasisPoints, SetBy, CreatedAt FROM LoyaltyRates ORDER BY RateId DESC LIMIT 1").first<{ RateBasisPoints: number; SetBy: string; CreatedAt: string }>();
  return { rateBasisPoints: r?.RateBasisPoints ?? 0, setBy: r?.SetBy ?? null, setAt: r?.CreatedAt ?? null };
}

export async function setLoyaltyRate(env: Env, admin: AdminIdentity, body: unknown): Promise<LoyaltySettings> {
  if (!MANAGERS.includes(admin.role)) throw new HttpError(403, "forbidden", "Only the owner or an admin can change the loyalty percentage.");
  const r = LoyaltyRateSchema.safeParse(body);
  if (!r.success) throw new HttpError(422, "validation", r.error.issues[0]?.message ?? "Please correct the value.", issues(r.error));
  const before = await loyaltyRate(env);
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO LoyaltyRates (RateBasisPoints, SetBy, CreatedAt) VALUES (?1, ?2, ?3)").bind(r.data.rateBasisPoints, admin.email, now),
    env.DB.prepare("INSERT INTO AuditLogs (AdminIdentity, Action, EntityType, EntityId, BeforeValue, AfterValue, CreatedAt) VALUES (?1, 'loyalty.rate', 'Loyalty', 'rate', ?2, ?3, ?4)").bind(
      admin.email,
      JSON.stringify({ rateBasisPoints: before.rateBasisPoints }),
      JSON.stringify(r.data),
      now,
    ),
  ]);
  return loyaltyRate(env);
}

/** The customer account a sale belongs to: the enquiry's account, else an account with the same mobile number. */
async function saleCustomer(env: Env, enquiryId: number): Promise<{ id: number; reference: string } | null> {
  const e = await env.DB.prepare("SELECT CustomerId, Mobile, Reference FROM Enquiries WHERE EnquiryId = ?1").bind(enquiryId).first<{ CustomerId: number | null; Mobile: string; Reference: string }>();
  if (!e) return null;
  if (e.CustomerId) return { id: e.CustomerId, reference: e.Reference };
  // staff-logged enquiries keep the number as typed; accounts store it normalised (91XXXXXXXXXX)
  const mobile = normaliseMobile(e.Mobile ?? "");
  if (!mobile) return null;
  const c = await env.DB.prepare("SELECT CustomerId FROM Customers WHERE Mobile = ?1").bind(mobile).first<{ CustomerId: number }>();
  return c ? { id: c.CustomerId, reference: e.Reference } : null;
}

/**
 * Statements that keep a customer's sale points in step with an enquiry: call when its status or sale
 * value changes. The current sale credit (if any) is reversed and a new one is added when it is won.
 */
export async function loyaltyStatementsForSale(env: Env, admin: AdminIdentity, enquiryId: number, now: { status: string; salePaise: number | null }, at: string): Promise<D1PreparedStatement[]> {
  const active = await env.DB.prepare(
    `SELECT s.TransactionId, s.CustomerId, s.SalePaise, s.Points FROM RewardTransactions s
     WHERE s.EnquiryId = ?1 AND s.Kind = 'sale' AND NOT EXISTS (SELECT 1 FROM RewardTransactions r WHERE r.ReversesId = s.TransactionId)
     ORDER BY s.TransactionId DESC LIMIT 1`,
  )
    .bind(enquiryId)
    .first<{ TransactionId: number; CustomerId: number; SalePaise: number; Points: number }>();
  const wantSale = now.status === "won" && !!now.salePaise;
  if (active && wantSale && active.SalePaise === now.salePaise) return [];
  const customer = wantSale || active ? await saleCustomer(env, enquiryId) : null;
  const stmts: D1PreparedStatement[] = [];
  if (active) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO RewardTransactions (CustomerId, Points, Reason, EnquiryId, Kind, SalePaise, ReversesId, CreatedBy, CreatedAt)
         VALUES (?1, ?2, ?3, ?4, 'reversal', ?5, ?6, ?7, ?8)`,
      ).bind(active.CustomerId, -active.Points, wantSale ? "Sale amount corrected" : "Sale cancelled", enquiryId, active.SalePaise, active.TransactionId, admin.email, at),
    );
  }
  if (wantSale && customer) {
    const { rateBasisPoints: bp } = await loyaltyRate(env);
    const pts = loyaltyPoints(now.salePaise!, bp);
    if (pts > 0)
      stmts.push(
        env.DB.prepare(
          `INSERT INTO RewardTransactions (CustomerId, Points, Reason, EnquiryId, Kind, SalePaise, RateBasisPoints, CreatedBy, CreatedAt)
           VALUES (?1, ?2, ?3, ?4, 'sale', ?5, ?6, ?7, ?8)`,
        ).bind(customer.id, pts, `Purchase ${customer.reference} (${bp / 100}% of sale)`, enquiryId, now.salePaise, bp, admin.email, at),
      );
  }
  return stmts;
}
