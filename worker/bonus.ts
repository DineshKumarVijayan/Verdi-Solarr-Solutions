import {
  BonusAdjustmentSchema,
  BonusApproveSchema,
  BonusCancelSchema,
  bonusPaise,
  BonusPayoutSchema,
  BonusRateSchema,
  type BonusEntry,
  type BonusOverview,
  type BonusPayout,
} from "../shared/bonus";
import { issues } from "../shared/admin-schemas";
import type { AdminIdentity, AdminRole } from "../shared/types";
import { randomToken } from "./crypto";
import type { Env } from "./env";
import { HttpError, nowIso } from "./http";

/* Staff bonus. Owner and admins manage rates, approvals, adjustments and payouts; every staff member can
 * see their own bonus. Entries are never edited except for approval and payout links; a sale that is
 * undone or corrected gets a reversing entry. */

const MANAGERS: AdminRole[] = ["owner", "admin"];
function requireManager(admin: AdminIdentity) {
  if (!MANAGERS.includes(admin.role)) throw new HttpError(403, "forbidden", "Only the owner or an admin can manage bonuses.");
}
function parse<T>(schema: { safeParse: (b: unknown) => { success: true; data: T } | { success: false; error: import("zod").ZodError } }, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpError(422, "validation", r.error.issues[0]?.message ?? "Please correct the highlighted values.", issues(r.error));
  return r.data;
}
const audit = (env: Env, admin: AdminIdentity, action: string, entityId: string | number, after: unknown, now: string) =>
  env.DB.prepare("INSERT INTO AuditLogs (AdminIdentity, Action, EntityType, EntityId, AfterValue, CreatedAt) VALUES (?1, ?2, 'Bonus', ?3, ?4, ?5)").bind(admin.email, action, String(entityId), JSON.stringify(after), now);

/** Effective rate for a staff member right now (own rate, else the default; 0 when nothing is set). */
async function rateFor(env: Env, staffId: number): Promise<number> {
  const r = await env.DB.prepare(
    `SELECT (SELECT RateBasisPoints FROM BonusRates WHERE AdminId = ?1 ORDER BY RateId DESC LIMIT 1) AS own,
            (SELECT RateBasisPoints FROM BonusRates WHERE AdminId IS NULL ORDER BY RateId DESC LIMIT 1) AS def`,
  )
    .bind(staffId)
    .first<{ own: number | null; def: number | null }>();
  return r?.own ?? r?.def ?? 0;
}

/**
 * Statements to keep the bonus in step with an enquiry's sale. Call when an enquiry's status, sale value or
 * responsible person changes: the current sale bonus (if any) is reversed, and a new pending bonus is added
 * when the enquiry is now won with a sale value and a responsible staff member.
 */
export async function bonusStatementsForSale(
  env: Env,
  admin: AdminIdentity,
  enquiryId: number,
  now: { status: string; salePaise: number | null; ownerId: number | null },
  at: string,
): Promise<D1PreparedStatement[]> {
  const active = await env.DB.prepare(
    `SELECT s.EntryId, s.AdminId, s.SalePaise, s.AmountPaise FROM BonusEntries s
     WHERE s.EnquiryId = ?1 AND s.Kind = 'sale' AND NOT EXISTS (SELECT 1 FROM BonusEntries r WHERE r.ReversesEntryId = s.EntryId)
     ORDER BY s.EntryId DESC LIMIT 1`,
  )
    .bind(enquiryId)
    .first<{ EntryId: number; AdminId: number; SalePaise: number; AmountPaise: number }>();
  const wantSale = now.status === "won" && now.salePaise && now.ownerId;
  // nothing changed for the bonus
  if (active && wantSale && active.AdminId === now.ownerId && active.SalePaise === now.salePaise) return [];
  const stmts: D1PreparedStatement[] = [];
  if (active) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO BonusEntries (AdminId, EnquiryId, Kind, SalePaise, RateBasisPoints, AmountPaise, Reason, ReversesEntryId, CreatedBy, CreatedAt)
         VALUES (?1, ?2, 'reversal', ?3, NULL, ?4, ?5, ?6, ?7, ?8)`,
      ).bind(active.AdminId, enquiryId, active.SalePaise, -active.AmountPaise, wantSale ? "Sale amount or staff member changed" : "Sale undone", active.EntryId, admin.email, at),
    );
  }
  if (wantSale) {
    const bp = await rateFor(env, now.ownerId!);
    const amount = bonusPaise(now.salePaise!, bp);
    if (amount > 0)
      stmts.push(
        env.DB.prepare(
          `INSERT INTO BonusEntries (AdminId, EnquiryId, Kind, SalePaise, RateBasisPoints, AmountPaise, CreatedBy, CreatedAt)
           VALUES (?1, ?2, 'sale', ?3, ?4, ?5, ?6, ?7)`,
        ).bind(now.ownerId, enquiryId, now.salePaise, bp, amount, admin.email, at),
      );
  }
  return stmts;
}

// ------------------------------------------------------------------ reads

const ENTRY_SELECT = `SELECT b.EntryId, b.AdminId, COALESCE(a.DisplayName, a.Email) AS StaffName, b.EnquiryId, e.Reference, e.ContactName,
       b.Kind, b.SalePaise, b.RateBasisPoints, b.AmountPaise, b.Reason, b.Status, b.ApprovedBy, b.PayoutId, b.CreatedBy, b.CreatedAt
  FROM BonusEntries b JOIN AdminUsers a ON a.AdminId = b.AdminId LEFT JOIN Enquiries e ON e.EnquiryId = b.EnquiryId`;
const toEntry = (r: Record<string, unknown>): BonusEntry => ({
  id: r.EntryId as number,
  staffId: r.AdminId as number,
  staffName: r.StaffName as string,
  enquiryId: (r.EnquiryId as number) ?? null,
  enquiryRef: (r.Reference as string) ?? null,
  customer: (r.ContactName as string) ?? null,
  kind: r.Kind as BonusEntry["kind"],
  salePaise: (r.SalePaise as number) ?? null,
  rateBasisPoints: (r.RateBasisPoints as number) ?? null,
  amountPaise: r.AmountPaise as number,
  reason: (r.Reason as string) ?? null,
  status: r.Status as BonusEntry["status"],
  approvedBy: (r.ApprovedBy as string) ?? null,
  payoutId: (r.PayoutId as number) ?? null,
  createdBy: r.CreatedBy as string,
  createdAt: r.CreatedAt as string,
});
const PAYOUT_SELECT = `SELECT p.*, COALESCE(a.DisplayName, a.Email) AS StaffName FROM BonusPayouts p JOIN AdminUsers a ON a.AdminId = p.AdminId`;
const toPayout = (r: Record<string, unknown>): BonusPayout => ({
  id: r.PayoutId as number,
  staffId: r.AdminId as number,
  staffName: r.StaffName as string,
  amountPaise: r.AmountPaise as number,
  entryCount: r.EntryCount as number,
  paidOn: r.PaidOn as string,
  method: (r.Method as string) ?? null,
  reference: (r.Reference as string) ?? null,
  note: (r.Note as string) ?? null,
  status: r.Status as BonusPayout["status"],
  cancelReason: (r.CancelReason as string) ?? null,
  paidBy: r.PaidBy as string,
  createdAt: r.CreatedAt as string,
});

/** Owner/admin: rates and the unpaid / paid totals of every staff member. */
export async function overview(env: Env, admin: AdminIdentity): Promise<BonusOverview> {
  requireManager(admin);
  const [def, rows] = await env.DB.batch([
    env.DB.prepare("SELECT RateBasisPoints AS bp FROM BonusRates WHERE AdminId IS NULL ORDER BY RateId DESC LIMIT 1"),
    env.DB.prepare(
      `SELECT a.AdminId AS staffId, COALESCE(a.DisplayName, a.Email) AS name,
              (SELECT RateBasisPoints FROM BonusRates r WHERE r.AdminId = a.AdminId ORDER BY RateId DESC LIMIT 1) AS rateBasisPoints,
              COALESCE(SUM(CASE WHEN b.PayoutId IS NULL AND b.Status = 'pending' THEN b.AmountPaise END), 0) AS pendingPaise,
              COALESCE(SUM(CASE WHEN b.PayoutId IS NULL AND b.Status = 'approved' THEN b.AmountPaise END), 0) AS approvedPaise,
              COALESCE(SUM(CASE WHEN b.PayoutId IS NULL THEN b.AmountPaise END), 0) AS unpaidPaise,
              COALESCE(SUM(b.PayoutId IS NULL AND b.EntryId IS NOT NULL), 0) AS unpaidCount,
              COALESCE(SUM(CASE WHEN b.PayoutId IS NOT NULL THEN b.AmountPaise END), 0) AS paidPaise
       FROM AdminUsers a LEFT JOIN BonusEntries b ON b.AdminId = a.AdminId
       WHERE a.IsActive = 1 OR b.EntryId IS NOT NULL
       GROUP BY a.AdminId ORDER BY unpaidPaise DESC, name`,
    ),
  ]);
  const d = (def.results[0] as { bp: number | null } | undefined)?.bp ?? null;
  return {
    defaultBasisPoints: d,
    staff: (rows.results as Omit<BonusOverview["staff"][number], "effectiveBasisPoints">[]).map((s) => ({ ...s, effectiveBasisPoints: s.rateBasisPoints ?? d ?? 0 })),
  };
}

/** Entries: owner/admin any staff member (or all); everyone else only their own. */
export async function listEntries(env: Env, admin: AdminIdentity, url: URL): Promise<{ entries: BonusEntry[]; payouts: BonusPayout[] }> {
  const manager = MANAGERS.includes(admin.role);
  const staff = manager ? Number(url.searchParams.get("staff") ?? 0) || null : admin.id;
  const unpaid = url.searchParams.get("unpaid") === "1";
  const where: string[] = [];
  const binds: unknown[] = [];
  if (staff) {
    binds.push(staff);
    where.push(`b.AdminId = ?${binds.length}`);
  }
  if (unpaid) where.push("b.PayoutId IS NULL");
  const status = url.searchParams.get("status");
  if (status === "pending" || status === "approved" || status === "paid") {
    binds.push(status);
    where.push(`b.Status = ?${binds.length}`);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [e, p] = await env.DB.batch([
    env.DB.prepare(`${ENTRY_SELECT} ${w} ORDER BY b.CreatedAt DESC, b.EntryId DESC LIMIT 1000`).bind(...binds),
    env.DB.prepare(`${PAYOUT_SELECT} ${staff ? "WHERE p.AdminId = ?1" : ""} ORDER BY p.CreatedAt DESC LIMIT 200`).bind(...(staff ? [staff] : [])),
  ]);
  return { entries: e.results.map((r) => toEntry(r as Record<string, unknown>)), payouts: p.results.map((r) => toPayout(r as Record<string, unknown>)) };
}

// ------------------------------------------------------------------ writes (owner / admin)

export async function setRate(env: Env, admin: AdminIdentity, body: unknown) {
  requireManager(admin);
  const v = parse(BonusRateSchema, body);
  if (v.staffId === null && v.rateBasisPoints === null) throw new HttpError(422, "validation", "Enter the default bonus %.");
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO BonusRates (AdminId, RateBasisPoints, SetBy, CreatedAt) VALUES (?1, ?2, ?3, ?4)").bind(v.staffId, v.rateBasisPoints, admin.email, now),
    audit(env, admin, "bonus.rate", v.staffId ?? "default", v, now),
  ]);
  return overview(env, admin);
}

export async function approve(env: Env, admin: AdminIdentity, body: unknown) {
  requireManager(admin);
  const v = parse(BonusApproveSchema, body);
  const now = nowIso();
  const marks = v.entryIds.map((_, i) => `?${i + 3}`).join(",");
  const r = await env.DB.prepare(`UPDATE BonusEntries SET Status = 'approved', ApprovedBy = ?1, ApprovedAt = ?2 WHERE Status = 'pending' AND PayoutId IS NULL AND EntryId IN (${marks})`)
    .bind(admin.email, now, ...v.entryIds)
    .run();
  await audit(env, admin, "bonus.approve", v.entryIds.join(","), { count: r.meta.changes }, now).run();
  return { approved: r.meta.changes };
}

export async function addAdjustment(env: Env, admin: AdminIdentity, body: unknown) {
  requireManager(admin);
  const v = parse(BonusAdjustmentSchema, body);
  const ok = await env.DB.prepare("SELECT 1 FROM AdminUsers WHERE AdminId = ?1").bind(v.staffId).first();
  if (!ok) throw new HttpError(404, "not_found", "Staff member not found.");
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO BonusEntries (AdminId, Kind, AmountPaise, Reason, Status, ApprovedBy, ApprovedAt, CreatedBy, CreatedAt)
       VALUES (?1, 'adjustment', ?2, ?3, 'approved', ?4, ?5, ?4, ?5)`,
    ).bind(v.staffId, v.amountPaise, v.reason, admin.email, now),
    audit(env, admin, "bonus.adjust", v.staffId, v, now),
  ]);
  return { ok: true };
}

/**
 * Pay a staff member's chosen unpaid bonuses (e.g. with the salary). Safe against double payment:
 * the server re-reads the chosen bonuses and refuses if their unpaid total differs from what was shown;
 * only bonuses still unpaid at that moment are linked, and if anything was paid in between the whole
 * payment is undone and refused.
 */
export async function pay(env: Env, admin: AdminIdentity, body: unknown): Promise<{ payout: BonusPayout }> {
  requireManager(admin);
  const v = parse(BonusPayoutSchema, body);
  const ids = [...new Set(v.entryIds)];
  const marks = ids.map((_, i) => `?${i + 2}`).join(",");
  const cur = await env.DB.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(AmountPaise), 0) AS total FROM BonusEntries WHERE AdminId = ?1 AND PayoutId IS NULL AND EntryId IN (${marks})`)
    .bind(v.staffId, ...ids)
    .first<{ n: number; total: number }>();
  if (!cur || cur.n !== ids.length) throw new HttpError(409, "already_paid", "Some of these bonuses were already paid. The list has been refreshed: please check it again.");
  if (cur.total !== v.expectedPaise) throw new HttpError(409, "changed", "The amounts changed since you opened this. Please check the total again.");
  if (cur.total <= 0) throw new HttpError(422, "validation", "There is nothing to pay: the chosen bonuses add up to ₹0 or less.");
  const token = randomToken(16);
  const now = nowIso();
  const upd = ids.map((_, i) => `?${i + 4}`).join(",");
  await env.DB.batch([
    env.DB.prepare("INSERT INTO BonusPayouts (Token, AdminId, PaidOn, Method, Reference, Note, PaidBy, CreatedAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)").bind(
      token,
      v.staffId,
      v.paidOn,
      v.method || null,
      v.reference || null,
      v.note || null,
      admin.email,
      now,
    ),
    env.DB.prepare(
      `UPDATE BonusEntries SET PayoutId = (SELECT PayoutId FROM BonusPayouts WHERE Token = ?1), Status = 'paid',
         ApprovedBy = COALESCE(ApprovedBy, ?2), ApprovedAt = COALESCE(ApprovedAt, ?3)
       WHERE PayoutId IS NULL AND AdminId = (SELECT AdminId FROM BonusPayouts WHERE Token = ?1) AND EntryId IN (${upd})`,
    ).bind(token, admin.email, now, ...ids),
    env.DB.prepare(
      `UPDATE BonusPayouts SET AmountPaise = (SELECT COALESCE(SUM(AmountPaise), 0) FROM BonusEntries WHERE PayoutId = BonusPayouts.PayoutId),
         EntryCount = (SELECT COUNT(*) FROM BonusEntries WHERE PayoutId = BonusPayouts.PayoutId) WHERE Token = ?1`,
    ).bind(token),
  ]);
  const row = await env.DB.prepare(`${PAYOUT_SELECT} WHERE p.Token = ?1`).bind(token).first<Record<string, unknown>>();
  if (!row || row.EntryCount !== ids.length || row.AmountPaise !== v.expectedPaise) {
    // someone paid part of it at the same moment: undo this payment completely
    await env.DB.batch([
      env.DB.prepare("UPDATE BonusEntries SET PayoutId = NULL, Status = CASE WHEN ApprovedBy IS NULL THEN 'pending' ELSE 'approved' END WHERE PayoutId = (SELECT PayoutId FROM BonusPayouts WHERE Token = ?1)").bind(token),
      env.DB.prepare("UPDATE BonusPayouts SET Status = 'cancelled', CancelReason = 'Paid at the same time by someone else', CancelledBy = ?2, CancelledAt = ?3, AmountPaise = 0, EntryCount = 0 WHERE Token = ?1").bind(token, admin.email, now),
    ]);
    throw new HttpError(409, "already_paid", "Someone else paid some of these bonuses at the same moment. Nothing was paid: please check the list again.");
  }
  await audit(env, admin, "bonus.pay", row.PayoutId as number, { staffId: v.staffId, amountPaise: row.AmountPaise, entries: ids.length }, now).run();
  return { payout: toPayout(row) };
}

/** Undo a payment recorded by mistake: its bonuses become unpaid (approved) again. */
export async function cancelPayout(env: Env, admin: AdminIdentity, id: number, body: unknown): Promise<{ payout: BonusPayout }> {
  requireManager(admin);
  const v = parse(BonusCancelSchema, body);
  const now = nowIso();
  const p = await env.DB.prepare("SELECT Status FROM BonusPayouts WHERE PayoutId = ?1").bind(id).first<{ Status: string }>();
  if (!p) throw new HttpError(404, "not_found", "Payment not found.");
  if (p.Status === "cancelled") throw new HttpError(409, "cancelled", "This payment was already cancelled.");
  await env.DB.batch([
    env.DB.prepare("UPDATE BonusEntries SET PayoutId = NULL, Status = 'approved' WHERE PayoutId = ?1").bind(id),
    env.DB.prepare("UPDATE BonusPayouts SET Status = 'cancelled', CancelReason = ?2, CancelledBy = ?3, CancelledAt = ?4 WHERE PayoutId = ?1").bind(id, v.reason, admin.email, now),
    audit(env, admin, "bonus.pay.cancel", id, { reason: v.reason }, now),
  ]);
  const row = await env.DB.prepare(`${PAYOUT_SELECT} WHERE p.PayoutId = ?1`).bind(id).first<Record<string, unknown>>();
  return { payout: toPayout(row!) };
}
