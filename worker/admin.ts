import { PriceUpdateSchema } from "../shared/schemas";
import type { AdminDashboard, AdminIdentity, AdminPriceRow, PriceHistoryRow } from "../shared/types";
import { assertCanEditPrices } from "./auth";
import { publishCatalogue, purgeCatalogueEdgeCache } from "./catalogue";
import type { Env } from "./env";
import { HttpError, nowIso } from "./http";

const PRICE_ROW_SELECT = `
  SELECT p.ProductId, p.SKU, p.ProductName, p.ModelNumber, p.IsActive,
         b.BrandName, b.BrandSlug, c.CategoryName, c.CategorySlug,
         pp.SellingPricePaise, pp.MRPPaise, pp.GSTIncluded, pp.GSTRate, pp.PriceUnit, pp.Version, pp.UpdatedAt, pp.UpdatedBy
  FROM Products p
  JOIN Brands b ON b.BrandId = p.BrandId
  JOIN Categories c ON c.CategoryId = p.CategoryId
  JOIN ProductPrices pp ON pp.ProductId = p.ProductId`;

function toAdminRow(r: Record<string, unknown>): AdminPriceRow {
  return {
    productId: r.ProductId as number,
    sku: r.SKU as string,
    name: r.ProductName as string,
    model: (r.ModelNumber as string) ?? null,
    brand: r.BrandName as string,
    brandSlug: r.BrandSlug as string,
    category: r.CategoryName as string,
    categorySlug: r.CategorySlug as string,
    isActive: r.IsActive === 1,
    sellingPaise: (r.SellingPricePaise as number) ?? null,
    mrpPaise: (r.MRPPaise as number) ?? null,
    gstIncluded: r.GSTIncluded === 1,
    gstRate: (r.GSTRate as number) ?? null,
    unit: (r.PriceUnit as string) ?? "per piece",
    version: r.Version as number,
    updatedAt: r.UpdatedAt as string,
    updatedBy: (r.UpdatedBy as string) ?? null,
  };
}

export async function recordLogin(env: Env, id: AdminIdentity): Promise<void> {
  await env.DB.prepare("UPDATE AdminUsers SET LastLoginAt = ?1 WHERE Email = ?2").bind(nowIso(), id.email).run();
}

export async function listPrices(env: Env, url: URL): Promise<{ rows: AdminPriceRow[]; total: number }> {
  // D1 refuses LIKE patterns longer than ~50 characters ("pattern too complex"): search on the first 40
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 40);
  const brand = url.searchParams.get("brand") ?? "";
  const category = url.searchParams.get("category") ?? "";
  const missing = url.searchParams.get("missing") === "1";
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 100));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  const where: string[] = [];
  const binds: unknown[] = [];
  if (q) {
    binds.push(`%${q.replace(/[%_\\]/g, (m) => "\\" + m)}%`);
    const n = binds.length;
    where.push(`(p.ProductName LIKE ?${n} ESCAPE '\\' OR p.SKU LIKE ?${n} ESCAPE '\\' OR p.ModelNumber LIKE ?${n} ESCAPE '\\')`);
  }
  if (brand) {
    binds.push(brand);
    where.push(`b.BrandSlug = ?${binds.length}`);
  }
  if (category) {
    binds.push(category);
    where.push(`c.CategorySlug = ?${binds.length}`);
  }
  if (missing) where.push("pp.SellingPricePaise IS NULL");
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  binds.push(limit, offset);
  const [rows, count] = await env.DB.batch([
    env.DB.prepare(`${PRICE_ROW_SELECT} ${whereSql} ORDER BY c.SortOrder, p.SeriesKey, p.ProductId LIMIT ?${binds.length - 1} OFFSET ?${binds.length}`).bind(...binds),
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM Products p JOIN Brands b ON b.BrandId = p.BrandId JOIN Categories c ON c.CategoryId = p.CategoryId JOIN ProductPrices pp ON pp.ProductId = p.ProductId ${whereSql}`,
    ).bind(...binds.slice(0, -2)),
  ]);
  return {
    rows: (rows.results as Record<string, unknown>[]).map(toAdminRow),
    total: ((count.results[0] as { n: number } | undefined)?.n ?? 0) as number,
  };
}

export async function priceHistory(env: Env, productId: number): Promise<PriceHistoryRow[]> {
  const res = await env.DB.prepare(
    `SELECT HistoryId, OldPricePaise, NewPricePaise, OldMRPPaise, NewMRPPaise, OldGSTRate, NewGSTRate, ChangedBy, ChangedAt, ChangeReason
     FROM ProductPriceHistory WHERE ProductId = ?1 ORDER BY ChangedAt DESC, HistoryId DESC LIMIT 50`,
  )
    .bind(productId)
    .all<Record<string, unknown>>();
  return res.results.map((r) => ({
    historyId: r.HistoryId as number,
    oldPricePaise: (r.OldPricePaise as number) ?? null,
    newPricePaise: (r.NewPricePaise as number) ?? null,
    oldMrpPaise: (r.OldMRPPaise as number) ?? null,
    newMrpPaise: (r.NewMRPPaise as number) ?? null,
    oldGstRate: (r.OldGSTRate as number) ?? null,
    newGstRate: (r.NewGSTRate as number) ?? null,
    changedBy: r.ChangedBy as string,
    changedAt: r.ChangedAt as string,
    reason: (r.ChangeReason as string) ?? null,
  }));
}

/**
 * Save a price with optimistic concurrency.
 * The UPDATE, history insert and audit insert run in ONE atomic D1 batch (transaction).
 * History/audit rows are only written when the guarded UPDATE actually changed a row (changes() = 1).
 */
export async function updatePrice(env: Env, admin: AdminIdentity, productId: number, body: unknown): Promise<{ row: AdminPriceRow; catalogueVersion: number | null }> {
  assertCanEditPrices(admin);
  const parsed = PriceUpdateSchema.safeParse(body);
  if (!parsed.success) {
    throw new HttpError(422, "validation", "Please correct the highlighted values.", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  const v = parsed.data;

  const current = await env.DB.prepare(`${PRICE_ROW_SELECT} WHERE p.ProductId = ?1`).bind(productId).first<Record<string, unknown>>();
  if (!current) throw new HttpError(404, "not_found", "Product not found.");
  const before = toAdminRow(current);
  if (before.version !== v.expectedVersion) {
    throw new HttpError(409, "conflict", "This price was changed by someone else while you were editing. Review the latest value and try again.", { current: before });
  }

  const now = nowIso();
  const after = {
    sellingPaise: v.sellingPricePaise,
    mrpPaise: v.mrpPaise,
    gstIncluded: v.gstIncluded,
    gstRate: v.gstRate,
    unit: v.priceUnit,
  };
  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE ProductPrices SET SellingPricePaise = ?1, MRPPaise = ?2, GSTIncluded = ?3, GSTRate = ?4, PriceUnit = ?5,
              Version = Version + 1, UpdatedAt = ?6, UpdatedBy = ?7
       WHERE ProductId = ?8 AND Version = ?9`,
    ).bind(v.sellingPricePaise, v.mrpPaise, v.gstIncluded ? 1 : 0, v.gstRate, v.priceUnit, now, admin.email, productId, v.expectedVersion),
    env.DB.prepare(
      `INSERT INTO ProductPriceHistory (ProductId, OldPricePaise, NewPricePaise, OldMRPPaise, NewMRPPaise, OldGSTRate, NewGSTRate, OldGSTIncluded, NewGSTIncluded, ChangedBy, ChangedAt, ChangeReason)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12 WHERE changes() = 1`,
    ).bind(
      productId,
      before.sellingPaise,
      v.sellingPricePaise,
      before.mrpPaise,
      v.mrpPaise,
      before.gstRate,
      v.gstRate,
      before.gstIncluded ? 1 : 0,
      v.gstIncluded ? 1 : 0,
      admin.email,
      now,
      v.reason || null,
    ),
    env.DB.prepare(
      `INSERT INTO AuditLogs (AdminIdentity, Action, EntityType, EntityId, BeforeValue, AfterValue, CreatedAt)
       SELECT ?1, 'price.update', 'Product', ?2, ?3, ?4, ?5 WHERE changes() = 1`,
    ).bind(
      admin.email,
      String(productId),
      JSON.stringify({ sellingPaise: before.sellingPaise, mrpPaise: before.mrpPaise, gstIncluded: before.gstIncluded, gstRate: before.gstRate, unit: before.unit, version: before.version }),
      JSON.stringify({ ...after, reason: v.reason || null }),
      now,
    ),
  ]);
  if ((results[0].meta.changes ?? 0) !== 1) {
    const latest = await env.DB.prepare(`${PRICE_ROW_SELECT} WHERE p.ProductId = ?1`).bind(productId).first<Record<string, unknown>>();
    throw new HttpError(409, "conflict", "This price was changed by someone else while you were editing. Review the latest value and try again.", {
      current: latest ? toAdminRow(latest) : null,
    });
  }

  // Committed. Now republish the public snapshot. If that fails the price is still saved;
  // dropping the snapshot forces the next public request to rebuild it from D1.
  let catalogueVersion: number | null = null;
  try {
    catalogueVersion = (await publishCatalogue(env)).version;
  } catch (e) {
    console.error("Catalogue publish failed after price save", e);
    await env.DB.prepare("UPDATE PublishedCatalogue SET PayloadJson = '{}' WHERE Id = 1").run().catch(() => undefined); // mark stale; the version keeps counting up
  }
  await purgeCatalogueEdgeCache();

  const saved = await env.DB.prepare(`${PRICE_ROW_SELECT} WHERE p.ProductId = ?1`).bind(productId).first<Record<string, unknown>>();
  return { row: toAdminRow(saved!), catalogueVersion };
}

export async function dashboard(env: Env, admin: AdminIdentity): Promise<AdminDashboard> {
  // new enquiries: everything for owner/admin; for other staff, their own and unassigned ones
  const mgr = admin.role === "owner" || admin.role === "admin";
  const r = await env.DB.batch([
    env.DB.prepare("SELECT SUM(IsActive = 1) AS active, SUM(IsActive = 0) AS inactive FROM Products"),
    env.DB.prepare("SELECT COUNT(*) AS n FROM Brands WHERE IsActive = 1"),
    env.DB.prepare(
      `SELECT c.CategoryName AS name, c.CategorySlug AS slug, COUNT(p.ProductId) AS count
       FROM Categories c LEFT JOIN Products p ON p.CategoryId = c.CategoryId AND p.IsActive = 1
       WHERE c.IsActive = 1 GROUP BY c.CategoryId ORDER BY c.SortOrder`,
    ),
    env.DB.prepare("SELECT COUNT(*) AS n FROM Products p JOIN ProductPrices pp ON pp.ProductId = p.ProductId WHERE p.IsActive = 1 AND pp.SellingPricePaise IS NULL"),
    env.DB.prepare("SELECT COUNT(*) AS n FROM Products p WHERE p.IsActive = 1 AND NOT EXISTS (SELECT 1 FROM ProductMedia m WHERE m.ProductId = p.ProductId AND m.MediaType = 'image')"),
    env.DB.prepare("SELECT COUNT(*) AS n FROM Products p WHERE p.IsActive = 1 AND NOT EXISTS (SELECT 1 FROM ProductMedia m WHERE m.ProductId = p.ProductId AND m.MediaType = 'datasheet')"),
    env.DB.prepare(
      `SELECT p.ProductId, p.ProductName, pp.SellingPricePaise, pp.UpdatedAt, pp.UpdatedBy
       FROM ProductPrices pp JOIN Products p ON p.ProductId = pp.ProductId
       WHERE pp.UpdatedBy IS NOT NULL AND pp.UpdatedBy <> 'seed' ORDER BY pp.UpdatedAt DESC LIMIT 8`,
    ),
    env.DB.prepare("SELECT AuditId, AdminIdentity, Action, EntityType, EntityId, CreatedAt FROM AuditLogs ORDER BY CreatedAt DESC, AuditId DESC LIMIT 10"),
    env.DB.prepare("SELECT Version, PublishedAt FROM PublishedCatalogue WHERE Id = 1"),
    env.DB.prepare(
      `SELECT (SELECT COUNT(*) FROM Enquiries WHERE Status = 'new' ${mgr ? "" : "AND (AssignedAdminId = ?1 OR AssignedAdminId IS NULL)"}) AS enq, (SELECT COUNT(*) FROM Customers) AS cust`,
    ).bind(...(mgr ? [] : [admin.id])),
  ]);
  const one = (i: number) => r[i].results[0] as Record<string, number> | undefined;
  const pub = r[8].results[0] as { Version: number; PublishedAt: string } | undefined;
  return {
    activeProducts: one(0)?.active ?? 0,
    inactiveProducts: one(0)?.inactive ?? 0,
    brands: one(1)?.n ?? 0,
    categories: r[2].results as AdminDashboard["categories"],
    missingPrices: one(3)?.n ?? 0,
    missingImages: one(4)?.n ?? 0,
    missingDatasheets: one(5)?.n ?? 0,
    recentPrices: (r[6].results as Record<string, unknown>[]).map((x) => ({
      productId: x.ProductId as number,
      name: x.ProductName as string,
      sellingPaise: (x.SellingPricePaise as number) ?? null,
      updatedAt: x.UpdatedAt as string,
      updatedBy: mgr ? ((x.UpdatedBy as string) ?? null) : null, // who changed it is staff data: owner/admin only
    })),
    // the audit trail names staff and their emails: owner/admin only
    recentActivity: (mgr ? (r[7].results as Record<string, unknown>[]) : []).map((x) => ({
      auditId: x.AuditId as number,
      adminIdentity: x.AdminIdentity as string,
      action: x.Action as string,
      entityType: x.EntityType as string,
      entityId: (x.EntityId as string) ?? null,
      createdAt: x.CreatedAt as string,
    })),
    catalogueVersion: pub?.Version ?? null,
    cataloguePublishedAt: pub?.PublishedAt ?? null,
    newEnquiries: (r[9].results[0] as { enq: number } | undefined)?.enq ?? 0,
    customers: (r[9].results[0] as { cust: number } | undefined)?.cust ?? 0,
    // D1 reports the database size with every query; shown to the owner only
    databaseBytes: admin.role === "owner" ? (((r[0].meta as { size_after?: number } | undefined)?.size_after ?? null) as number | null) : null,
  };
}
