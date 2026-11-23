// Quotations: any active admin (any role) can prepare, preview, download and share them.
//
// * Unit prices come from D1 (ProductPrices) and are copied onto the line when it is first saved;
//   the browser may only supply a unit price for products without a listed price, or custom lines.
// * The PDF is generated in the admin's browser (no Worker CPU). When shared on WhatsApp, the PDF is
//   uploaded to R2 and served from an unguessable link: GET /api/q/<token>.
// * Every write is audited in the same D1 batch.

import { z } from "zod";
import { issues, normaliseMobile } from "../shared/admin-schemas";
import { gstLabel } from "../shared/money";
import {
  lineAmounts,
  QUOTE_SETTING_KEYS,
  QUOTE_STATUSES,
  QuoteInputSchema,
  type DiscountType,
  type Quote,
  type QuoteItem,
  type QuoteRow,
  type QuoteSettings,
  type QuoteStatus,
} from "../shared/quotation";
import type { AdminIdentity } from "../shared/types";
import { mediaUrl } from "./catalogue";
import { requireRole } from "./content";
import { reference } from "./customers";
import { bonusStatementsForSale } from "./bonus";
import { loyaltyStatementsForSale } from "./loyalty";
import { randomToken } from "./crypto";
import type { Env } from "./env";
import { HttpError, nowIso } from "./http";

const MAX_PDF = 8 * 1024 * 1024;

function audit(env: Env, admin: AdminIdentity, action: string, id: string | number | null, before: unknown, after: unknown, now: string) {
  return env.DB.prepare(
    "INSERT INTO AuditLogs (AdminIdentity, Action, EntityType, EntityId, BeforeValue, AfterValue, CreatedAt) VALUES (?1, ?2, 'Quotation', ?3, ?4, ?5, ?6)",
  ).bind(admin.email, action, id === null ? null : String(id), before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), now);
}

const shareUrl = (token: string | null) => (token ? `/api/q/${token}` : null);

interface QuoteDbRow {
  QuotationId: number;
  Number: string;
  Status: QuoteStatus;
  CustomerName: string;
  CustomerCompany: string | null;
  CustomerMobile: string | null;
  CustomerEmail: string | null;
  CustomerAddress: string | null;
  Notes: string | null;
  ValidDays: number;
  SubtotalPaise: number;
  DiscountPaise: number;
  TotalPaise: number;
  ShareToken: string | null;
  PdfKey: string | null;
  CreatedBy: string;
  CreatedAt: string;
  UpdatedAt: string;
  SentAt: string | null;
  OwnerAdminId: number | null;
  OwnerName?: string | null;
  EnquiryId: number | null;
  EnquiryReference?: string | null;
}

/** Quotation with its owner's name and the enquiry it answers. */
const Q_SELECT = `SELECT q.*, COALESCE(o.DisplayName, o.Email) AS OwnerName, e.Reference AS EnquiryReference
  FROM Quotations q LEFT JOIN AdminUsers o ON o.AdminId = q.OwnerAdminId LEFT JOIN Enquiries e ON e.EnquiryId = q.EnquiryId`;
const MANAGERS = ["owner", "admin"];
const isManager = (admin: AdminIdentity) => MANAGERS.includes(admin.role);

/** Owner/admin: any quotation. Other staff: only quotations that belong to them. */
async function requireQuoteAccess(env: Env, admin: AdminIdentity, id: number): Promise<QuoteDbRow> {
  const row = await env.DB.prepare("SELECT * FROM Quotations WHERE QuotationId = ?1").bind(id).first<QuoteDbRow>();
  if (!row) throw new HttpError(404, "not_found", "Quotation not found.");
  if (!isManager(admin) && row.OwnerAdminId !== admin.id) throw new HttpError(403, "forbidden", "This quotation belongs to another staff member.");
  return row;
}

function toRow(r: QuoteDbRow) {
  return {
    id: r.QuotationId,
    number: r.Number,
    status: r.Status,
    customerName: r.CustomerName,
    customerCompany: r.CustomerCompany,
    customerMobile: r.CustomerMobile,
    customerEmail: r.CustomerEmail,
    validDays: r.ValidDays,
    subtotalPaise: r.SubtotalPaise,
    discountPaise: r.DiscountPaise,
    totalPaise: r.TotalPaise,
    shareUrl: shareUrl(r.ShareToken),
    createdBy: r.CreatedBy,
    createdAt: r.CreatedAt,
    updatedAt: r.UpdatedAt,
    sentAt: r.SentAt,
    owner: r.OwnerAdminId ? { id: r.OwnerAdminId, name: r.OwnerName ?? "Staff" } : null,
    enquiryId: r.EnquiryId ?? null,
    enquiryReference: r.EnquiryReference ?? null,
  };
}

// ------------------------------------------------------------------ read

export async function listQuotations(env: Env, admin: AdminIdentity, url: URL): Promise<{ rows: QuoteRow[] }> {
  // D1 refuses LIKE patterns longer than ~50 characters ("pattern too complex"): search on the first 40
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 40);
  const status = url.searchParams.get("status") ?? "";
  const where: string[] = [];
  const args: unknown[] = [];
  // sales staff see their own quotations; owner/admin see all (or only theirs with owner=me)
  if (!isManager(admin) || url.searchParams.get("owner") === "me") {
    args.push(admin.id);
    where.push(`q.OwnerAdminId = ?${args.length}`);
  }
  if (q) {
    args.push(`%${q.replace(/[%_]/g, "")}%`);
    where.push(`(q.Number LIKE ?${args.length} OR q.CustomerName LIKE ?${args.length} OR q.CustomerCompany LIKE ?${args.length} OR q.CustomerMobile LIKE ?${args.length})`);
  }
  // draft / sent quotations whose validity ends within 3 days or has ended (India date), as in "My day"
  if (url.searchParams.get("expiring") === "1") where.push("q.Status IN ('draft', 'sent') AND date(q.CreatedAt, '+' || q.ValidDays || ' days') <= date('now', '+5 hours', '+30 minutes', '+3 days')");
  if ((QUOTE_STATUSES as readonly string[]).includes(status)) {
    args.push(status);
    where.push(`q.Status = ?${args.length}`);
  }
  const r = await env.DB.prepare(
    `SELECT q.*, COALESCE(o.DisplayName, o.Email) AS OwnerName, e.Reference AS EnquiryReference, (SELECT COUNT(*) FROM QuotationItems i WHERE i.QuotationId = q.QuotationId) AS ItemCount
     FROM Quotations q LEFT JOIN AdminUsers o ON o.AdminId = q.OwnerAdminId LEFT JOIN Enquiries e ON e.EnquiryId = q.EnquiryId ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY q.CreatedAt DESC LIMIT ${url.searchParams.get("export") === "1" ? 5000 : 200}`,
  )
    .bind(...args)
    .all<QuoteDbRow & { ItemCount: number }>();
  return { rows: r.results.map((x) => ({ ...toRow(x), itemCount: x.ItemCount })) };
}

/** Read a quotation as a staff member (sales staff: only their own). */
export async function viewQuotation(env: Env, admin: AdminIdentity, id: number): Promise<Quote> {
  await requireQuoteAccess(env, admin, id);
  return getQuotation(env, id);
}

export async function getQuotation(env: Env, id: number): Promise<Quote> {
  const [head, items] = await env.DB.batch([
    env.DB.prepare(`${Q_SELECT} WHERE q.QuotationId = ?1`).bind(id),
    env.DB.prepare("SELECT * FROM QuotationItems WHERE QuotationId = ?1 ORDER BY SortOrder, ItemId").bind(id),
  ]);
  const h = head.results[0] as QuoteDbRow | undefined;
  if (!h) throw new HttpError(404, "not_found", "Quotation not found.");
  return {
    ...toRow(h),
    customerAddress: h.CustomerAddress,
    notes: h.Notes,
    items: (items.results as Record<string, unknown>[]).map(
      (i): QuoteItem => ({
        productId: (i.ProductId as number | null) ?? null,
        name: i.Name as string,
        brand: (i.BrandName as string | null) ?? null,
        model: (i.Model as string | null) ?? null,
        unit: i.Unit as string,
        gstNote: (i.GstNote as string | null) ?? null,
        imageUrl: (i.ImageUrl as string | null) ?? null,
        qty: i.Qty as number,
        unitPaise: i.UnitPaise as number,
        discountType: i.DiscountType as DiscountType,
        discountValue: i.DiscountValue as number,
        discountPaise: i.DiscountPaise as number,
        lineTotalPaise: i.LineTotalPaise as number,
      }),
    ),
  };
}

// ------------------------------------------------------------------ write

function parseInput(body: unknown) {
  const r = QuoteInputSchema.safeParse(body);
  if (!r.success) throw new HttpError(422, "validation", r.error.issues[0]?.message ?? "Please correct the highlighted values.", issues(r.error));
  const v = r.data;
  let mobile: string | null = null;
  if (v.customerMobile) {
    mobile = normaliseMobile(v.customerMobile);
    if (!mobile) throw new HttpError(422, "validation", "Enter a valid 10-digit mobile number.", [{ path: "customerMobile", message: "Enter a valid 10-digit mobile number." }]);
  }
  return { ...v, mobile };
}

/** Resolve lines against D1: names, brand, image and (listed) prices come from the database. */
async function resolveItems(env: Env, input: ReturnType<typeof parseInput>, keepPrices: Map<number, number>) {
  const ids = [...new Set(input.items.map((i) => i.productId).filter((x): x is number => x !== null))];
  const products = new Map<number, Record<string, unknown>>();
  const images = new Map<number, string>();
  if (ids.length) {
    const ph = ids.map((_, i) => `?${i + 1}`).join(",");
    const [p, m] = await env.DB.batch([
      env.DB.prepare(
        `SELECT p.ProductId, p.ProductName, p.ModelNumber, b.BrandName, pp.SellingPricePaise, pp.GSTIncluded, pp.GSTRate, pp.PriceUnit
         FROM Products p JOIN Brands b ON b.BrandId = p.BrandId LEFT JOIN ProductPrices pp ON pp.ProductId = p.ProductId
         WHERE p.ProductId IN (${ph})`,
      ).bind(...ids),
      env.DB.prepare(`SELECT ProductId, StorageKey FROM ProductMedia WHERE MediaType = 'image' AND ProductId IN (${ph}) ORDER BY ProductId, IsPrimary DESC, SortOrder`).bind(...ids),
    ]);
    for (const r of p.results as Record<string, unknown>[]) products.set(r.ProductId as number, r);
    for (const r of m.results as { ProductId: number; StorageKey: string }[]) if (!images.has(r.ProductId)) images.set(r.ProductId, mediaUrl(r.StorageKey));
  }
  return input.items.map((it, idx) => {
    const bad = (msg: string): never => {
      throw new HttpError(422, "validation", msg, [{ path: `items.${idx}`, message: msg }]);
    };
    let base: Omit<QuoteItem, "qty" | "discountType" | "discountValue" | "discountPaise" | "lineTotalPaise">;
    if (it.productId !== null) {
      const p = products.get(it.productId) ?? bad(`Line ${idx + 1}: this product no longer exists.`);
      const listed = (p.SellingPricePaise as number | null) ?? null;
      const unitPaise = listed !== null ? (keepPrices.get(it.productId) ?? listed) : (it.unitPaise ?? bad(`Line ${idx + 1}: "${p.ProductName}" has no listed price — enter a unit price.`));
      base = {
        productId: it.productId,
        name: p.ProductName as string,
        brand: (p.BrandName as string | null) ?? null,
        model: (p.ModelNumber as string | null) ?? null,
        unit: (p.PriceUnit as string | null) ?? "per piece",
        gstNote: p.SellingPricePaise != null || p.GSTRate != null ? gstLabel({ gstIncluded: p.GSTIncluded === 1, gstRate: (p.GSTRate as number | null) ?? null }) : null,
        imageUrl: images.get(it.productId) ?? null,
        unitPaise,
      };
    } else {
      if (!it.name) bad(`Line ${idx + 1}: enter a description.`);
      base = { productId: null, name: it.name, brand: null, model: null, unit: it.unit || "per piece", gstNote: null, imageUrl: null, unitPaise: it.unitPaise ?? bad(`Line ${idx + 1}: enter a unit price.`) };
    }
    if (it.discountType === "pct" && it.discountValue > 10000) bad(`Line ${idx + 1}: discount cannot exceed 100%.`);
    const a = lineAmounts(base.unitPaise, it.qty, it.discountType, it.discountValue);
    return { ...base, qty: it.qty, discountType: it.discountType, discountValue: it.discountType === "none" ? 0 : it.discountValue, discountPaise: a.discount, lineTotalPaise: a.total };
  });
}

/** Insert lines for a quotation identified by its id (update) or its new number (same batch as the insert). */
function itemStatements(env: Env, ref: number | string, items: QuoteItem[]) {
  const target = typeof ref === "number" ? "?15" : "(SELECT QuotationId FROM Quotations WHERE Number = ?15)";
  return items.map((i, n) =>
    env.DB.prepare(
      `INSERT INTO QuotationItems (QuotationId, SortOrder, ProductId, Name, BrandName, Model, Unit, GstNote, ImageUrl, Qty, UnitPaise, DiscountType, DiscountValue, DiscountPaise, LineTotalPaise)
       VALUES (${target}, ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)`,
    ).bind(n, i.productId, i.name, i.brand, i.model, i.unit, i.gstNote, i.imageUrl, i.qty, i.unitPaise, i.discountType, i.discountValue, i.discountPaise, i.lineTotalPaise, ref),
  );
}

const sums = (items: QuoteItem[]) => {
  const subtotal = items.reduce((a, i) => a + i.unitPaise * i.qty, 0);
  const discount = items.reduce((a, i) => a + i.discountPaise, 0);
  return { subtotal, discount, total: subtotal - discount };
};

async function nextNumber(env: Env): Promise<string> {
  const d = new Date();
  const prefix = `VSQ-${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}-`;
  const last = await env.DB.prepare("SELECT Number FROM Quotations WHERE Number LIKE ?1 ORDER BY Number DESC LIMIT 1").bind(`${prefix}%`).first<{ Number: string }>();
  const n = last ? Number(last.Number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

/**
 * Link a new quotation to the enquiry it answers: the enquiry moves to "Quoted" (if it was still new or
 * contacted) and, if nobody was responsible for it yet, the person making the quotation takes it.
 */
/**
 * An enquiry for a quotation made without one (staff met the customer offline): owned by the quotation's
 * maker, at Quoted, with the quotation's products, linked to it. Runs in the quotation's own batch.
 */
function newEnquiryStatements(
  env: Env,
  q: { ownerId: number | null; identity: string; source: string; name: string; company: string | null; mobile: string; address: string | null; totalPaise: number; number: string },
  now: string,
): D1PreparedStatement[] {
  const ref = reference();
  const location = (q.address ?? "").split(/\r?\n/)[0].trim().slice(0, 120) || "Not given";
  return [
    env.DB.prepare(
      `INSERT INTO Enquiries (Reference, ContactName, BusinessName, Mobile, Location, Comments, Status, PricesVerified, IndicativeTotalPaise, Source, CreatedByAdminId, AssignedAdminId, CreatedAt, UpdatedAt, UpdatedBy)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'quoted', 1, ?7, ?8, ?9, ?9, ?10, ?10, ?11)`,
    ).bind(ref, q.name, q.company, q.mobile, location, `Created from quotation ${q.number}`, q.totalPaise, q.source, q.ownerId, now, q.identity),
    env.DB.prepare(
      `INSERT INTO EnquiryItems (EnquiryId, ProductId, ProductName, BrandName, ModelNumber, Quantity, UnitPricePaise, PriceUnit, GSTIncluded)
       SELECT (SELECT EnquiryId FROM Enquiries WHERE Reference = ?1), i.ProductId, i.Name, i.BrandName, i.Model, i.Qty, i.UnitPaise, i.Unit, 0
       FROM QuotationItems i WHERE i.QuotationId = (SELECT QuotationId FROM Quotations WHERE Number = ?2) ORDER BY i.SortOrder`,
    ).bind(ref, q.number),
    env.DB.prepare(
      `INSERT INTO EnquiryEvents (EnquiryId, Kind, ToStatus, AssignedTo, Note, ByAdminId, ByIdentity, CreatedAt)
       SELECT EnquiryId, 'created', 'quoted', ?2, ?3, ?2, ?4, ?5 FROM Enquiries WHERE Reference = ?1`,
    ).bind(ref, q.ownerId, `From quotation ${q.number}`, q.identity, now),
    env.DB.prepare("UPDATE Quotations SET EnquiryId = (SELECT EnquiryId FROM Enquiries WHERE Reference = ?1) WHERE Number = ?2").bind(ref, q.number),
  ];
}

async function enquiryLinkStatements(env: Env, admin: AdminIdentity, enquiryId: number, number: string, now: string) {
  const e = await env.DB.prepare("SELECT Status, AssignedAdminId AS OwnerId FROM Enquiries WHERE EnquiryId = ?1")
    .bind(enquiryId)
    .first<{ Status: string; OwnerId: number | null }>();
  if (!e) throw new HttpError(422, "validation", "The enquiry this quotation was made from no longer exists.");
  const stmts: D1PreparedStatement[] = [env.DB.prepare("UPDATE Quotations SET EnquiryId = ?1 WHERE Number = ?2").bind(enquiryId, number)];
  const ev = (kind: string, from: string | null, to: string | null, assignedTo: number | null) =>
    env.DB.prepare("INSERT INTO EnquiryEvents (EnquiryId, Kind, FromStatus, ToStatus, AssignedTo, Note, ByAdminId, ByIdentity, CreatedAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)").bind(
      enquiryId,
      kind,
      from,
      to,
      assignedTo,
      kind === "status" ? `Quotation ${number}` : null,
      admin.id,
      admin.email,
      now,
    );
  if (e.OwnerId === null) {
    stmts.push(env.DB.prepare("UPDATE Enquiries SET AssignedAdminId = ?1 WHERE EnquiryId = ?2").bind(admin.id, enquiryId), ev("assigned", null, null, admin.id));
  }
  if (e.Status === "new" || e.Status === "contacted") {
    stmts.push(env.DB.prepare("UPDATE Enquiries SET Status = 'quoted', UpdatedAt = ?1, UpdatedBy = ?2 WHERE EnquiryId = ?3").bind(now, admin.email, enquiryId), ev("status", e.Status, "quoted", null));
  }
  return stmts;
}

export async function createQuotation(env: Env, admin: AdminIdentity, body: unknown): Promise<Quote> {
  const v = parseInput(body);
  if (!v.enquiryId && !v.mobile)
    throw new HttpError(422, "validation", "Enter the customer's mobile number: it records the sale and gives the customer their points.", [
      { path: "customerMobile", message: "Needed to record the sale and the customer's points" },
    ]);
  if (v.enquiryId && !isManager(admin)) {
    const e = await env.DB.prepare("SELECT AssignedAdminId FROM Enquiries WHERE EnquiryId = ?1").bind(v.enquiryId).first<{ AssignedAdminId: number | null }>();
    if (e && e.AssignedAdminId !== null && e.AssignedAdminId !== admin.id) throw new HttpError(403, "forbidden", "This enquiry is assigned to another staff member.");
  }
  const items = await resolveItems(env, v, new Map());
  const t = sums(items);
  for (let attempt = 0; attempt < 3; attempt++) {
    const number = await nextNumber(env);
    const now = nowIso();
    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO Quotations (Number, CustomerName, CustomerCompany, CustomerMobile, CustomerEmail, CustomerAddress, Notes, ValidDays, SubtotalPaise, DiscountPaise, TotalPaise, CreatedBy, CreatedAt, UpdatedBy, UpdatedAt, OwnerAdminId)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?12, ?13, ?14)`,
        ).bind(number, v.customerName, v.customerCompany || null, v.mobile, v.customerEmail || null, v.customerAddress || null, v.notes || null, v.validDays, t.subtotal, t.discount, t.total, admin.email, now, admin.id),
        ...itemStatements(env, number, items),
        ...(v.enquiryId ? await enquiryLinkStatements(env, admin, v.enquiryId, number, now) : newEnquiryStatements(env, { ownerId: admin.id, identity: admin.email, source: v.reachedVia ?? "phone", name: v.customerName, company: v.customerCompany || null, mobile: v.mobile!, address: v.customerAddress || null, totalPaise: t.total, number }, now)),
        audit(env, admin, "quotation.create", number, null, { customer: v.customerName, items: items.length, totalPaise: t.total, enquiryId: v.enquiryId ?? null }, now),
      ]);
      const row = await env.DB.prepare("SELECT QuotationId FROM Quotations WHERE Number = ?1").bind(number).first<{ QuotationId: number }>();
      return getQuotation(env, row!.QuotationId);
    } catch (e) {
      if (!/UNIQUE constraint failed: Quotations.Number/i.test(String(e))) throw e;
    }
  }
  throw new HttpError(409, "busy", "Could not allocate a quotation number. Please try again.");
}

export async function updateQuotation(env: Env, admin: AdminIdentity, id: number, body: unknown): Promise<Quote> {
  await requireQuoteAccess(env, admin, id);
  const before = await getQuotation(env, id);
  if (before.status === "accepted") throw new HttpError(409, "accepted", "This quotation was accepted, so its sale is recorded. To change it, the owner or an admin must first undo the acceptance.");
  const v = parseInput(body);
  // Keep the price already quoted for products that stay on the quotation.
  const keep = new Map(before.items.filter((i) => i.productId !== null).map((i) => [i.productId as number, i.unitPaise]));
  const items = await resolveItems(env, v, keep);
  const t = sums(items);
  const now = nowIso();
  // Save only if it is still not accepted and nobody else saved it since this editor loaded it
  // (otherwise an accepted sale could change, or one person's edits would silently replace another's).
  const head = await env.DB.prepare(
    `UPDATE Quotations SET CustomerName = ?2, CustomerCompany = ?3, CustomerMobile = ?4, CustomerEmail = ?5, CustomerAddress = ?6, Notes = ?7, ValidDays = ?8,
            SubtotalPaise = ?9, DiscountPaise = ?10, TotalPaise = ?11, UpdatedBy = ?12, UpdatedAt = ?13
      WHERE QuotationId = ?1 AND Status <> 'accepted' AND UpdatedAt = ?14`,
  )
    .bind(id, v.customerName, v.customerCompany || null, v.mobile, v.customerEmail || null, v.customerAddress || null, v.notes || null, v.validDays, t.subtotal, t.discount, t.total, admin.email, now, v.expectedUpdatedAt ?? before.updatedAt)
    .run();
  if (!head.meta.changes)
    throw new HttpError(409, "changed", "This quotation was changed by someone else (or accepted) after you opened it. Reload it to see the latest version, then make your change again.");
  await env.DB.batch([
    env.DB.prepare("DELETE FROM QuotationItems WHERE QuotationId = ?1").bind(id),
    ...itemStatements(env, id, items),
    audit(env, admin, "quotation.update", before.number, { totalPaise: before.totalPaise, items: before.items.length }, { totalPaise: t.total, items: items.length }, now),
  ]);
  return getQuotation(env, id);
}

export async function setQuotationStatus(env: Env, admin: AdminIdentity, id: number, body: unknown): Promise<Quote> {
  const r = z.object({ status: z.enum(QUOTE_STATUSES) }).strict().safeParse(body);
  if (!r.success) throw new HttpError(422, "validation", "Unknown status.");
  await requireQuoteAccess(env, admin, id);
  const before = await getQuotation(env, id);
  // undoing an accepted quotation (= undoing a sale) is for the owner or an admin
  if (before.status === "accepted" && r.data.status !== "accepted" && !isManager(admin))
    throw new HttpError(403, "forbidden", "Only the owner or an admin can undo an accepted quotation.");
  if (r.data.status === before.status) return before;
  const now = nowIso();
  if (r.data.status === "accepted") {
    // an older quotation without an enquiry gets one first, so the sale is recorded like any other
    if (!before.enquiryId) {
      const row = await env.DB.prepare("SELECT OwnerAdminId, CustomerMobile, CustomerAddress FROM Quotations WHERE QuotationId = ?1").bind(id).first<{ OwnerAdminId: number | null; CustomerMobile: string | null; CustomerAddress: string | null }>();
      if (!row?.CustomerMobile) throw new HttpError(422, "validation", "Add the customer's mobile number to this quotation first: it records the sale and gives the customer their points.");
      await env.DB.batch(
        newEnquiryStatements(env, { ownerId: row.OwnerAdminId ?? admin.id, identity: admin.email, source: "phone", name: before.customerName, company: before.customerCompany, mobile: row.CustomerMobile, address: row.CustomerAddress, totalPaise: before.totalPaise, number: before.number }, now),
      );
      before.enquiryId = (await env.DB.prepare("SELECT EnquiryId FROM Quotations WHERE QuotationId = ?1").bind(id).first<{ EnquiryId: number }>())!.EnquiryId;
    }
    const e = await env.DB.prepare("SELECT Status FROM Enquiries WHERE EnquiryId = ?1").bind(before.enquiryId).first<{ Status: string }>();
    if (e?.Status === "won") throw new HttpError(409, "already_won", "This enquiry is already Won (another quotation or a recorded sale). Undo that first if this quotation replaces it.");
    if (e?.Status === "lost" || e?.Status === "cancelled") throw new HttpError(409, "closed", "This enquiry is closed as Not won. The owner or an admin must reopen it first.");
  }
  // only one change wins if two people (or a double tap) change the status at the same moment
  const upd = await env.DB.prepare("UPDATE Quotations SET Status = ?2, UpdatedBy = ?3, UpdatedAt = ?4 WHERE QuotationId = ?1 AND Status = ?5").bind(id, r.data.status, admin.email, now, before.status).run();
  if (!upd.meta.changes) throw new HttpError(409, "changed", "Someone else just changed this quotation. Please refresh and check it.");
  const stmts: D1PreparedStatement[] = [audit(env, admin, "quotation.status", before.number, { status: before.status }, { status: r.data.status }, now)];
  // Accepted quotation = final sale: the linked enquiry becomes "Won" with the quotation total as the sale value.
  if (r.data.status === "accepted" && before.status !== "accepted") {
    const link = await env.DB.prepare("SELECT e.EnquiryId, e.Status, e.AssignedAdminId FROM Quotations q JOIN Enquiries e ON e.EnquiryId = q.EnquiryId WHERE q.QuotationId = ?1")
      .bind(id)
      .first<{ EnquiryId: number; Status: string; AssignedAdminId: number | null }>();
    if (link && !["won", "lost", "cancelled"].includes(link.Status)) {
      stmts.push(
        env.DB.prepare("UPDATE Enquiries SET Status = 'won', SalePaise = ?1, ClosedAt = ?2, ClosedReason = NULL, NotWonReason = NULL, ClosedNote = NULL, FollowUpOn = NULL, UpdatedAt = ?2, UpdatedBy = ?3 WHERE EnquiryId = ?4").bind(before.totalPaise, now, admin.email, link.EnquiryId),
        env.DB.prepare("INSERT INTO EnquiryEvents (EnquiryId, Kind, FromStatus, ToStatus, SalePaise, Note, ByAdminId, ByIdentity, CreatedAt) VALUES (?1, 'status', ?2, 'won', ?3, ?4, ?5, ?6, ?7)").bind(
          link.EnquiryId,
          link.Status,
          before.totalPaise,
          `Quotation ${before.number} accepted`,
          admin.id,
          admin.email,
          now,
        ),
        ...(await bonusStatementsForSale(env, admin, link.EnquiryId, { status: "won", salePaise: before.totalPaise, ownerId: link.AssignedAdminId }, now)),
        ...(await loyaltyStatementsForSale(env, admin, link.EnquiryId, { status: "won", salePaise: before.totalPaise }, now)),
      );
    }
  }
  // Undoing an acceptance undoes the sale it recorded: the enquiry goes back to Quoted, bonus and points are reversed.
  if (before.status === "accepted" && r.data.status !== "accepted" && before.enquiryId) {
    const e = await env.DB.prepare("SELECT Status FROM Enquiries WHERE EnquiryId = ?1").bind(before.enquiryId).first<{ Status: string }>();
    if (e?.Status === "won") {
      stmts.push(
        env.DB.prepare("UPDATE Enquiries SET Status = 'quoted', SalePaise = NULL, ClosedAt = NULL, UpdatedAt = ?1, UpdatedBy = ?2 WHERE EnquiryId = ?3").bind(now, admin.email, before.enquiryId),
        env.DB.prepare("INSERT INTO EnquiryEvents (EnquiryId, Kind, FromStatus, ToStatus, Note, ByAdminId, ByIdentity, CreatedAt) VALUES (?1, 'status', 'won', 'quoted', ?2, ?3, ?4, ?5)").bind(
          before.enquiryId,
          `Acceptance of quotation ${before.number} undone`,
          admin.id,
          admin.email,
          now,
        ),
        ...(await bonusStatementsForSale(env, admin, before.enquiryId, { status: "quoted", salePaise: null, ownerId: null }, now)),
        ...(await loyaltyStatementsForSale(env, admin, before.enquiryId, { status: "quoted", salePaise: null }, now)),
      );
    }
  }
  await env.DB.batch(stmts);
  return getQuotation(env, id);
}

export async function deleteQuotation(env: Env, admin: AdminIdentity, id: number) {
  if (!isManager(admin)) throw new HttpError(403, "forbidden", "Only the owner or an admin can delete quotations.");
  const before = await env.DB.prepare("SELECT * FROM Quotations WHERE QuotationId = ?1").bind(id).first<QuoteDbRow>();
  if (!before) throw new HttpError(404, "not_found", "Quotation not found.");
  if (before.Status === "accepted") throw new HttpError(409, "accepted", "An accepted quotation records a sale. Change its status first (this undoes the sale), then delete it.");
  // its enquiry was at Quoted because of this quotation: with no other quotation it goes back to Contacted
  const at = nowIso();
  const lonely = "e.EnquiryId = ?1 AND e.Status = 'quoted' AND NOT EXISTS (SELECT 1 FROM Quotations o WHERE o.EnquiryId = ?1 AND o.QuotationId <> ?2)";
  const revert = before.EnquiryId
    ? [
        env.DB.prepare(`INSERT INTO EnquiryEvents (EnquiryId, Kind, FromStatus, ToStatus, Note, ByAdminId, ByIdentity, CreatedAt) SELECT e.EnquiryId, 'status', 'quoted', 'contacted', ?3, ?4, ?5, ?6 FROM Enquiries e WHERE ${lonely}`).bind(before.EnquiryId, id, `Quotation ${before.Number} deleted`, admin.id, admin.email, at),
        env.DB.prepare(`UPDATE Enquiries SET Status = 'contacted', UpdatedAt = ?3, UpdatedBy = ?4 WHERE EnquiryId IN (SELECT e.EnquiryId FROM Enquiries e WHERE ${lonely})`).bind(before.EnquiryId, id, at, admin.email),
      ]
    : [];
  await env.DB.batch([...revert, env.DB.prepare("DELETE FROM Quotations WHERE QuotationId = ?1").bind(id), audit(env, admin, "quotation.delete", before.Number, toRow(before), null, nowIso())]);
  if (before.PdfKey && env.MEDIA) await env.MEDIA.delete(before.PdfKey).catch(() => undefined);
  return { ok: true };
}

/** Store the PDF the admin just generated, so it can be linked from WhatsApp. Marks a draft as sent. */
export async function shareQuotationPdf(env: Env, admin: AdminIdentity, id: number, request: Request) {
  await requireQuoteAccess(env, admin, id);
  if (!env.MEDIA) throw new HttpError(503, "storage_not_configured", "File storage (R2) is not configured for this deployment.");
  const before = await env.DB.prepare("SELECT * FROM Quotations WHERE QuotationId = ?1").bind(id).first<QuoteDbRow>();
  if (!before) throw new HttpError(404, "not_found", "Quotation not found.");
  if (Number(request.headers.get("Content-Length") ?? "0") > MAX_PDF) throw new HttpError(413, "too_large", "The PDF is too large.");
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.byteLength === 0 || buf.byteLength > MAX_PDF) throw new HttpError(413, "too_large", "The PDF is empty or too large.");
  if (!(buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d)) throw new HttpError(415, "bad_type", "Only PDF files can be shared.");
  const token = before.ShareToken ?? randomToken(24);
  const key = `quote/${id}/${randomToken(12).replace(/[^A-Za-z0-9]/g, "0")}.pdf`;
  await env.MEDIA.put(key, buf, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { quotation: before.Number, uploadedBy: admin.email } });
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE Quotations SET PdfKey = ?2, ShareToken = ?3, Status = CASE WHEN Status = 'draft' THEN 'sent' ELSE Status END, SentAt = ?4, UpdatedBy = ?5, UpdatedAt = ?4 WHERE QuotationId = ?1",
    ).bind(id, key, token, now, admin.email),
    audit(env, admin, "quotation.share", before.Number, null, { bytes: buf.byteLength }, now),
  ]);
  if (before.PdfKey && before.PdfKey !== key) await env.MEDIA.delete(before.PdfKey).catch(() => undefined);
  return { shareUrl: shareUrl(token)!, status: before.Status === "draft" ? "sent" : before.Status, updatedAt: now };
}

/** Public: the shared PDF behind an unguessable link. */
export async function servePdf(env: Env, token: string): Promise<Response> {
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token) || !env.MEDIA) throw new HttpError(404, "not_found", "Quotation not found.");
  const row = await env.DB.prepare("SELECT Number, PdfKey FROM Quotations WHERE ShareToken = ?1").bind(token).first<{ Number: string; PdfKey: string | null }>();
  const obj = row?.PdfKey ? await env.MEDIA.get(row.PdfKey) : null;
  if (!row || !obj) throw new HttpError(404, "not_found", "Quotation not found.");
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Quotation-${row.Number}.pdf"`,
      "Cache-Control": "private, no-cache",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

// ------------------------------------------------------------------ settings (admin-only; never published)

export async function getQuoteSettings(env: Env): Promise<QuoteSettings> {
  const ph = QUOTE_SETTING_KEYS.map((_, i) => `?${i + 1}`).join(",");
  const r = await env.DB.prepare(`SELECT SettingKey, SettingValue FROM SiteSettings WHERE SettingKey IN (${ph})`).bind(...QUOTE_SETTING_KEYS).all<{ SettingKey: string; SettingValue: string }>();
  return Object.fromEntries(r.results.map((x) => [x.SettingKey, x.SettingValue]));
}

export async function saveQuoteSettings(env: Env, admin: AdminIdentity, body: unknown): Promise<QuoteSettings> {
  requireRole(admin, ["owner", "admin"], "change quotation settings");
  const r = z
    .object({
      quoteGstin: z.union([z.literal(""), z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Enter a valid 15-character GSTIN.")]),
      quoteTerms: z.string().trim().max(2000),
      quoteBank: z.string().trim().max(600),
      quoteSignatory: z.string().trim().max(120),
      quoteValidDays: z.union([z.literal(""), z.string().regex(/^\d{1,3}$/).refine((s) => Number(s) >= 1 && Number(s) <= 365, "Validity must be 1–365 days.")]),
      // UPI / GPay QR code image, uploaded through /api/admin/uploads?kind=logo
      quoteUpiQr: z.union([z.literal(""), z.string().regex(/^r2:logo\/\d{4}\/\d{2}\/[a-z0-9]+\.(webp|jpg|png)$/, "Upload the QR code image again.")]),
      quoteUpiId: z.union([z.literal(""), z.string().trim().regex(/^[\w.-]{2,256}@[A-Za-z][A-Za-z0-9]{1,63}$/, "Enter a valid UPI ID, e.g. verdisolarr@okaxis")]),
    })
    .partial()
    .strict()
    .safeParse(body);
  if (!r.success) throw new HttpError(422, "validation", r.error.issues[0]?.message ?? "Invalid settings.", issues(r.error));
  const before = await getQuoteSettings(env);
  const now = nowIso();
  const stmts = Object.entries(r.data).map(([k, v]) =>
    v
      ? env.DB.prepare(
          "INSERT INTO SiteSettings (SettingKey, SettingValue, UpdatedAt, UpdatedBy) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(SettingKey) DO UPDATE SET SettingValue = excluded.SettingValue, UpdatedAt = excluded.UpdatedAt, UpdatedBy = excluded.UpdatedBy",
        ).bind(k, v, now, admin.email)
      : env.DB.prepare("DELETE FROM SiteSettings WHERE SettingKey = ?1").bind(k),
  );
  if (stmts.length) await env.DB.batch([...stmts, audit(env, admin, "quotation.settings", null, before, r.data, now)]);
  return getQuoteSettings(env);
}
