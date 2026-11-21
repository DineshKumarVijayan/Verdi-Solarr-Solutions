import { LoyaltyRateSchema, loyaltyPoints, type LoyaltySettings, type PendingReward } from "../shared/loyalty";
import { issues, normaliseMobile } from "../shared/admin-schemas";
import type { AdminIdentity, AdminRole } from "../shared/types";
import type { Env } from "./env";
import { HttpError, nowIso } from "./http";

/* Customer loyalty points earned on sales. The rate is a % of the sale (owner/admin change it).
 * Points go to the customer's account; when the buyer has no account yet they wait against the mobile
 * number (PendingRewards) and move into the account when that number registers or signs in.
 * Both ledgers are append-only: a sale that is undone or corrected gets a reversing row. */

const MANAGERS: AdminRole[] = ["owner", "admin"];
const requireManager = (admin: AdminIdentity, what: string) => {
  if (!MANAGERS.includes(admin.role)) throw new HttpError(403, "forbidden", `Only the owner or an admin can ${what}.`);
};

export async function loyaltyRate(env: Env): Promise<LoyaltySettings> {
  const r = await env.DB.prepare("SELECT RateBasisPoints, SetBy, CreatedAt FROM LoyaltyRates ORDER BY RateId DESC LIMIT 1").first<{ RateBasisPoints: number; SetBy: string; CreatedAt: string }>();
  return { rateBasisPoints: r?.RateBasisPoints ?? 0, setBy: r?.SetBy ?? null, setAt: r?.CreatedAt ?? null };
}

export async function setLoyaltyRate(env: Env, admin: AdminIdentity, body: unknown): Promise<LoyaltySettings> {
  requireManager(admin, "change the loyalty percentage");
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

/** Who a sale's points belong to: the enquiry's account, else an account with the same mobile, else the mobile itself. */
async function saleTarget(env: Env, enquiryId: number): Promise<{ customerId: number | null; mobile: string | null; name: string; reference: string } | null> {
  const e = await env.DB.prepare("SELECT CustomerId, Mobile, ContactName, Reference FROM Enquiries WHERE EnquiryId = ?1").bind(enquiryId).first<{ CustomerId: number | null; Mobile: string; ContactName: string; Reference: string }>();
  if (!e) return null;
  // staff-logged enquiries keep the number as typed; accounts store it normalised (91XXXXXXXXXX)
  const mobile = normaliseMobile(e.Mobile ?? "");
  if (e.CustomerId) return { customerId: e.CustomerId, mobile, name: e.ContactName, reference: e.Reference };
  const c = mobile ? await env.DB.prepare("SELECT CustomerId FROM Customers WHERE Mobile = ?1").bind(mobile).first<{ CustomerId: number }>() : null;
  return { customerId: c?.CustomerId ?? null, mobile, name: e.ContactName, reference: e.Reference };
}

/**
 * Statements that keep a sale's loyalty points in step with its enquiry: call whenever the enquiry's status or
 * sale value changes. The current credit (in the account or waiting) is reversed and a new one is added when
 * the enquiry is won: into the account when the buyer has one, otherwise waiting against their mobile number.
 */
export async function loyaltyStatementsForSale(env: Env, admin: AdminIdentity, enquiryId: number, now: { status: string; salePaise: number | null }, at: string): Promise<D1PreparedStatement[]> {
  const [credit, waiting] = await env.DB.batch([
    env.DB.prepare(
      `SELECT s.TransactionId AS id, s.CustomerId, s.SalePaise, s.Points FROM RewardTransactions s
       WHERE s.EnquiryId = ?1 AND s.Kind = 'sale' AND NOT EXISTS (SELECT 1 FROM RewardTransactions r WHERE r.ReversesId = s.TransactionId)
       ORDER BY s.TransactionId DESC LIMIT 1`,
    ).bind(enquiryId),
    env.DB.prepare(
      `SELECT s.PendingId AS id, s.Mobile, s.SalePaise, s.Points FROM PendingRewards s
       WHERE s.EnquiryId = ?1 AND s.Kind = 'sale' AND s.ClaimedAt IS NULL AND NOT EXISTS (SELECT 1 FROM PendingRewards r WHERE r.ReversesId = s.PendingId)
       ORDER BY s.PendingId DESC LIMIT 1`,
    ).bind(enquiryId),
  ]);
  const inAccount = credit.results[0] as { id: number; CustomerId: number; SalePaise: number; Points: number } | undefined;
  const pending = waiting.results[0] as { id: number; Mobile: string; SalePaise: number; Points: number } | undefined;
  const wantSale = now.status === "won" && !!now.salePaise;
  const target = wantSale || inAccount || pending ? await saleTarget(env, enquiryId) : null;
  // nothing changed: same sale, same place
  if (wantSale && target) {
    if (inAccount && !pending && inAccount.SalePaise === now.salePaise && inAccount.CustomerId === target.customerId) return [];
    if (pending && !inAccount && pending.SalePaise === now.salePaise && !target.customerId && pending.Mobile === target.mobile) return [];
  }
  const why = wantSale ? "Sale amount corrected" : "Sale cancelled";
  const stmts: D1PreparedStatement[] = [];
  if (inAccount)
    stmts.push(
      env.DB.prepare(
        `INSERT INTO RewardTransactions (CustomerId, Points, Reason, EnquiryId, Kind, SalePaise, ReversesId, CreatedBy, CreatedAt)
         VALUES (?1, ?2, ?3, ?4, 'reversal', ?5, ?6, ?7, ?8)`,
      ).bind(inAccount.CustomerId, -inAccount.Points, why, enquiryId, inAccount.SalePaise, inAccount.id, admin.email, at),
    );
  if (pending)
    stmts.push(
      env.DB.prepare(
        `INSERT INTO PendingRewards (Mobile, ContactName, Points, Reason, EnquiryId, Kind, SalePaise, ReversesId, CreatedBy, CreatedAt)
         VALUES (?1, ?2, ?3, ?4, ?5, 'reversal', ?6, ?7, ?8, ?9)`,
      ).bind(pending.Mobile, target?.name ?? null, -pending.Points, why, enquiryId, pending.SalePaise, pending.id, admin.email, at),
    );
  if (wantSale && target) {
    const { rateBasisPoints: bp } = await loyaltyRate(env);
    const pts = loyaltyPoints(now.salePaise!, bp);
    const reason = `Purchase ${target.reference} (${bp / 100}% of sale)`;
    if (pts > 0 && target.customerId)
      stmts.push(
        env.DB.prepare(
          `INSERT INTO RewardTransactions (CustomerId, Points, Reason, EnquiryId, Kind, SalePaise, RateBasisPoints, CreatedBy, CreatedAt)
           VALUES (?1, ?2, ?3, ?4, 'sale', ?5, ?6, ?7, ?8)`,
        ).bind(target.customerId, pts, reason, enquiryId, now.salePaise, bp, admin.email, at),
      );
    else if (pts > 0 && target.mobile)
      stmts.push(
        env.DB.prepare(
          `INSERT INTO PendingRewards (Mobile, ContactName, Points, Reason, EnquiryId, Kind, SalePaise, RateBasisPoints, CreatedBy, CreatedAt)
           VALUES (?1, ?2, ?3, ?4, ?5, 'sale', ?6, ?7, ?8, ?9)`,
        ).bind(target.mobile, target.name, pts, reason, enquiryId, now.salePaise, bp, admin.email, at),
      );
  }
  return stmts;
}

/**
 * Move points waiting against a mobile number into that customer's account (one line per purchase, net of
 * corrections). Safe to call repeatedly: only unclaimed rows are moved, and they are stamped in the same batch.
 */
export async function claimPendingRewards(env: Env, customerId: number, mobile: string): Promise<number> {
  const has = await env.DB.prepare("SELECT COUNT(*) AS n FROM PendingRewards WHERE Mobile = ?1 AND ClaimedAt IS NULL").bind(mobile).first<{ n: number }>();
  if (!has?.n) return 0;
  const at = nowIso();
  const latest = (col: string) =>
    `(SELECT s.${col} FROM PendingRewards s WHERE s.EnquiryId = p.EnquiryId AND s.Mobile = ?2 AND s.Kind = 'sale' AND s.ClaimedAt IS NULL
       AND NOT EXISTS (SELECT 1 FROM PendingRewards r WHERE r.ReversesId = s.PendingId) ORDER BY s.PendingId DESC LIMIT 1)`;
  const [moved] = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO RewardTransactions (CustomerId, Points, Reason, EnquiryId, Kind, SalePaise, RateBasisPoints, CreatedBy, CreatedAt)
       SELECT ?1, SUM(p.Points), COALESCE(${latest("Reason")}, 'Purchase points'), p.EnquiryId, 'sale', ${latest("SalePaise")}, ${latest("RateBasisPoints")}, 'claimed with account', ?3
       FROM PendingRewards p WHERE p.Mobile = ?2 AND p.ClaimedAt IS NULL
       GROUP BY p.EnquiryId HAVING SUM(p.Points) > 0`,
    ).bind(customerId, mobile, at),
    env.DB.prepare("UPDATE PendingRewards SET ClaimedByCustomerId = ?1, ClaimedAt = ?3 WHERE Mobile = ?2 AND ClaimedAt IS NULL").bind(customerId, mobile, at),
  ]);
  return moved.meta.changes ?? 0;
}

/** Owner/admin: points waiting for buyers who have not registered yet (per mobile number). */
export async function listPendingRewards(env: Env, admin: AdminIdentity): Promise<{ rows: PendingReward[] }> {
  requireManager(admin, "see points waiting to be claimed");
  const r = await env.DB.prepare(
    `SELECT p.Mobile AS mobile, (SELECT x.ContactName FROM PendingRewards x WHERE x.Mobile = p.Mobile ORDER BY x.PendingId DESC LIMIT 1) AS name,
            SUM(p.Points) AS points, MIN(p.CreatedAt) AS since, COUNT(DISTINCT p.EnquiryId) AS purchases
     FROM PendingRewards p WHERE p.ClaimedAt IS NULL
     GROUP BY p.Mobile HAVING SUM(p.Points) > 0 ORDER BY since`,
  ).all<PendingReward>();
  return { rows: r.results };
}
