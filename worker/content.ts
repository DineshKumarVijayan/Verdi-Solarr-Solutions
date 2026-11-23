// Admin content management: brands, categories, products (specs, media), uploads, field photos,
// site settings, admin users, customers, enquiries and reward points.
//
// Rules (see AGENTS.md):
//  * every write is role-checked here (UI hiding is not authorisation);
//  * every write is audited (AuditLogs) in the SAME atomic D1 batch as the change;
//  * every write that affects public data republishes the catalogue snapshot and purges the edge cache;
//  * SQL uses bound parameters only.

import { z } from "zod";
import {
  AdminUserInputSchema,
  BrandInputSchema,
  CategoryInputSchema,
  EnquiryAdminUpdateSchema,
  EnquiryAssignSchema,
  FaqInputSchema,
  FieldPhotoInputSchema,
  issues,
  MediaInputSchema,
  MediaUpdateSchema,
  normaliseMobile,
  PointsAdjustSchema,
  ProductInputSchema,
  StaffEnquirySchema,
} from "../shared/admin-schemas";
import { lineTotalPaise } from "../shared/money";
import {
  type AdminBrand,
  type AdminCategory,
  type AdminCustomerRow,
  type AdminEnquiryRow,
  type AdminFaq,
  type AdminFieldPhoto,
  type AdminIdentity,
  type AdminMedia,
  type AdminProductDetail,
  type AdminProductListRow,
  type AdminRole,
  type AdminUserRow,
  type ClosedReason,
  type EnquiryEvent,
  type EnquirySource,
  type EnquiryStatus,
  type EnquiryStats,
  type MyDay,
  SITE_SETTING_KEYS,
  type SiteSettingKey,
} from "../shared/types";
import { mediaUrl, publishCatalogue, purgeCatalogueEdgeCache } from "./catalogue";
import { isPlaceholderEmail, PLACEHOLDER_EMAIL_DOMAIN } from "../shared/session";
import { hashPassword, randomToken } from "./crypto";
import { issueResetLink, loadEnquiries, reference, rewardLedger, toEnquiryView } from "./customers";
import { bonusStatementsForSale } from "./bonus";
import { ProductStatusSchema } from "../shared/admin-schemas";
import type { StockStatus } from "../shared/stock";
import { MESSAGE_KEYS, MESSAGE_TEMPLATES, MessageSettingsSchema, REVIEW_LINK_KEY, type MessageSettings } from "../shared/messages";
import { loyaltyRate, loyaltyStatementsForSale } from "./loyalty";
import { loyaltyPoints } from "../shared/loyalty";
import type { Env } from "./env";
import { HttpError, nowIso } from "./http";

// ------------------------------------------------------------------ helpers

const CONTENT_ROLES: AdminRole[] = ["owner", "admin"];

export function requireRole(admin: AdminIdentity, roles: AdminRole[], what = "make this change"): void {
  if (!roles.includes(admin.role)) throw new HttpError(403, "forbidden", `Your role (${admin.role.replace("_", " ")}) does not allow you to ${what}.`);
}

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body);
  if (!r.success) throw new HttpError(422, "validation", r.error.issues[0]?.message ?? "Please correct the highlighted values.", issues(r.error));
  return r.data;
}

function audit(env: Env, admin: AdminIdentity, action: string, entityType: string, entityId: string | number | null, before: unknown, after: unknown, now: string) {
  return env.DB.prepare(
    "INSERT INTO AuditLogs (AdminIdentity, Action, EntityType, EntityId, BeforeValue, AfterValue, CreatedAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
  ).bind(admin.email, action, entityType, entityId === null ? null : String(entityId), before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after), now);
}

/** Rebuild the public snapshot after a committed change. Never throws (the change is already saved). */
export async function republish(env: Env): Promise<number | null> {
  let version: number | null = null;
  try {
    version = (await publishCatalogue(env)).version;
  } catch (e) {
    console.error("Catalogue publish failed", e);
    await env.DB.prepare("UPDATE PublishedCatalogue SET PayloadJson = '{}' WHERE Id = 1").run().catch(() => undefined); // mark stale (derived cache only); the version keeps counting up
  }
  await purgeCatalogueEdgeCache();
  return version;
}

/** Turn SQLite UNIQUE violations into a friendly 409. */
async function unique<T>(p: Promise<T>, msg: string): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (/UNIQUE constraint failed/i.test(String(e))) throw new HttpError(409, "duplicate", msg);
    throw e;
  }
}

const b = (v: boolean) => (v ? 1 : 0);

// ------------------------------------------------------------------ brands

export async function listBrands(env: Env): Promise<AdminBrand[]> {
  const r = await env.DB.prepare(
    `SELECT b.BrandId, b.BrandName, b.BrandSlug, b.Description, b.Website, b.LogoStorageKey, b.SortOrder, b.IsActive, COUNT(p.ProductId) AS n
     FROM Brands b LEFT JOIN Products p ON p.BrandId = b.BrandId GROUP BY b.BrandId ORDER BY b.SortOrder, b.BrandName`,
  ).all<Record<string, unknown>>();
  return r.results.map((x) => ({
    id: x.BrandId as number,
    name: x.BrandName as string,
    slug: x.BrandSlug as string,
    description: (x.Description as string) ?? null,
    website: (x.Website as string) ?? null,
    logoKey: (x.LogoStorageKey as string) ?? null,
    logoUrl: x.LogoStorageKey ? mediaUrl(x.LogoStorageKey as string) : null,
    sortOrder: x.SortOrder as number,
    isActive: x.IsActive === 1,
    productCount: x.n as number,
  }));
}

export async function saveBrand(env: Env, admin: AdminIdentity, id: number | null, body: unknown) {
  requireRole(admin, CONTENT_ROLES, "manage brands");
  const v = parse(BrandInputSchema, body);
  const now = nowIso();
  const before = id ? await env.DB.prepare("SELECT * FROM Brands WHERE BrandId = ?1").bind(id).first() : null;
  if (id && !before) throw new HttpError(404, "not_found", "Brand not found.");
  const stmt = id
    ? env.DB.prepare(
        "UPDATE Brands SET BrandName = ?1, BrandSlug = ?2, Description = ?3, Website = ?4, LogoStorageKey = ?5, SortOrder = ?6, IsActive = ?7, UpdatedAt = ?8 WHERE BrandId = ?9",
      ).bind(v.name, v.slug, v.description, v.website, v.logoKey, v.sortOrder, b(v.isActive), now, id)
    : env.DB.prepare(
        "INSERT INTO Brands (BrandName, BrandSlug, Description, Website, LogoStorageKey, SortOrder, IsActive, CreatedAt, UpdatedAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
      ).bind(v.name, v.slug, v.description, v.website, v.logoKey, v.sortOrder, b(v.isActive), now);
  await unique(env.DB.batch([stmt, audit(env, admin, id ? "brand.update" : "brand.create", "Brand", id ?? v.slug, before, v, now)]), "Another brand already uses this slug.");
  await republish(env);
  return { brands: await listBrands(env) };
}

export async function deleteBrand(env: Env, admin: AdminIdentity, id: number) {
  requireRole(admin, CONTENT_ROLES, "delete brands");
  const before = await env.DB.prepare("SELECT * FROM Brands WHERE BrandId = ?1").bind(id).first();
  if (!before) throw new HttpError(404, "not_found", "Brand not found.");
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM Products WHERE BrandId = ?1").bind(id).first<{ n: number }>();
  if ((n?.n ?? 0) > 0) throw new HttpError(409, "in_use", `This brand still has ${n!.n} product(s). Move or delete them first, or hide the brand instead.`);
  await env.DB.batch([env.DB.prepare("DELETE FROM Brands WHERE BrandId = ?1").bind(id), audit(env, admin, "brand.delete", "Brand", id, before, null, nowIso())]);
  await republish(env);
  return { brands: await listBrands(env) };
}

// ------------------------------------------------------------------ categories

export async function listCategories(env: Env): Promise<AdminCategory[]> {
  const r = await env.DB.prepare(
    `SELECT c.CategoryId, c.CategoryName, c.CategorySlug, c.Description, c.SortOrder, c.IsActive, COUNT(p.ProductId) AS n
     FROM Categories c LEFT JOIN Products p ON p.CategoryId = c.CategoryId GROUP BY c.CategoryId ORDER BY c.SortOrder, c.CategoryName`,
  ).all<Record<string, unknown>>();
  return r.results.map((x) => ({
    id: x.CategoryId as number,
    name: x.CategoryName as string,
    slug: x.CategorySlug as string,
    description: (x.Description as string) ?? null,
    sortOrder: x.SortOrder as number,
    isActive: x.IsActive === 1,
    productCount: x.n as number,
  }));
}

export async function saveCategory(env: Env, admin: AdminIdentity, id: number | null, body: unknown) {
  requireRole(admin, CONTENT_ROLES, "manage categories");
  const v = parse(CategoryInputSchema, body);
  const now = nowIso();
  const before = id ? await env.DB.prepare("SELECT * FROM Categories WHERE CategoryId = ?1").bind(id).first() : null;
  if (id && !before) throw new HttpError(404, "not_found", "Category not found.");
  const stmt = id
    ? env.DB.prepare("UPDATE Categories SET CategoryName = ?1, CategorySlug = ?2, Description = ?3, SortOrder = ?4, IsActive = ?5 WHERE CategoryId = ?6").bind(
        v.name,
        v.slug,
        v.description,
        v.sortOrder,
        b(v.isActive),
        id,
      )
    : env.DB.prepare("INSERT INTO Categories (CategoryName, CategorySlug, Description, SortOrder, IsActive) VALUES (?1, ?2, ?3, ?4, ?5)").bind(v.name, v.slug, v.description, v.sortOrder, b(v.isActive));
  await unique(env.DB.batch([stmt, audit(env, admin, id ? "category.update" : "category.create", "Category", id ?? v.slug, before, v, now)]), "Another category already uses this slug.");
  await republish(env);
  return { categories: await listCategories(env) };
}

export async function deleteCategory(env: Env, admin: AdminIdentity, id: number) {
  requireRole(admin, CONTENT_ROLES, "delete categories");
  const before = await env.DB.prepare("SELECT * FROM Categories WHERE CategoryId = ?1").bind(id).first();
  if (!before) throw new HttpError(404, "not_found", "Category not found.");
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM Products WHERE CategoryId = ?1").bind(id).first<{ n: number }>();
  if ((n?.n ?? 0) > 0) throw new HttpError(409, "in_use", `This category still has ${n!.n} product(s). Move or delete them first, or hide the category instead.`);
  await env.DB.batch([env.DB.prepare("DELETE FROM Categories WHERE CategoryId = ?1").bind(id), audit(env, admin, "category.delete", "Category", id, before, null, nowIso())]);
  await republish(env);
  return { categories: await listCategories(env) };
}

// ------------------------------------------------------------------ products

export async function listProducts(env: Env, url: URL): Promise<{ rows: AdminProductListRow[] }> {
  // D1 refuses LIKE patterns longer than ~50 characters ("pattern too complex"): search on the first 40
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 40);
  const brand = Number(url.searchParams.get("brand")) || 0;
  const category = Number(url.searchParams.get("category")) || 0;
  const status = url.searchParams.get("status") ?? "all";
  const missing = url.searchParams.get("missing") ?? "";
  const where: string[] = [];
  if (missing === "images") where.push("NOT EXISTS (SELECT 1 FROM ProductMedia m WHERE m.ProductId = p.ProductId AND m.MediaType = 'image')");
  if (missing === "datasheets") where.push("NOT EXISTS (SELECT 1 FROM ProductMedia m WHERE m.ProductId = p.ProductId AND m.MediaType = 'datasheet')");
  const binds: unknown[] = [];
  if (q) {
    binds.push(`%${q.replace(/[%_\\]/g, (m) => "\\" + m)}%`);
    const n = binds.length;
    where.push(`(p.ProductName LIKE ?${n} ESCAPE '\\' OR p.SKU LIKE ?${n} ESCAPE '\\' OR p.ModelNumber LIKE ?${n} ESCAPE '\\' OR p.SeriesName LIKE ?${n} ESCAPE '\\')`);
  }
  if (brand) {
    binds.push(brand);
    where.push(`p.BrandId = ?${binds.length}`);
  }
  if (category) {
    binds.push(category);
    where.push(`p.CategoryId = ?${binds.length}`);
  }
  if (status === "active") where.push("p.IsActive = 1");
  if (status === "inactive") where.push("p.IsActive = 0");
  const r = await env.DB.prepare(
    `SELECT p.ProductId, p.SKU, p.ProductSlug, p.ProductName, p.ModelNumber, p.SeriesName, p.IsActive, p.IsFeatured, p.StockStatus, p.OnOffer, p.OfferLabel, p.UpdatedAt,
            b.BrandName, c.CategoryName, pp.SellingPricePaise,
            (SELECT COUNT(*) FROM ProductMedia m WHERE m.ProductId = p.ProductId AND m.MediaType = 'image') AS Images,
            EXISTS (SELECT 1 FROM ProductMedia m WHERE m.ProductId = p.ProductId AND m.MediaType = 'datasheet') AS HasDs
     FROM Products p JOIN Brands b ON b.BrandId = p.BrandId JOIN Categories c ON c.CategoryId = p.CategoryId
     LEFT JOIN ProductPrices pp ON pp.ProductId = p.ProductId
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY c.SortOrder, b.BrandName, p.SeriesKey, p.ProductId LIMIT 1000`,
  )
    .bind(...binds)
    .all<Record<string, unknown>>();
  return {
    rows: r.results.map((x) => ({
      id: x.ProductId as number,
      sku: x.SKU as string,
      slug: x.ProductSlug as string,
      name: x.ProductName as string,
      model: (x.ModelNumber as string) ?? null,
      seriesName: (x.SeriesName as string) ?? null,
      brand: x.BrandName as string,
      category: x.CategoryName as string,
      isActive: x.IsActive === 1,
      isFeatured: x.IsFeatured === 1,
      stock: ((x.StockStatus as StockStatus) ?? "in_stock") as StockStatus,
      onOffer: x.OnOffer === 1,
      offerLabel: (x.OfferLabel as string) ?? null,
      sellingPaise: (x.SellingPricePaise as number) ?? null,
      images: x.Images as number,
      hasDatasheet: x.HasDs === 1,
      updatedAt: x.UpdatedAt as string,
    })),
  };
}

export async function getProduct(env: Env, id: number): Promise<AdminProductDetail> {
  const [p, specs, media] = await env.DB.batch([
    env.DB.prepare(
      `SELECT p.*, pp.SellingPricePaise, pp.MRPPaise, pp.GSTRate, pp.GSTIncluded, pp.PriceUnit, pp.Version
       FROM Products p LEFT JOIN ProductPrices pp ON pp.ProductId = p.ProductId WHERE p.ProductId = ?1`,
    ).bind(id),
    env.DB.prepare("SELECT SpecificationKey, SpecificationLabel, SpecificationValue, Unit, SpecGroup FROM ProductSpecifications WHERE ProductId = ?1 ORDER BY SortOrder, SpecificationId").bind(id),
    env.DB.prepare("SELECT MediaId, MediaType, StorageKey, AltText, Title, IsPrimary, SortOrder FROM ProductMedia WHERE ProductId = ?1 ORDER BY MediaType, IsPrimary DESC, SortOrder, MediaId").bind(id),
  ]);
  const r = p.results[0] as Record<string, unknown> | undefined;
  if (!r) throw new HttpError(404, "not_found", "Product not found.");
  let highlights: string[] = [];
  try {
    const h = JSON.parse((r.HighlightsJson as string) ?? "[]");
    if (Array.isArray(h)) highlights = h.filter((x) => typeof x === "string");
  } catch {
    /* ignore */
  }
  return {
    id,
    sku: r.SKU as string,
    slug: r.ProductSlug as string,
    name: r.ProductName as string,
    brandId: r.BrandId as number,
    categoryId: r.CategoryId as number,
    seriesKey: (r.SeriesKey as string) ?? null,
    seriesName: (r.SeriesName as string) ?? null,
    variant: (r.VariantLabel as string) ?? null,
    model: (r.ModelNumber as string) ?? null,
    short: (r.ShortDescription as string) ?? null,
    description: (r.Description as string) ?? null,
    highlights,
    isActive: r.IsActive === 1,
    isFeatured: r.IsFeatured === 1,
    stock: ((r.StockStatus as StockStatus) ?? "in_stock") as StockStatus,
    onOffer: r.OnOffer === 1,
    offerLabel: (r.OfferLabel as string) ?? null,
    updatedAt: r.UpdatedAt as string,
    updatedBy: (r.UpdatedBy as string) ?? null,
    specs: (specs.results as Record<string, unknown>[]).map((s) => ({
      key: s.SpecificationKey as string,
      label: s.SpecificationLabel as string,
      value: s.SpecificationValue as string,
      unit: (s.Unit as string) ?? null,
      group: s.SpecGroup as string,
    })),
    media: (media.results as Record<string, unknown>[]).map(
      (m): AdminMedia => ({
        id: m.MediaId as number,
        type: m.MediaType as AdminMedia["type"],
        storageKey: m.StorageKey as string,
        url: mediaUrl(m.StorageKey as string),
        alt: (m.AltText as string) ?? null,
        title: (m.Title as string) ?? null,
        isPrimary: m.IsPrimary === 1,
        sortOrder: m.SortOrder as number,
      }),
    ),
    price:
      r.Version == null
        ? null
        : {
            sellingPaise: (r.SellingPricePaise as number) ?? null,
            mrpPaise: (r.MRPPaise as number) ?? null,
            gstRate: (r.GSTRate as number) ?? null,
            gstIncluded: r.GSTIncluded === 1,
            unit: (r.PriceUnit as string) ?? "per piece",
            version: r.Version as number,
          },
  };
}

async function assertRefs(env: Env, brandId: number, categoryId: number) {
  const [br, ca] = await env.DB.batch([
    env.DB.prepare("SELECT 1 AS ok FROM Brands WHERE BrandId = ?1").bind(brandId),
    env.DB.prepare("SELECT 1 AS ok FROM Categories WHERE CategoryId = ?1").bind(categoryId),
  ]);
  if (!br.results.length) throw new HttpError(422, "validation", "Choose a valid brand.", [{ path: "brandId", message: "Unknown brand" }]);
  if (!ca.results.length) throw new HttpError(422, "validation", "Choose a valid category.", [{ path: "categoryId", message: "Unknown category" }]);
}

function specInserts(env: Env, productRef: { sql: string; bind: unknown }, specs: z.infer<typeof ProductInputSchema>["specs"]) {
  return specs.map((s, i) =>
    env.DB.prepare(
      `INSERT INTO ProductSpecifications (ProductId, SpecificationKey, SpecificationLabel, SpecificationValue, Unit, SpecGroup, SortOrder)
       SELECT ProductId, ?2, ?3, ?4, ?5, ?6, ?7 FROM Products WHERE ${productRef.sql}`,
    ).bind(productRef.bind, s.key, s.label, s.value, s.unit, s.group, (i + 1) * 10),
  );
}

export async function createProduct(env: Env, admin: AdminIdentity, body: unknown) {
  requireRole(admin, CONTENT_ROLES, "add products");
  const input = parse(ProductInputSchema, body);
  await assertRefs(env, input.brandId, input.categoryId);
  if (await env.DB.prepare("SELECT 1 FROM Products WHERE SKU = ?1").bind(input.sku).first()) {
    throw new HttpError(409, "duplicate", "Another product already uses this product code (SKU).", [{ path: "sku", message: "Already used by another product" }]);
  }
  // Page link: made from the name; if taken, add -2, -3 … automatically (admins never need to fix it).
  const taken = new Set(
    (await env.DB.prepare("SELECT ProductSlug FROM Products WHERE ProductSlug = ?1 OR ProductSlug LIKE ?2").bind(input.slug, `${input.slug}-%`).all<{ ProductSlug: string }>()).results.map((r) => r.ProductSlug),
  );
  let slug = input.slug;
  for (let n = 2; taken.has(slug); n++) slug = `${input.slug}-${n}`;
  const v = { ...input, slug };
  const now = nowIso();
  const price = v.price ?? null;
  const ref = { sql: "SKU = ?1", bind: v.sku };
  const stmts = [
    env.DB.prepare(
      `INSERT INTO Products (SKU, ProductName, ProductSlug, BrandId, CategoryId, SeriesKey, SeriesName, VariantLabel, ModelNumber, ShortDescription, Description, HighlightsJson, IsActive, IsFeatured, CreatedAt, UpdatedAt, UpdatedBy)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15, ?16)`,
    ).bind(v.sku, v.name, v.slug, v.brandId, v.categoryId, v.seriesKey, v.seriesName, v.variant, v.model, v.short, v.description, JSON.stringify(v.highlights), b(v.isActive), b(v.isFeatured), now, admin.email),
    ...specInserts(env, ref, v.specs),
    env.DB.prepare(
      `INSERT INTO ProductPrices (ProductId, SellingPricePaise, MRPPaise, GSTIncluded, GSTRate, PriceUnit, Version, UpdatedAt, UpdatedBy)
       SELECT ProductId, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?8 FROM Products WHERE SKU = ?1`,
    ).bind(v.sku, price?.sellingPricePaise ?? null, price?.mrpPaise ?? null, b(price?.gstIncluded ?? false), price?.gstRate ?? null, price?.priceUnit ?? "per piece", now, price ? admin.email : "seed"),
  ];
  if (price && price.sellingPricePaise !== null) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO ProductPriceHistory (ProductId, OldPricePaise, NewPricePaise, OldMRPPaise, NewMRPPaise, OldGSTRate, NewGSTRate, OldGSTIncluded, NewGSTIncluded, ChangedBy, ChangedAt, ChangeReason)
         SELECT ProductId, NULL, ?2, NULL, ?3, NULL, ?4, NULL, ?5, ?6, ?7, 'Initial price (product created)' FROM Products WHERE SKU = ?1`,
      ).bind(v.sku, price.sellingPricePaise, price.mrpPaise, price.gstRate, b(price.gstIncluded), admin.email, now),
    );
  }
  stmts.push(audit(env, admin, "product.create", "Product", v.sku, null, { ...v, expectedUpdatedAt: undefined }, now));
  await unique(env.DB.batch(stmts), "Another product already uses this SKU or URL slug.");
  const id = (await env.DB.prepare("SELECT ProductId FROM Products WHERE SKU = ?1").bind(v.sku).first<{ ProductId: number }>())!.ProductId;
  const catalogueVersion = await republish(env);
  return { product: await getProduct(env, id), catalogueVersion };
}

export async function updateProduct(env: Env, admin: AdminIdentity, id: number, body: unknown) {
  requireRole(admin, CONTENT_ROLES, "edit products");
  const v = parse(ProductInputSchema, body);
  const before = await getProduct(env, id);
  if (v.expectedUpdatedAt && v.expectedUpdatedAt !== before.updatedAt) {
    throw new HttpError(409, "conflict", "This product was changed by someone else while you were editing. Reload to see the latest version.", { current: before });
  }
  await assertRefs(env, v.brandId, v.categoryId);
  // `now` doubles as a write token: follow-up statements only run if THIS update landed.
  const now = nowIso();
  const guard = "ProductId = ?1 AND UpdatedAt = ?2";
  const stmts = [
    env.DB.prepare(
      `UPDATE Products SET SKU = ?1, ProductName = ?2, ProductSlug = ?3, BrandId = ?4, CategoryId = ?5, SeriesKey = ?6, SeriesName = ?7, VariantLabel = ?8,
              ModelNumber = ?9, ShortDescription = ?10, Description = ?11, HighlightsJson = ?12, IsActive = ?13, IsFeatured = ?14, UpdatedAt = ?15, UpdatedBy = ?16
       WHERE ProductId = ?17 AND UpdatedAt = ?18`,
    ).bind(v.sku, v.name, v.slug, v.brandId, v.categoryId, v.seriesKey, v.seriesName, v.variant, v.model, v.short, v.description, JSON.stringify(v.highlights), b(v.isActive), b(v.isFeatured), now, admin.email, id, before.updatedAt),
    env.DB.prepare(`DELETE FROM ProductSpecifications WHERE ProductId = ?1 AND EXISTS (SELECT 1 FROM Products WHERE ${guard})`).bind(id, now),
    ...v.specs.map((s, i) =>
      env.DB.prepare(
        `INSERT INTO ProductSpecifications (ProductId, SpecificationKey, SpecificationLabel, SpecificationValue, Unit, SpecGroup, SortOrder)
         SELECT ProductId, ?3, ?4, ?5, ?6, ?7, ?8 FROM Products WHERE ${guard}`,
      ).bind(id, now, s.key, s.label, s.value, s.unit, s.group, (i + 1) * 10),
    ),
    env.DB.prepare(
      `INSERT INTO AuditLogs (AdminIdentity, Action, EntityType, EntityId, BeforeValue, AfterValue, CreatedAt)
       SELECT ?3, 'product.update', 'Product', ?1, ?4, ?5, ?2 FROM Products WHERE ${guard}`,
    ).bind(id, now, admin.email, JSON.stringify({ ...before, media: undefined, price: undefined }), JSON.stringify({ ...v, expectedUpdatedAt: undefined, price: undefined })),
  ];
  const res = await unique(env.DB.batch(stmts), "Another product already uses this SKU or URL slug.");
  if ((res[0].meta.changes ?? 0) !== 1) throw new HttpError(409, "conflict", "This product was changed by someone else while you were editing. Reload to see the latest version.");
  const catalogueVersion = await republish(env);
  return { product: await getProduct(env, id), catalogueVersion };
}

export async function duplicateProduct(env: Env, admin: AdminIdentity, id: number) {
  requireRole(admin, CONTENT_ROLES, "add products");
  const src = await getProduct(env, id);
  const suffix = randomToken(3).toLowerCase().replace(/[^a-z0-9]/g, "x");
  const sku = `${src.sku}-COPY-${suffix}`.slice(0, 60);
  const slug = `${src.slug}-copy-${suffix}`.slice(0, 80);
  const now = nowIso();
  const ref = { sql: "SKU = ?1", bind: sku };
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO Products (SKU, ProductName, ProductSlug, BrandId, CategoryId, SeriesKey, SeriesName, VariantLabel, ModelNumber, ShortDescription, Description, HighlightsJson, IsActive, IsFeatured, CreatedAt, UpdatedAt, UpdatedBy)
       SELECT ?1, ProductName || ' (copy)', ?2, BrandId, CategoryId, SeriesKey, SeriesName, VariantLabel, ModelNumber, ShortDescription, Description, HighlightsJson, 0, 0, ?3, ?3, ?4 FROM Products WHERE ProductId = ?5`,
    ).bind(sku, slug, now, admin.email, id),
    ...specInserts(env, ref, src.specs),
    ...src.media.map((m) =>
      env.DB.prepare(
        "INSERT INTO ProductMedia (ProductId, MediaType, StorageKey, AltText, Title, IsPrimary, SortOrder) SELECT ProductId, ?2, ?3, ?4, ?5, ?6, ?7 FROM Products WHERE SKU = ?1",
      ).bind(sku, m.type, m.storageKey, m.alt, m.title, b(m.isPrimary), m.sortOrder),
    ),
    env.DB.prepare("INSERT INTO ProductPrices (ProductId, Version, UpdatedAt, UpdatedBy) SELECT ProductId, 1, ?2, 'seed' FROM Products WHERE SKU = ?1").bind(sku, now),
    audit(env, admin, "product.duplicate", "Product", id, null, { newSku: sku }, now),
  ]);
  const newId = (await env.DB.prepare("SELECT ProductId FROM Products WHERE SKU = ?1").bind(sku).first<{ ProductId: number }>())!.ProductId;
  // Copy is hidden (inactive) until edited, so no republish is needed.
  return { product: await getProduct(env, newId) };
}

export async function deleteProduct(env: Env, admin: AdminIdentity, id: number) {
  requireRole(admin, CONTENT_ROLES, "delete products");
  const before = await getProduct(env, id);
  const now = nowIso();
  await env.DB.batch([
    // Full snapshot (incl. price) is kept in the audit log; enquiry history keeps its own item snapshot.
    audit(env, admin, "product.delete", "Product", id, before, null, now),
    env.DB.prepare("DELETE FROM Products WHERE ProductId = ?1").bind(id),
  ]);
  await Promise.all(before.media.map((m) => deleteR2IfUnused(env, m.storageKey)));
  return { catalogueVersion: await republish(env) };
}

// ------------------------------------------------------------------ media

export async function addMedia(env: Env, admin: AdminIdentity, productId: number, body: unknown) {
  requireRole(admin, CONTENT_ROLES, "change product media");
  const v = parse(MediaInputSchema, body);
  const exists = await env.DB.prepare("SELECT 1 FROM Products WHERE ProductId = ?1").bind(productId).first();
  if (!exists) throw new HttpError(404, "not_found", "Product not found.");
  const now = nowIso();
  const stmts = [];
  // Only one datasheet is shown per product: a new datasheet becomes the primary one.
  const primary = v.isPrimary || v.type === "datasheet";
  if (primary) stmts.push(env.DB.prepare("UPDATE ProductMedia SET IsPrimary = 0 WHERE ProductId = ?1 AND MediaType = ?2").bind(productId, v.type));
  stmts.push(
    env.DB.prepare(
      `INSERT INTO ProductMedia (ProductId, MediaType, StorageKey, AltText, Title, IsPrimary, SortOrder, CreatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, COALESCE((SELECT MAX(SortOrder) + 10 FROM ProductMedia WHERE ProductId = ?1 AND MediaType = ?2), 10), ?7)`,
    ).bind(productId, v.type, v.storageKey, v.alt, v.title, b(primary), now),
    env.DB.prepare("UPDATE Products SET UpdatedAt = ?1, UpdatedBy = ?2 WHERE ProductId = ?3").bind(now, admin.email, productId),
    audit(env, admin, "media.add", "Product", productId, null, v, now),
  );
  await unique(env.DB.batch(stmts), "This file is already attached to the product.");
  return { product: await getProduct(env, productId), catalogueVersion: await republish(env) };
}

export async function updateMedia(env: Env, admin: AdminIdentity, productId: number, mediaId: number, body: unknown) {
  requireRole(admin, CONTENT_ROLES, "change product media");
  const v = parse(MediaUpdateSchema, body);
  const m = await env.DB.prepare("SELECT * FROM ProductMedia WHERE MediaId = ?1 AND ProductId = ?2").bind(mediaId, productId).first<Record<string, unknown>>();
  if (!m) throw new HttpError(404, "not_found", "File not found.");
  const now = nowIso();
  const stmts = [];
  if (v.isPrimary) stmts.push(env.DB.prepare("UPDATE ProductMedia SET IsPrimary = 0 WHERE ProductId = ?1 AND MediaType = ?2").bind(productId, m.MediaType));
  stmts.push(
    env.DB.prepare("UPDATE ProductMedia SET AltText = ?1, Title = ?2, IsPrimary = COALESCE(?3, IsPrimary), SortOrder = COALESCE(?4, SortOrder) WHERE MediaId = ?5").bind(
      v.alt,
      v.title,
      v.isPrimary === undefined ? null : b(v.isPrimary),
      v.sortOrder ?? null,
      mediaId,
    ),
    env.DB.prepare("UPDATE Products SET UpdatedAt = ?1, UpdatedBy = ?2 WHERE ProductId = ?3").bind(now, admin.email, productId),
    audit(env, admin, "media.update", "Product", productId, m, v, now),
  );
  await env.DB.batch(stmts);
  return { product: await getProduct(env, productId), catalogueVersion: await republish(env) };
}

export async function deleteMedia(env: Env, admin: AdminIdentity, productId: number, mediaId: number) {
  requireRole(admin, CONTENT_ROLES, "change product media");
  const m = await env.DB.prepare("SELECT * FROM ProductMedia WHERE MediaId = ?1 AND ProductId = ?2").bind(mediaId, productId).first<Record<string, unknown>>();
  if (!m) throw new HttpError(404, "not_found", "File not found.");
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM ProductMedia WHERE MediaId = ?1").bind(mediaId),
    env.DB.prepare("UPDATE Products SET UpdatedAt = ?1, UpdatedBy = ?2 WHERE ProductId = ?3").bind(now, admin.email, productId),
    audit(env, admin, "media.delete", "Product", productId, m, null, now),
  ]);
  await deleteR2IfUnused(env, m.StorageKey as string);
  return { product: await getProduct(env, productId), catalogueVersion: await republish(env) };
}

/** Remove an uploaded R2 object once nothing references it any more. Static files are never touched. */
async function deleteR2IfUnused(env: Env, storageKey: string): Promise<void> {
  if (!storageKey.startsWith("r2:") || !env.MEDIA) return;
  const used = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM ProductMedia WHERE StorageKey = ?1) + (SELECT COUNT(*) FROM FieldPhotos WHERE StorageKey = ?1) + (SELECT COUNT(*) FROM Brands WHERE LogoStorageKey = ?1)
          + (SELECT COUNT(*) FROM QuotationItems WHERE ImageUrl = ?2) + (SELECT COUNT(*) FROM SiteSettings WHERE SettingValue = ?1) AS n`,
  )
    .bind(storageKey, mediaUrl(storageKey))
    .first<{ n: number }>();
  if ((used?.n ?? 0) === 0) {
    const key = storageKey.slice(3);
    await env.MEDIA.delete([key, key.replace(/\.(webp|jpg|png)$/, "-800.webp")]).catch(() => undefined); // + phone copy
  }
}

// ------------------------------------------------------------------ uploads

const UPLOAD_KINDS = {
  image: { max: 8 * 1024 * 1024, types: ["image/webp", "image/jpeg", "image/png"] },
  field: { max: 8 * 1024 * 1024, types: ["image/webp", "image/jpeg", "image/png"] },
  logo: { max: 2 * 1024 * 1024, types: ["image/webp", "image/jpeg", "image/png"] },
  datasheet: { max: 25 * 1024 * 1024, types: ["application/pdf"] },
} as const;
type UploadKind = keyof typeof UPLOAD_KINDS;

/** Detect the real file type from its first bytes (never trust the browser-supplied type). */
export function sniff(bytes: Uint8Array): { type: string; ext: string } | null {
  const s = (o: number, sig: number[]) => sig.every((v, i) => bytes[o + i] === v);
  if (s(0, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { type: "application/pdf", ext: "pdf" };
  if (s(0, [0xff, 0xd8, 0xff])) return { type: "image/jpeg", ext: "jpg" };
  if (s(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { type: "image/png", ext: "png" };
  if (s(0, [0x52, 0x49, 0x46, 0x46]) && s(8, [0x57, 0x45, 0x42, 0x50])) return { type: "image/webp", ext: "webp" };
  return null;
}

export async function upload(env: Env, admin: AdminIdentity, request: Request, url: URL) {
  requireRole(admin, CONTENT_ROLES, "upload files");
  if (!env.MEDIA) throw new HttpError(503, "storage_not_configured", "File storage (R2) is not configured for this deployment.");
  const kind = url.searchParams.get("kind") as UploadKind | null;
  if (!kind || !(kind in UPLOAD_KINDS)) throw new HttpError(400, "bad_kind", "Unknown upload type.");
  const rule = UPLOAD_KINDS[kind];
  const len = Number(request.headers.get("Content-Length") ?? "0");
  if (len > rule.max) throw new HttpError(413, "too_large", `File is too large (max ${Math.round(rule.max / 1048576)} MB).`);
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.byteLength === 0) throw new HttpError(400, "empty", "The file is empty.");
  if (buf.byteLength > rule.max) throw new HttpError(413, "too_large", `File is too large (max ${Math.round(rule.max / 1048576)} MB).`);
  const t = sniff(buf);
  if (!t || !(rule.types as readonly string[]).includes(t.type)) {
    throw new HttpError(415, "bad_type", kind === "datasheet" ? "Datasheets must be PDF files." : "Images must be WebP, JPEG or PNG.");
  }
  const variantOf = url.searchParams.get("variantOf");
  if (variantOf) {
    // 800 px phone copy stored next to an existing upload: r2:image/2026/11/abc.webp -> image/2026/11/abc-800.webp
    const m = variantOf.match(/^r2:((?:image|field)\/\d{4}\/\d{2}\/[a-z0-9]+)\.(webp|jpg|png)$/);
    if (!m || !m[1].startsWith(kind + "/") || t.type !== "image/webp") throw new HttpError(400, "bad_variant", "Invalid image copy.");
    if (!(await env.MEDIA.head(`${m[1]}.${m[2]}`))) throw new HttpError(404, "not_found", "Original image not found.");
    await env.MEDIA.put(`${m[1]}-800.webp`, buf, { httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" } });
    return { storageKey: `r2:${m[1]}-800.webp`, url: mediaUrl(`r2:${m[1]}-800.webp`), bytes: buf.byteLength, type: t.type };
  }
  const d = new Date();
  const key = `${kind}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${randomToken(12).toLowerCase().replace(/[^a-z0-9]/g, "0")}.${t.ext}`;
  const rawName = (request.headers.get("X-File-Name") ?? "").slice(0, 120);
  await env.MEDIA.put(key, buf, {
    httpMetadata: { contentType: t.type, cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { uploadedBy: admin.email, originalName: rawName.replace(/[^\w .()-]/g, "_") },
  });
  const storageKey = `r2:${key}`;
  await audit(env, admin, "file.upload", "File", storageKey, null, { kind, bytes: buf.byteLength, type: t.type }, nowIso()).run();
  return { storageKey, url: mediaUrl(storageKey), bytes: buf.byteLength, type: t.type };
}

// ------------------------------------------------------------------ field photos

export async function listFieldPhotos(env: Env): Promise<AdminFieldPhoto[]> {
  const r = await env.DB.prepare("SELECT * FROM FieldPhotos ORDER BY SortOrder, PhotoId").all<Record<string, unknown>>();
  return r.results.map((x) => ({
    id: x.PhotoId as number,
    storageKey: x.StorageKey as string,
    url: mediaUrl(x.StorageKey as string),
    caption: x.Caption as string,
    tag: x.Tag as string,
    tall: x.IsTall === 1,
    sortOrder: x.SortOrder as number,
    isActive: x.IsActive === 1,
  }));
}

export async function saveFieldPhoto(env: Env, admin: AdminIdentity, id: number | null, body: unknown) {
  requireRole(admin, CONTENT_ROLES, "manage field photos");
  const v = parse(FieldPhotoInputSchema, body);
  const now = nowIso();
  const before = id ? await env.DB.prepare("SELECT * FROM FieldPhotos WHERE PhotoId = ?1").bind(id).first() : null;
  if (id && !before) throw new HttpError(404, "not_found", "Photo not found.");
  const stmt = id
    ? env.DB.prepare("UPDATE FieldPhotos SET StorageKey = ?1, Caption = ?2, Tag = ?3, IsTall = ?4, SortOrder = ?5, IsActive = ?6, UpdatedAt = ?7, UpdatedBy = ?8 WHERE PhotoId = ?9").bind(
        v.storageKey,
        v.caption,
        v.tag,
        b(v.tall),
        v.sortOrder,
        b(v.isActive),
        now,
        admin.email,
        id,
      )
    : env.DB.prepare(
        `INSERT INTO FieldPhotos (StorageKey, Caption, Tag, IsTall, SortOrder, IsActive, CreatedAt, UpdatedAt, UpdatedBy)
         VALUES (?1, ?2, ?3, ?4, CASE WHEN ?5 > 0 THEN ?5 ELSE COALESCE((SELECT MAX(SortOrder) + 10 FROM FieldPhotos), 10) END, ?6, ?7, ?7, ?8)`,
      ).bind(v.storageKey, v.caption, v.tag, b(v.tall), v.sortOrder, b(v.isActive), now, admin.email);
  await env.DB.batch([stmt, audit(env, admin, id ? "field_photo.update" : "field_photo.create", "FieldPhoto", id, before, v, now)]);
  if (before && (before as Record<string, unknown>).StorageKey !== v.storageKey) await deleteR2IfUnused(env, (before as Record<string, unknown>).StorageKey as string);
  await republish(env);
  return { photos: await listFieldPhotos(env) };
}

export async function deleteFieldPhoto(env: Env, admin: AdminIdentity, id: number) {
  requireRole(admin, CONTENT_ROLES, "manage field photos");
  const before = await env.DB.prepare("SELECT * FROM FieldPhotos WHERE PhotoId = ?1").bind(id).first<Record<string, unknown>>();
  if (!before) throw new HttpError(404, "not_found", "Photo not found.");
  await env.DB.batch([env.DB.prepare("DELETE FROM FieldPhotos WHERE PhotoId = ?1").bind(id), audit(env, admin, "field_photo.delete", "FieldPhoto", id, before, null, nowIso())]);
  await deleteR2IfUnused(env, before.StorageKey as string);
  await republish(env);
  return { photos: await listFieldPhotos(env) };
}

// ------------------------------------------------------------------ settings

export async function getSettings(env: Env): Promise<Partial<Record<SiteSettingKey, string>>> {
  const r = await env.DB.prepare("SELECT SettingKey, SettingValue FROM SiteSettings").all<{ SettingKey: string; SettingValue: string }>();
  const out: Partial<Record<SiteSettingKey, string>> = {};
  for (const x of r.results) if ((SITE_SETTING_KEYS as readonly string[]).includes(x.SettingKey)) out[x.SettingKey as SiteSettingKey] = x.SettingValue;
  return out;
}

function validateSetting(k: SiteSettingKey, raw: string): string {
  const v = raw.trim();
  if (!v) return "";
  const bad = (m: string): never => {
    throw new HttpError(422, "validation", m, [{ path: k, message: m }]);
  };
  if (v.length > 500) bad("Value is too long.");
  if (k.endsWith("Url") || k === "announcementLink") {
    if (k === "announcementLink" && v.startsWith("/") && /^\/[\w\-/?=&#.]*$/.test(v)) return v;
    if (!/^https:\/\/[^\s"'<>]+$/.test(v)) bad("Links must start with https://");
  }
  if (k === "phone" || k === "whatsapp") {
    const n = normaliseMobile(v) ?? (/^\+?\d{10,15}$/.test(v.replace(/[\s-]/g, "")) ? v.replace(/\D/g, "") : null);
    if (!n) bad("Enter a valid phone number with country code, e.g. +91 89392 77997.");
    return n!;
  }
  if (k === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) bad("Enter a valid email address.");
  return v;
}

export async function saveSettings(env: Env, admin: AdminIdentity, body: unknown) {
  requireRole(admin, CONTENT_ROLES, "change site settings");
  const input = z.object({ settings: z.record(z.string(), z.string().max(600)) }).strict().safeParse(body);
  if (!input.success) throw new HttpError(422, "validation", "Invalid settings.");
  const before = await getSettings(env);
  const now = nowIso();
  const stmts = [];
  const after: Record<string, string> = {};
  for (const [k, raw] of Object.entries(input.data.settings)) {
    if (!(SITE_SETTING_KEYS as readonly string[]).includes(k)) throw new HttpError(422, "validation", `Unknown setting: ${k}`);
    const v = validateSetting(k as SiteSettingKey, raw);
    after[k] = v;
    stmts.push(
      v
        ? env.DB.prepare(
            "INSERT INTO SiteSettings (SettingKey, SettingValue, UpdatedAt, UpdatedBy) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(SettingKey) DO UPDATE SET SettingValue = excluded.SettingValue, UpdatedAt = excluded.UpdatedAt, UpdatedBy = excluded.UpdatedBy",
          ).bind(k, v, now, admin.email)
        : env.DB.prepare("DELETE FROM SiteSettings WHERE SettingKey = ?1").bind(k), // empty = use the built-in default
    );
  }
  if (stmts.length) {
    stmts.push(audit(env, admin, "settings.update", "SiteSettings", null, before, after, now));
    await env.DB.batch(stmts);
    await republish(env);
  }
  return { settings: await getSettings(env) };
}

// ------------------------------------------------------------------ admin users (owner only)

export async function listAdminUsers(env: Env): Promise<AdminUserRow[]> {
  const r = await env.DB.prepare("SELECT AdminId, Email, Mobile, PasswordHash IS NOT NULL AS HasPw, MustChangePassword, DisplayName, Role, IsActive, CreatedAt, LastLoginAt FROM AdminUsers ORDER BY IsActive DESC, Role, DisplayName, Email").all<Record<string, unknown>>();
  return r.results.map((x) => ({
    id: x.AdminId as number,
    email: isPlaceholderEmail(x.Email as string) ? "" : (x.Email as string),
    mobile: (x.Mobile as string) ?? null,
    hasPassword: x.HasPw === 1,
    mustChangePassword: x.MustChangePassword === 1,
    displayName: (x.DisplayName as string) ?? null,
    role: x.Role as AdminRole,
    isActive: x.IsActive === 1,
    createdAt: x.CreatedAt as string,
    lastLoginAt: (x.LastLoginAt as string) ?? null,
  }));
}

export async function saveAdminUser(env: Env, admin: AdminIdentity, id: number | null, body: unknown) {
  requireRole(admin, ["owner"], "manage admin users");
  const input = parse(AdminUserInputSchema, body);
  // No email: an internal placeholder keeps the (required, unique) Email column valid.
  const v = { ...input, email: input.email || `${input.mobile}@${PLACEHOLDER_EMAIL_DOMAIN}` };
  const now = nowIso();
  const before = id ? await env.DB.prepare("SELECT AdminId, Email, Mobile, DisplayName, Role, IsActive FROM AdminUsers WHERE AdminId = ?1").bind(id).first<Record<string, unknown>>() : null;
  if (id && !before) throw new HttpError(404, "not_found", "Admin user not found.");
  if (!id && !v.password) throw new HttpError(422, "validation", "Set a password for the new admin.", [{ path: "password", message: "Required (at least 8 characters)" }]);
  const hash = v.password ? await hashPassword(v.password, env) : null;
  const self = !!before && String(before.Email).toLowerCase() === admin.email;
  // Someone else's new/reset password is temporary: they must choose their own at next sign-in.
  const mustChange = hash && !self ? 1 : 0;
  if (self && (v.role !== "owner" || !v.isActive)) {
    throw new HttpError(422, "self_lockout", "You cannot remove your own owner access. Ask another owner to do it.");
  }
  if (before && before.Role === "owner" && (v.role !== "owner" || !v.isActive)) {
    const owners = await env.DB.prepare("SELECT COUNT(*) AS n FROM AdminUsers WHERE Role = 'owner' AND IsActive = 1").first<{ n: number }>();
    if ((owners?.n ?? 0) <= 1) throw new HttpError(422, "last_owner", "At least one active owner is required.");
  }
  const stmts = [
    id
      ? env.DB.prepare(
          "UPDATE AdminUsers SET Email = ?1, DisplayName = ?2, Role = ?3, IsActive = ?4, Mobile = ?5, PasswordHash = COALESCE(?6, PasswordHash), FailedLogins = CASE WHEN ?6 IS NULL THEN FailedLogins ELSE 0 END, LockedUntil = CASE WHEN ?6 IS NULL THEN LockedUntil ELSE NULL END, MustChangePassword = CASE WHEN ?6 IS NULL THEN MustChangePassword ELSE ?9 END, PasswordChangedAt = CASE WHEN ?6 IS NULL THEN PasswordChangedAt ELSE ?7 END, UpdatedAt = ?7 WHERE AdminId = ?8",
        ).bind(v.email, v.displayName, v.role, b(v.isActive), v.mobile, hash, now, id, mustChange)
      : env.DB.prepare("INSERT INTO AdminUsers (Email, DisplayName, Role, IsActive, Mobile, PasswordHash, MustChangePassword, CreatedAt, UpdatedAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?7)").bind(
          v.email,
          v.displayName,
          v.role,
          b(v.isActive),
          v.mobile,
          hash,
          now,
        ),
    // Never put the password (or its hash) in the audit log.
    audit(env, admin, id ? "admin_user.update" : "admin_user.create", "AdminUser", id ?? v.email, before, { ...v, password: v.password ? "(changed)" : undefined }, now),
  ];
  // Deactivating a staff member: their open enquiries become Unassigned (with a history line) so others can take them.
  if (id && before && Number(before.IsActive) === 1 && !v.isActive) {
    stmts.push(
      env.DB.prepare(
        `INSERT INTO EnquiryEvents (EnquiryId, Kind, AssignedTo, Note, ByAdminId, ByIdentity, CreatedAt)
         SELECT EnquiryId, 'assigned', NULL, 'Staff member deactivated', ?2, ?3, ?4 FROM Enquiries WHERE AssignedAdminId = ?1 AND Status IN ${OPEN}`,
      ).bind(id, admin.id, admin.email, now),
      env.DB.prepare(`UPDATE Enquiries SET AssignedAdminId = NULL, UpdatedAt = ?2, UpdatedBy = ?3 WHERE AssignedAdminId = ?1 AND Status IN ${OPEN}`).bind(id, now, admin.email),
    );
  }
  // A new password or deactivation signs that admin out everywhere (not yourself on a self password change).
  if (id && (hash || !v.isActive)) {
    stmts.push(env.DB.prepare("DELETE FROM AdminSessions WHERE AdminId = ?1 AND ?2 = 0").bind(id, b(String(before!.Email).toLowerCase() === admin.email && v.isActive)));
  }
  await unique(env.DB.batch(stmts), "This mobile number or email is already used by another staff member.");
  return { users: await listAdminUsers(env) };
}

// ------------------------------------------------------------------ customers (admin view)

export async function listCustomers(env: Env, url: URL): Promise<{ rows: AdminCustomerRow[] }> {
  // D1 refuses LIKE patterns longer than ~50 characters ("pattern too complex"): search on the first 40
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 40);
  const binds: unknown[] = [];
  let where = "";
  if (q) {
    binds.push(`%${q.replace(/[%_\\]/g, (m) => "\\" + m)}%`);
    where = `WHERE c.FullName LIKE ?1 ESCAPE '\\' OR c.Mobile LIKE ?1 ESCAPE '\\' OR c.Email LIKE ?1 ESCAPE '\\' OR c.BusinessName LIKE ?1 ESCAPE '\\'`;
  }
  const r = await env.DB.prepare(
    `SELECT c.CustomerId, c.FullName, c.Mobile, c.Email, c.BusinessName, c.City, c.IsActive, c.CreatedAt, c.LastLoginAt,
            (SELECT COALESCE(SUM(Points), 0) FROM RewardTransactions t WHERE t.CustomerId = c.CustomerId) AS Points,
            (SELECT COUNT(*) FROM Enquiries e WHERE e.CustomerId = c.CustomerId) AS Enq
     FROM Customers c ${where} ORDER BY c.CreatedAt DESC LIMIT ${url.searchParams.get("export") === "1" ? 5000 : 500}`,
  )
    .bind(...binds)
    .all<Record<string, unknown>>();
  return {
    rows: r.results.map((x) => ({
      id: x.CustomerId as number,
      name: x.FullName as string,
      mobile: x.Mobile as string,
      email: (x.Email as string) ?? null,
      business: (x.BusinessName as string) ?? null,
      city: (x.City as string) ?? null,
      isActive: x.IsActive === 1,
      points: x.Points as number,
      enquiries: x.Enq as number,
      createdAt: x.CreatedAt as string,
      lastLoginAt: (x.LastLoginAt as string) ?? null,
    })),
  };
}

export async function customerDetail(env: Env, id: number) {
  const list = await listCustomers(env, new URL("https://x/"));
  const row = list.rows.find((r) => r.id === id) ?? null;
  if (!row) throw new HttpError(404, "not_found", "Customer not found.");
  const enquiries = await loadEnquiries<Parameters<typeof toEnquiryView>[0]>(
    env,
    `SELECT EnquiryId, Reference, Status, CreatedAt, IndicativeTotalPaise, PricesVerified, Location, Comments FROM Enquiries WHERE CustomerId = ?1 ORDER BY CreatedAt DESC LIMIT 100`,
    [id],
  );
  return { customer: row, enquiries: enquiries.map(toEnquiryView), rewards: await rewardLedger(env, id) };
}

export async function setCustomerActive(env: Env, admin: AdminIdentity, id: number, body: unknown) {
  requireRole(admin, CONTENT_ROLES, "manage customers");
  const v = parse(z.object({ isActive: z.boolean() }).strict(), body);
  const now = nowIso();
  const res = await env.DB.batch([
    env.DB.prepare("UPDATE Customers SET IsActive = ?1, UpdatedAt = ?2 WHERE CustomerId = ?3").bind(b(v.isActive), now, id),
    ...(v.isActive ? [] : [env.DB.prepare("DELETE FROM CustomerSessions WHERE CustomerId = ?1").bind(id)]), // sign out everywhere
    audit(env, admin, v.isActive ? "customer.enable" : "customer.disable", "Customer", id, null, v, now),
  ]);
  if ((res[0].meta.changes ?? 0) !== 1) throw new HttpError(404, "not_found", "Customer not found.");
  return customerDetail(env, id);
}

export async function adjustPoints(env: Env, admin: AdminIdentity, id: number, body: unknown) {
  requireRole(admin, CONTENT_ROLES, "change reward points");
  const v = parse(PointsAdjustSchema, body);
  const cur = await env.DB.prepare("SELECT (SELECT COALESCE(SUM(Points), 0) FROM RewardTransactions WHERE CustomerId = ?1) AS bal, EXISTS (SELECT 1 FROM Customers WHERE CustomerId = ?1) AS ok").bind(id).first<{ bal: number; ok: number }>();
  if (!cur?.ok) throw new HttpError(404, "not_found", "Customer not found.");
  // a sale amount is turned into points at the current loyalty %
  const bp = v.salePaise ? (await loyaltyRate(env)).rateBasisPoints : null;
  const points = v.salePaise ? loyaltyPoints(v.salePaise, bp!) : v.points!;
  if (points === 0) throw new HttpError(422, "validation", "This sale is too small to earn a point.", [{ path: "salePaise", message: "Too small to earn a point" }]);
  if (cur.bal + points < 0) throw new HttpError(422, "validation", `Balance is only ${cur.bal} points.`, [{ path: "points", message: "Not enough points" }]);
  if (v.enquiryId) {
    const e = await env.DB.prepare("SELECT 1 FROM Enquiries WHERE EnquiryId = ?1 AND CustomerId = ?2").bind(v.enquiryId, id).first();
    if (!e) throw new HttpError(422, "validation", "That enquiry does not belong to this customer.");
  }
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO RewardTransactions (CustomerId, Points, Reason, EnquiryId, SalePaise, RateBasisPoints, CreatedBy, CreatedAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)").bind(id, points, v.reason, v.enquiryId ?? null, v.salePaise ?? null, bp, admin.email, now),
    audit(env, admin, "rewards.adjust", "Customer", id, { balance: cur.bal }, { ...v, points }, now),
  ]);
  return customerDetail(env, id);
}

export async function customerResetLink(env: Env, admin: AdminIdentity, id: number, origin: string) {
  requireRole(admin, CONTENT_ROLES, "reset customer passwords");
  return issueResetLink(env, origin, id, admin.email);
}

// ------------------------------------------------------------------ enquiries (admin view)

// ------------------------------------------------------------------ enquiries & sales pipeline
// Responsible staff member (staff-logged enquiries are assigned to their creator when logged).
const OWNER = "e.AssignedAdminId";
const CLOSED_STATUSES = ["won", "lost", "cancelled"];
const OPEN = "('new', 'contacted', 'quoted')";
const isManager = (admin: AdminIdentity) => CONTENT_ROLES.includes(admin.role);
/** Today's date in India (YYYY-MM-DD). */
const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

const ENQ_SELECT = `SELECT e.EnquiryId, e.Reference, e.Status, e.CreatedAt, e.UpdatedAt, e.UpdatedBy, e.IndicativeTotalPaise, e.PricesVerified, e.Location, e.Comments,
       e.CustomerId, c.FullName AS CustomerName, e.ContactName, e.BusinessName, e.Mobile, e.AdminNotes,
       e.Source, e.CreatedByAdminId, COALESCE(a.DisplayName, a.Email) AS CreatedByName,
       ${OWNER} AS OwnerId, COALESCE(o.DisplayName, o.Email) AS OwnerName,
       e.NotWonReason AS ClosedReason, e.ClosedNote, e.ClosedAt, e.SalePaise, e.FollowUpOn,
       (SELECT q.TotalPaise FROM Quotations q WHERE q.EnquiryId = e.EnquiryId ORDER BY q.QuotationId DESC LIMIT 1) AS QuotePaise,
       (SELECT q.QuotationId || '|' || q.Number || '|' || q.Status || '|' || date(q.CreatedAt, '+' || q.ValidDays || ' days') || '|' || q.TotalPaise FROM Quotations q WHERE q.EnquiryId = e.EnquiryId ORDER BY q.QuotationId DESC LIMIT 1) AS LatestQuote,
       (SELECT COALESCE(SUM(t.Points), 0) FROM RewardTransactions t WHERE t.EnquiryId = e.EnquiryId AND t.Kind IN ('sale', 'reversal')) AS PtsCredited,
       (SELECT COALESCE(SUM(p.Points), 0) FROM PendingRewards p WHERE p.EnquiryId = e.EnquiryId AND p.ClaimedAt IS NULL) AS PtsWaiting,
       (SELECT COUNT(*) FROM Quotations q WHERE q.EnquiryId = e.EnquiryId) AS QuoteCount
  FROM Enquiries e LEFT JOIN Customers c ON c.CustomerId = e.CustomerId
  LEFT JOIN AdminUsers a ON a.AdminId = e.CreatedByAdminId
  LEFT JOIN AdminUsers o ON o.AdminId = ${OWNER}`;

type EnqRow = Parameters<typeof toEnquiryView>[0] & Record<string, unknown>;
function toAdminEnquiry(r: EnqRow): AdminEnquiryRow {
  return {
    ...toEnquiryView(r),
    source: ((r.Source as string) ?? "website") as EnquirySource,
    createdBy: r.CreatedByAdminId ? { id: r.CreatedByAdminId as number, name: (r.CreatedByName as string) ?? "Staff" } : null,
    owner: r.OwnerId ? { id: r.OwnerId as number, name: (r.OwnerName as string) ?? "Staff" } : null,
    closedReason: (r.ClosedReason as ClosedReason) ?? null,
    closedNote: (r.ClosedNote as string) ?? null,
    closedAt: (r.ClosedAt as string) ?? null,
    followUpOn: (r.FollowUpOn as string) ?? null,
    points: { credited: (r.PtsCredited as number) ?? 0, waiting: (r.PtsWaiting as number) ?? 0 },
    latestQuote: r.LatestQuote
      ? (([qid, num, st, until, total]) => ({ id: Number(qid), number: num, status: st as NonNullable<AdminEnquiryRow["latestQuote"]>["status"], validUntil: until, totalPaise: Number(total) }))(String(r.LatestQuote).split("|"))
      : null,
    salePaise: (r.SalePaise as number) ?? null,
    quotePaise: (r.QuotePaise as number) ?? null,
    quoteCount: (r.QuoteCount as number) ?? 0,
    customerId: (r.CustomerId as number) ?? null,
    customerName: (r.CustomerName as string) ?? null,
    contactName: r.ContactName as string,
    business: (r.BusinessName as string) ?? null,
    mobile: r.Mobile as string,
    adminNotes: (r.AdminNotes as string) ?? null,
    updatedAt: r.UpdatedAt as string,
    updatedBy: (r.UpdatedBy as string) ?? null,
  };
}

async function oneEnquiry(env: Env, id: number): Promise<AdminEnquiryRow> {
  const rows = await loadEnquiries<EnqRow>(env, `${ENQ_SELECT} WHERE e.EnquiryId = ?1`, [id]);
  if (!rows[0]) throw new HttpError(404, "not_found", "Enquiry not found.");
  return toAdminEnquiry(rows[0]);
}

function enquiryEvent(env: Env, admin: AdminIdentity, enquiryId: number, e: { kind: "created" | "status" | "assigned"; from?: string | null; to?: string | null; assignedTo?: number | null; reason?: string | null; note?: string | null; salePaise?: number | null }, now: string) {
  return env.DB.prepare(
    `INSERT INTO EnquiryEvents (EnquiryId, Kind, FromStatus, ToStatus, AssignedTo, Reason, Note, SalePaise, ByAdminId, ByIdentity, CreatedAt)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
  ).bind(enquiryId, e.kind, e.from ?? null, e.to ?? null, e.assignedTo ?? null, e.reason ?? null, e.note ?? null, e.salePaise ?? null, admin.id, admin.email, now);
}

/** Owner/admin may act on any enquiry; other staff only on enquiries they are responsible for. */
async function requireEnquiryOwner(env: Env, admin: AdminIdentity, id: number) {
  const row = await env.DB.prepare(
    `SELECT e.Status, e.AdminNotes, e.SalePaise, ${OWNER} AS OwnerId, (SELECT COUNT(*) FROM Quotations q WHERE q.EnquiryId = e.EnquiryId) AS QuoteCount,
            (SELECT COUNT(*) FROM Quotations q WHERE q.EnquiryId = e.EnquiryId AND q.Status = 'accepted') AS AcceptedCount
     FROM Enquiries e WHERE e.EnquiryId = ?1`,
  )
    .bind(id)
    .first<{ Status: EnquiryStatus; AdminNotes: string | null; SalePaise: number | null; OwnerId: number | null; QuoteCount: number; AcceptedCount: number }>();
  if (!row) throw new HttpError(404, "not_found", "Enquiry not found.");
  if (!isManager(admin) && row.OwnerId !== admin.id)
    throw new HttpError(403, "forbidden", row.OwnerId ? "This enquiry is assigned to another staff member." : "Take this enquiry first, then you can update it.");
  return row;
}

export async function listEnquiries(env: Env, admin: AdminIdentity, url: URL): Promise<{ rows: AdminEnquiryRow[]; counts: Record<string, number> }> {
  const status = url.searchParams.get("status") ?? "";
  // D1 refuses LIKE patterns longer than ~50 characters ("pattern too complex"): search on the first 40
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 40);
  const where: string[] = [];
  const binds: unknown[] = [];
  // sales staff see only their own enquiries and unassigned ones they can pick up
  if (!isManager(admin)) {
    binds.push(admin.id);
    where.push(`(${OWNER} = ?${binds.length} OR ${OWNER} IS NULL)`);
  }
  if (status) {
    binds.push(status);
    where.push(`e.Status = ?${binds.length}`);
  }
  if (q) {
    binds.push(`%${q.replace(/[%_\\]/g, (m) => "\\" + m)}%`);
    const n = binds.length;
    where.push(`(e.Reference LIKE ?${n} ESCAPE '\\' OR e.ContactName LIKE ?${n} ESCAPE '\\' OR e.Mobile LIKE ?${n} ESCAPE '\\' OR e.BusinessName LIKE ?${n} ESCAPE '\\')`);
  }
  // follow-up date (open enquiries only, India date): overdue | today | none (no date set)
  const followup = url.searchParams.get("followup") ?? "";
  if (followup === "overdue" || followup === "today" || followup === "none") {
    where.push(`e.Status IN ${OPEN}`);
    if (followup === "none") where.push("e.FollowUpOn IS NULL");
    else {
      binds.push(istToday());
      where.push(`e.FollowUpOn ${followup === "overdue" ? "<" : "="} ?${binds.length}`);
    }
  }
  const source = url.searchParams.get("source") ?? "";
  if (source === "website" || source === "phone" || source === "whatsapp" || source === "visit") {
    binds.push(source);
    where.push(`e.Source = ?${binds.length}`);
  } else if (source === "staff") where.push("e.CreatedByAdminId IS NOT NULL");
  // responsible staff member: "me", "none" (unassigned) or a staff id
  const owner = url.searchParams.get("owner") ?? url.searchParams.get("staff") ?? "";
  if (owner === "me") {
    binds.push(admin.id);
    where.push(`${OWNER} = ?${binds.length}`);
  } else if (owner === "none") where.push(`${OWNER} IS NULL`);
  else if (/^\d{1,9}$/.test(owner)) {
    binds.push(Number(owner));
    where.push(`${OWNER} = ?${binds.length}`);
  }
  const rows = await loadEnquiries<EnqRow>(env, `${ENQ_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY e.CreatedAt DESC, e.EnquiryId DESC LIMIT ${url.searchParams.get("export") === "1" ? 5000 : 300}`, binds);
  const c = isManager(admin)
    ? await env.DB.prepare("SELECT Status, COUNT(*) AS n FROM Enquiries GROUP BY Status").all<{ Status: string; n: number }>()
    : await env.DB.prepare("SELECT Status, COUNT(*) AS n FROM Enquiries WHERE AssignedAdminId = ?1 OR AssignedAdminId IS NULL GROUP BY Status").bind(admin.id).all<{ Status: string; n: number }>();
  return { rows: rows.map(toAdminEnquiry), counts: Object.fromEntries(c.results.map((x) => [x.Status, x.n])) };
}

/**
 * Staff log a customer they reached out to themselves (phone, WhatsApp, visit). Any active staff role may
 * log; they become responsible for it. Product lines are a snapshot of the catalogue (listed prices only).
 */
export async function createStaffEnquiry(env: Env, admin: AdminIdentity, body: unknown): Promise<{ enquiry: AdminEnquiryRow }> {
  const v = parse(StaffEnquirySchema, body);
  const ids = [...new Set(v.items.map((i) => i.productId))];
  const products = ids.length
    ? await env.DB.prepare(
        `SELECT p.ProductId, p.ProductName, p.ModelNumber, p.IsActive, b.BrandName, pp.SellingPricePaise, pp.PriceUnit, pp.GSTRate, pp.GSTIncluded
         FROM Products p JOIN Brands b ON b.BrandId = p.BrandId LEFT JOIN ProductPrices pp ON pp.ProductId = p.ProductId
         WHERE p.ProductId IN (${ids.map((_, i) => `?${i + 1}`).join(",")})`,
      )
        .bind(...ids)
        .all<{ ProductId: number; ProductName: string; ModelNumber: string | null; IsActive: number; BrandName: string; SellingPricePaise: number | null; PriceUnit: string | null; GSTRate: number | null; GSTIncluded: number | null }>()
    : { results: [] };
  const byId = new Map(products.results.map((r) => [r.ProductId, r]));
  if (ids.some((x) => !byId.has(x))) throw new HttpError(422, "validation", "One of the products no longer exists. Refresh and try again.");
  let total = 0;
  let priced = 0;
  const items = v.items.map((i) => {
    const r = byId.get(i.productId)!;
    const unit = r.IsActive ? r.SellingPricePaise : null;
    if (unit !== null) {
      total += lineTotalPaise(unit, i.quantity);
      priced++;
    }
    return { ...i, r, unit };
  });
  const ref = reference();
  const now = nowIso();
  const closed = CLOSED_STATUSES.includes(v.status);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO Enquiries (Reference, ContactName, BusinessName, Mobile, Location, Comments, Status, PricesVerified, IndicativeTotalPaise, Source, CreatedByAdminId, AssignedAdminId, ClosedAt, CreatedAt, UpdatedAt, UpdatedBy, FollowUpOn)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11, ?12, ?13, ?13, ?14, ?15)`,
    ).bind(ref, v.name, v.business || null, v.mobile, v.location, v.need || null, v.status, priced > 0 ? 1 : 0, priced > 0 ? total : null, v.source, admin.id, closed ? now : null, now, admin.email, v.followUpOn ?? null),
    ...items.map((i) =>
      env.DB.prepare(
        `INSERT INTO EnquiryItems (EnquiryId, ProductId, ProductName, BrandName, ModelNumber, Quantity, UnitPricePaise, PriceUnit, GSTRate, GSTIncluded)
         SELECT EnquiryId, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10 FROM Enquiries WHERE Reference = ?1`,
      ).bind(ref, i.productId, i.r.ProductName, i.r.BrandName, i.r.ModelNumber, i.quantity, i.unit, i.r.PriceUnit ?? "per piece", i.r.GSTRate, i.r.GSTIncluded ?? 0),
    ),
    env.DB.prepare(
      `INSERT INTO EnquiryEvents (EnquiryId, Kind, ToStatus, AssignedTo, ByAdminId, ByIdentity, CreatedAt)
       SELECT EnquiryId, 'created', ?2, ?3, ?3, ?4, ?5 FROM Enquiries WHERE Reference = ?1`,
    ).bind(ref, v.status, admin.id, admin.email, now),
    audit(env, admin, "enquiry.log", "Enquiry", ref, null, { source: v.source, status: v.status, items: v.items.length }, now),
  ]);
  const row = await env.DB.prepare("SELECT EnquiryId FROM Enquiries WHERE Reference = ?1").bind(ref).first<{ EnquiryId: number }>();
  return { enquiry: await oneEnquiry(env, row!.EnquiryId) };
}

/**
 * Move an enquiry along the pipeline (and/or edit internal notes). Owner/admin: any enquiry; other staff:
 * only their own. Lost/cancelled store the reason, won stores the sale value; every stage change is logged.
 */
export async function updateEnquiry(env: Env, admin: AdminIdentity, id: number, body: unknown) {
  const v = parse(EnquiryAdminUpdateSchema, body);
  const before = await requireEnquiryOwner(env, admin, id);
  const now = nowIso();
  const to = v.status ?? before.Status;
  const changed = to !== before.Status;
  const closing = CLOSED_STATUSES.includes(to);
  // one clear path: closed enquiries are reopened only by the owner or an admin
  if (changed && CLOSED_STATUSES.includes(before.Status) && !isManager(admin))
    throw new HttpError(403, "forbidden", "Only the owner or an admin can reopen a closed enquiry.");
  // with a quotation, the sale is recorded by accepting the quotation (its total is the sale amount)
  if (changed && to === "won" && before.QuoteCount > 0)
    throw new HttpError(409, "use_quotation", "This enquiry has a quotation. Open the quotation and mark it Accepted: the sale amount comes from the quotation.");
  if (!changed && to === "won" && v.salePaise != null && v.salePaise !== before.SalePaise && !isManager(admin))
    throw new HttpError(403, "forbidden", "Only the owner or an admin can correct the sale amount.");
  // a sale recorded by an accepted quotation is undone on the quotation (keeps the two in step)
  if (changed && before.Status === "won" && before.AcceptedCount > 0)
    throw new HttpError(409, "use_quotation", "This sale came from an accepted quotation. Open the quotation and change its status instead: that also reopens the enquiry.");
  if (!changed && to === "won" && v.salePaise != null && v.salePaise !== before.SalePaise && before.AcceptedCount > 0)
    throw new HttpError(409, "use_quotation", "The sale amount comes from the accepted quotation. Change the quotation instead.");
  // Apply the change only if nobody changed the stage or sale in the meantime (double taps, two people at
  // once): otherwise bonus and points could be added twice.
  const main = await env.DB.prepare(
      `UPDATE Enquiries SET Status = ?1, AdminNotes = ?2, UpdatedAt = ?3, UpdatedBy = ?4,
         NotWonReason = CASE WHEN ?1 IN ('lost', 'cancelled') THEN COALESCE(?5, NotWonReason) ELSE NULL END,
         ClosedNote   = CASE WHEN ?1 IN ('lost', 'cancelled') THEN COALESCE(?6, ClosedNote) ELSE NULL END,
         SalePaise    = CASE WHEN ?1 = 'won' THEN COALESCE(?7, SalePaise) WHEN ?1 IN ('lost', 'cancelled') THEN NULL ELSE SalePaise END,
         ClosedAt     = CASE WHEN ?8 = 1 THEN (CASE WHEN ?9 = 1 THEN ?3 ELSE NULL END) ELSE ClosedAt END,
         FollowUpOn   = CASE WHEN ?9 = 1 THEN NULL WHEN ?11 = 1 THEN ?12 ELSE FollowUpOn END
       WHERE EnquiryId = ?10 AND Status = ?13 AND COALESCE(SalePaise, -1) = COALESCE(?14, -1)`,
  )
    .bind(to, v.adminNotes, now, admin.email, v.closedReason ?? null, v.closedNote?.trim() || null, v.salePaise ?? null, changed ? 1 : 0, closing ? 1 : 0, id, v.followUpOn !== undefined ? 1 : 0, v.followUpOn ?? null, before.Status, before.SalePaise)
    .run();
  if (!main.meta.changes) throw new HttpError(409, "changed", "Someone else just updated this enquiry. It has been refreshed: please check it and try again.");
  const stmts = [
    audit(env, admin, "enquiry.update", "Enquiry", id, { status: before.Status, adminNotes: before.AdminNotes }, v, now),
  ];
  if (changed) stmts.push(enquiryEvent(env, admin, id, { kind: "status", from: before.Status, to, reason: v.closedReason, note: v.closedNote, salePaise: to === "won" ? v.salePaise : null }, now));
  // staff bonus follows the sale (created when won, reversed when undone or corrected)
  const newSale = to === "won" ? (v.salePaise ?? before.SalePaise) : null;
  stmts.push(...(await bonusStatementsForSale(env, admin, id, { status: to, salePaise: newSale, ownerId: before.OwnerId }, now)));
  // the customer's loyalty points follow the sale the same way
  stmts.push(...(await loyaltyStatementsForSale(env, admin, id, { status: to, salePaise: newSale }, now)));
  await env.DB.batch(stmts);
  return { enquiry: await oneEnquiry(env, id) };
}

/** Owner/admin assign or reassign; any staff member may take an unassigned enquiry. */
export async function assignEnquiry(env: Env, admin: AdminIdentity, id: number, body: unknown) {
  const v = parse(EnquiryAssignSchema, body);
  const cur = await env.DB.prepare(`SELECT ${OWNER} AS OwnerId, e.Status, e.SalePaise FROM Enquiries e WHERE e.EnquiryId = ?1`).bind(id).first<{ OwnerId: number | null; Status: string; SalePaise: number | null }>();
  if (!cur) throw new HttpError(404, "not_found", "Enquiry not found.");
  let to: number | null;
  if ("take" in v) {
    if (cur.OwnerId === admin.id) return { enquiry: await oneEnquiry(env, id) };
    if (cur.OwnerId !== null) throw new HttpError(409, "taken", "Someone else already took this enquiry.");
    to = admin.id;
  } else {
    requireRole(admin, CONTENT_ROLES, "assign enquiries");
    to = v.adminId;
    if (to !== null) {
      const ok = await env.DB.prepare("SELECT 1 FROM AdminUsers WHERE AdminId = ?1 AND IsActive = 1").bind(to).first();
      if (!ok) throw new HttpError(422, "validation", "That staff member is not active.");
    }
  }
  const now = nowIso();
  // Guard against two people taking it at the same moment: only assign if still unassigned when taking.
  const upd = await env.DB.prepare(
    `UPDATE Enquiries SET AssignedAdminId = ?1, UpdatedAt = ?2, UpdatedBy = ?3 WHERE EnquiryId = ?4 ${"take" in v ? `AND ${OWNER.replace(/e\./g, "")} IS NULL` : ""}`,
  )
    .bind(to, now, admin.email, id)
    .run();
  if ("take" in v && !upd.meta.changes) throw new HttpError(409, "taken", "Someone else already took this enquiry.");
  await env.DB.batch([
    enquiryEvent(env, admin, id, { kind: "assigned", assignedTo: to }, now),
    ...(to !== null ? [env.DB.prepare("UPDATE Quotations SET OwnerAdminId = ?1 WHERE EnquiryId = ?2 AND Status IN ('draft', 'sent')").bind(to, id)] : []),
    audit(env, admin, "enquiry.assign", "Enquiry", id, { owner: cur.OwnerId }, { owner: to }, now),
    // a won sale's bonus moves to the newly responsible staff member
    ...(await bonusStatementsForSale(env, admin, id, { status: cur.Status, salePaise: cur.SalePaise, ownerId: to }, now)),
  ]);
  return { enquiry: await oneEnquiry(env, id) };
}

/** Stage changes and assignments of one enquiry, oldest first. */
export async function enquiryHistory(env: Env, admin: AdminIdentity, id: number): Promise<{ events: EnquiryEvent[] }> {
  if (!isManager(admin)) {
    const own = await env.DB.prepare("SELECT AssignedAdminId FROM Enquiries WHERE EnquiryId = ?1").bind(id).first<{ AssignedAdminId: number | null }>();
    if (!own) throw new HttpError(404, "not_found", "Enquiry not found.");
    if (own.AssignedAdminId !== null && own.AssignedAdminId !== admin.id) throw new HttpError(403, "forbidden", "This enquiry is assigned to another staff member.");
  }
  const r = await env.DB.prepare(
    `SELECT ev.EventId, ev.Kind, ev.FromStatus, ev.ToStatus, COALESCE(t.DisplayName, t.Email) AS AssignedName, ev.Reason, ev.Note, ev.SalePaise,
            COALESCE(b.DisplayName, b.Email, ev.ByIdentity) AS ByName, ev.CreatedAt
     FROM EnquiryEvents ev LEFT JOIN AdminUsers t ON t.AdminId = ev.AssignedTo LEFT JOIN AdminUsers b ON b.AdminId = ev.ByAdminId
     WHERE ev.EnquiryId = ?1 ORDER BY ev.CreatedAt, ev.EventId`,
  )
    .bind(id)
    .all<Record<string, unknown>>();
  return {
    events: r.results.map((x) => ({
      id: x.EventId as number,
      kind: x.Kind as EnquiryEvent["kind"],
      fromStatus: (x.FromStatus as EnquiryStatus) ?? null,
      toStatus: (x.ToStatus as EnquiryStatus) ?? null,
      assignedTo: (x.AssignedName as string) ?? null,
      reason: (x.Reason as ClosedReason) ?? null,
      note: (x.Note as string) ?? null,
      salePaise: (x.SalePaise as number) ?? null,
      by: (x.ByName as string) ?? null,
      at: x.CreatedAt as string,
    })),
  };
}

const IST = "'+5 hours', '+30 minutes'";
const ymd = (v: string | null, fallback: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback);

/**
 * Owner/admin: the sales pipeline per responsible staff member for enquiries created in the date range
 * (India time): how many were contacted, quoted, won (with sale value), lost or cancelled, average days to
 * the first quotation and to closing, lost/cancelled reasons, and a day/month/year breakdown.
 */
export async function enquiryStats(env: Env, admin: AdminIdentity, url: URL): Promise<EnquiryStats> {
  requireRole(admin, CONTENT_ROLES, "see staff performance");
  const period = (["day", "month", "year"] as const).find((x) => x === url.searchParams.get("period")) ?? "day";
  const source = (["website", "staff"] as const).find((x) => x === url.searchParams.get("source")) ?? "all";
  const istNow = Date.now() + 5.5 * 3600_000;
  const today = new Date(istNow).toISOString().slice(0, 10);
  const defaultFrom = period === "day" ? new Date(istNow - 29 * 86400_000).toISOString().slice(0, 10) : period === "month" ? `${today.slice(0, 4)}-01-01` : `${Number(today.slice(0, 4)) - 4}-01-01`;
  const from = ymd(url.searchParams.get("from"), defaultFrom);
  const to = ymd(url.searchParams.get("to"), today);
  const fmt = period === "day" ? "%Y-%m-%d" : period === "month" ? "%Y-%m" : "%Y";
  const scopeAll = `date(e.CreatedAt, ${IST}) BETWEEN ?1 AND ?2${source === "website" ? " AND e.Source = 'website'" : source === "staff" ? " AND e.CreatedByAdminId IS NOT NULL" : ""}`;
  // duplicates / wrong entries do not count for or against anyone
  const scope = `${scopeAll} AND NOT (e.Status IN ('lost', 'cancelled') AND COALESCE(e.NotWonReason, '') = 'duplicate')`;
  // reached the quotation stage: status quoted/won now, a recorded move to quoted, or a linked quotation
  const quoted = `(e.Status IN ('quoted', 'won') OR EXISTS (SELECT 1 FROM EnquiryEvents x WHERE x.EnquiryId = e.EnquiryId AND x.ToStatus = 'quoted') OR EXISTS (SELECT 1 FROM Quotations q WHERE q.EnquiryId = e.EnquiryId))`;
  const firstQuote = `(SELECT MIN(t) FROM (SELECT x.CreatedAt AS t FROM EnquiryEvents x WHERE x.EnquiryId = e.EnquiryId AND x.ToStatus = 'quoted' UNION ALL SELECT q.CreatedAt FROM Quotations q WHERE q.EnquiryId = e.EnquiryId))`;
  const [staffRows, unassigned, bucketRows, reasonRows, web] = await env.DB.batch([
    env.DB.prepare(
      `SELECT a.AdminId AS id, COALESCE(a.DisplayName, a.Email) AS name,
              COUNT(e.EnquiryId) AS total,
              COALESCE(SUM(e.Status <> 'new'), 0) AS contacted,
              COALESCE(SUM(${quoted}), 0) AS quoted,
              COALESCE(SUM(e.Status = 'won'), 0) AS won,
              COALESCE(SUM(e.Status IN ('lost', 'cancelled')), 0) AS lost,
              COALESCE(SUM(e.Status IN ${OPEN}), 0) AS open,
              (SELECT COUNT(*) FROM Enquiries f WHERE f.AssignedAdminId = a.AdminId AND f.Status IN ${OPEN} AND f.FollowUpOn < ?3) AS overdue,
              COALESCE(SUM(CASE WHEN e.Status = 'won' THEN e.SalePaise END), 0) AS salePaise,
              ROUND(AVG(julianday(${firstQuote}) - julianday(e.CreatedAt)), 1) AS avgDaysToQuote,
              ROUND(AVG(CASE WHEN e.Status = 'won' THEN julianday(e.ClosedAt) - julianday(e.CreatedAt) END), 1) AS avgDaysToClose
       FROM AdminUsers a LEFT JOIN Enquiries e ON ${OWNER} = a.AdminId AND ${scope}
       WHERE a.IsActive = 1 OR e.EnquiryId IS NOT NULL
       GROUP BY a.AdminId ORDER BY won DESC, total DESC, name`,
    ).bind(from, to, today),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM Enquiries e WHERE ${OWNER} IS NULL AND ${scope}`).bind(from, to),
    env.DB.prepare(
      `SELECT strftime(?3, e.CreatedAt, ${IST}) AS bucket, ${OWNER} AS staffId, COUNT(*) AS total,
              COALESCE(SUM(e.Status = 'won'), 0) AS won, COALESCE(SUM(CASE WHEN e.Status = 'won' THEN e.SalePaise END), 0) AS salePaise
       FROM Enquiries e WHERE ${scope}
       GROUP BY bucket, staffId ORDER BY bucket`,
    ).bind(from, to, fmt),
    env.DB.prepare(
      `SELECT e.NotWonReason AS reason, COUNT(*) AS count, ${OWNER} AS staffId
       FROM Enquiries e WHERE e.Status IN ('lost', 'cancelled') AND e.NotWonReason IS NOT NULL AND ${scopeAll}
       GROUP BY e.NotWonReason, staffId ORDER BY count DESC`,
    ).bind(from, to),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM Enquiries e WHERE e.Source = 'website' AND date(e.CreatedAt, ${IST}) BETWEEN ?1 AND ?2`).bind(from, to),
  ]);
  return {
    period,
    from,
    to,
    source,
    staff: staffRows.results as EnquiryStats["staff"],
    unassigned: (unassigned.results[0] as { n: number } | undefined)?.n ?? 0,
    buckets: bucketRows.results as EnquiryStats["buckets"],
    reasons: reasonRows.results as EnquiryStats["reasons"],
    websiteTotal: (web.results[0] as { n: number } | undefined)?.n ?? 0,
  };
}

// ------------------------------------------------------------------ my day

/** The signed-in staff member's day: follow-ups due (overdue first), new unassigned enquiries, quotations waiting. */
export async function myDay(env: Env, admin: AdminIdentity): Promise<MyDay> {
  const today = istToday();
  const soon = new Date(Date.parse(today) + 3 * 86400_000).toISOString().slice(0, 10);
  const [fu, nd, un, qs, done] = await env.DB.batch([
    env.DB.prepare(
      `SELECT EnquiryId AS id, Reference AS reference, ContactName AS name, Mobile AS mobile, Status AS status, FollowUpOn AS followUpOn
       FROM Enquiries WHERE AssignedAdminId = ?1 AND Status IN ${OPEN} AND FollowUpOn <= ?2 ORDER BY FollowUpOn, EnquiryId LIMIT 50`,
    ).bind(admin.id, today),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM Enquiries WHERE AssignedAdminId = ?1 AND Status IN ${OPEN} AND FollowUpOn IS NULL`).bind(admin.id),
    env.DB.prepare(
      "SELECT EnquiryId AS id, Reference AS reference, ContactName AS name, Source AS source, CreatedAt AS createdAt FROM Enquiries WHERE AssignedAdminId IS NULL AND Status = 'new' ORDER BY CreatedAt DESC LIMIT 20",
    ),
    // my open quotations that expire within 3 days or already have (validity counted from the creation date)
    env.DB.prepare(
      `SELECT QuotationId AS id, Number AS number, CustomerName AS customerName, CustomerMobile AS customerMobile, TotalPaise AS totalPaise, Status AS status,
              date(CreatedAt, '+' || ValidDays || ' days') AS validUntil
       FROM Quotations WHERE OwnerAdminId = ?1 AND Status IN ('draft', 'sent') AND date(CreatedAt, '+' || ValidDays || ' days') <= ?2
       ORDER BY validUntil LIMIT 20`,
    ).bind(admin.id, soon),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM EnquiryEvents WHERE ByAdminId = ?1 AND date(CreatedAt, ${IST}) = ?2`).bind(admin.id, today),
  ]);
  return {
    today,
    followUps: fu.results as MyDay["followUps"],
    noDate: (nd.results[0] as { n: number } | undefined)?.n ?? 0,
    unassigned: (un.results as MyDay["unassigned"]).map((x) => ({ ...x, source: (x.source ?? "website") as EnquirySource })),
    quotes: qs.results as MyDay["quotes"],
    doneToday: (done.results[0] as { n: number } | undefined)?.n ?? 0,
  };
}

// ------------------------------------------------------------------ bulk reassign (owner / admin)

const BulkAssignSchema = z
  .object({
    ids: z.array(z.number().int().positive()).min(1, "Choose at least one enquiry").max(300, "Choose at most 300 enquiries at a time"),
    adminId: z.number().int().positive().nullable(),
  })
  .strict();

/**
 * Move several open enquiries to one staff member (or back to Unassigned), e.g. for leave or a resignation.
 * Won / Not won enquiries are left as they are (their sale and bonus stay with whoever made it).
 * Their open quotations move with them; every move is written to the enquiry's history.
 */
export async function bulkAssign(env: Env, admin: AdminIdentity, body: unknown): Promise<{ moved: number; skipped: number }> {
  requireRole(admin, CONTENT_ROLES, "reassign enquiries");
  const v = parse(BulkAssignSchema, body);
  if (v.adminId !== null) {
    const ok = await env.DB.prepare("SELECT 1 FROM AdminUsers WHERE AdminId = ?1 AND IsActive = 1").bind(v.adminId).first();
    if (!ok) throw new HttpError(422, "validation", "That staff member is not active.");
  }
  const ids = [...new Set(v.ids)];
  const json = JSON.stringify(ids);
  const now = nowIso();
  // one JSON parameter (D1 allows at most 100 bound values); only open enquiries that actually change hands
  const scope = `EnquiryId IN (SELECT value FROM json_each(?1)) AND Status IN ${OPEN} AND COALESCE(AssignedAdminId, 0) <> COALESCE(?2, 0)`;
  const res = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO EnquiryEvents (EnquiryId, Kind, AssignedTo, Note, ByAdminId, ByIdentity, CreatedAt)
       SELECT EnquiryId, 'assigned', ?2, 'Reassigned in bulk', ?3, ?4, ?5 FROM Enquiries WHERE ${scope}`,
    ).bind(json, v.adminId, admin.id, admin.email, now),
    ...(v.adminId !== null
      ? [env.DB.prepare(`UPDATE Quotations SET OwnerAdminId = ?2 WHERE Status IN ('draft', 'sent') AND EnquiryId IN (SELECT EnquiryId FROM Enquiries WHERE ${scope})`).bind(json, v.adminId)]
      : []),
    env.DB.prepare(`UPDATE Enquiries SET AssignedAdminId = ?2, UpdatedAt = ?3, UpdatedBy = ?4 WHERE ${scope}`).bind(json, v.adminId, now, admin.email),
  ]);
  const moved = res.at(-1)!.meta.changes ?? 0;
  await audit(env, admin, "enquiry.bulk_assign", "Enquiry", `${moved} enquiries`, null, { adminId: v.adminId, ids }, now).run();
  return { moved, skipped: ids.length - moved };
}

// ------------------------------------------------------------------ WhatsApp message templates

/** Saved wording for the one-tap WhatsApp messages (admin only: not part of the public site settings). */
export async function getMessageTemplates(env: Env): Promise<{ templates: MessageSettings }> {
  const keys = JSON.stringify([...MESSAGE_KEYS, REVIEW_LINK_KEY]);
  const r = await env.DB.prepare("SELECT SettingKey, SettingValue FROM SiteSettings WHERE SettingKey IN (SELECT value FROM json_each(?1))").bind(keys).all<{ SettingKey: string; SettingValue: string }>();
  return { templates: Object.fromEntries(r.results.map((x) => [x.SettingKey, x.SettingValue])) as MessageSettings };
}

export async function saveMessageTemplates(env: Env, admin: AdminIdentity, body: unknown): Promise<{ templates: MessageSettings }> {
  requireRole(admin, CONTENT_ROLES, "change the WhatsApp messages");
  const v = parse(MessageSettingsSchema, body);
  const now = nowIso();
  const stmts = Object.entries(v.templates).map(([k, raw]) => {
    const val = raw.trim();
    const def = MESSAGE_TEMPLATES.find((t) => t.key === k)?.text;
    // empty or identical to the default: nothing stored, the default is used
    return !val || val === def
      ? env.DB.prepare("DELETE FROM SiteSettings WHERE SettingKey = ?1").bind(k)
      : env.DB.prepare(
          "INSERT INTO SiteSettings (SettingKey, SettingValue, UpdatedAt, UpdatedBy) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(SettingKey) DO UPDATE SET SettingValue = excluded.SettingValue, UpdatedAt = excluded.UpdatedAt, UpdatedBy = excluded.UpdatedBy",
        ).bind(k, val, now, admin.email);
  });
  await env.DB.batch([...stmts, audit(env, admin, "messages.update", "Settings", "whatsapp", null, v.templates, now)]);
  return getMessageTemplates(env);
}

// ------------------------------------------------------------------ downloads (Excel)

/** Record who downloaded which table (downloads can contain customer details). */
export async function logExport(env: Env, admin: AdminIdentity, body: unknown) {
  const v = parse(z.object({ table: z.string().trim().min(1).max(60), rows: z.number().int().min(0).max(1_000_000) }).strict(), body);
  await audit(env, admin, "export.download", "Export", v.table, null, { rows: v.rows }, nowIso()).run();
  return { ok: true };
}

// ------------------------------------------------------------------ stock status & offers (owner / admin)

/** Set a product's availability and offer. Publishes straight away (every page shows it). */
export async function setProductStatus(env: Env, admin: AdminIdentity, id: number, body: unknown) {
  requireRole(admin, CONTENT_ROLES, "change stock and offers");
  const v = parse(ProductStatusSchema, body);
  const before = await env.DB.prepare("SELECT StockStatus, OnOffer, OfferLabel FROM Products WHERE ProductId = ?1").bind(id).first<{ StockStatus: string; OnOffer: number; OfferLabel: string | null }>();
  if (!before) throw new HttpError(404, "not_found", "Product not found.");
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare("UPDATE Products SET StockStatus = ?1, OnOffer = ?2, OfferLabel = ?3, UpdatedAt = ?4, UpdatedBy = ?5 WHERE ProductId = ?6").bind(v.stock, b(v.onOffer), v.onOffer ? v.offerLabel : null, now, admin.email, id),
    audit(env, admin, "product.status", "Product", id, { stock: before.StockStatus, onOffer: before.OnOffer === 1, offerLabel: before.OfferLabel }, v, now),
  ]);
  await republish(env);
  return { stock: v.stock, onOffer: v.onOffer, offerLabel: v.onOffer ? v.offerLabel : null };
}

// ------------------------------------------------------------------ questions & answers (FAQ page and website helper)

export async function listFaqs(env: Env): Promise<AdminFaq[]> {
  const r = await env.DB.prepare("SELECT * FROM Faqs ORDER BY SortOrder, FaqId").all<Record<string, unknown>>();
  return r.results.map((x) => ({
    id: x.FaqId as number,
    topic: x.Topic as string,
    question: x.Question as string,
    answer: x.Answer as string,
    questionTa: (x.QuestionTa as string | null) ?? "",
    answerTa: (x.AnswerTa as string | null) ?? "",
    keywords: (x.Keywords as string | null) ?? "",
    sortOrder: x.SortOrder as number,
    isActive: x.IsActive === 1,
  }));
}

export async function saveFaq(env: Env, admin: AdminIdentity, id: number | null, body: unknown) {
  requireRole(admin, CONTENT_ROLES, "manage questions & answers");
  const v = parse(FaqInputSchema, body);
  const now = nowIso();
  const before = id ? await env.DB.prepare("SELECT * FROM Faqs WHERE FaqId = ?1").bind(id).first() : null;
  if (id && !before) throw new HttpError(404, "not_found", "Question not found.");
  const ta = (s: string) => s || null;
  const stmt = id
    ? env.DB.prepare(
        "UPDATE Faqs SET Topic = ?1, Question = ?2, Answer = ?3, QuestionTa = ?4, AnswerTa = ?5, Keywords = ?6, SortOrder = ?7, IsActive = ?8, UpdatedAt = ?9, UpdatedBy = ?10 WHERE FaqId = ?11",
      ).bind(v.topic, v.question, v.answer, ta(v.questionTa), ta(v.answerTa), v.keywords, v.sortOrder, b(v.isActive), now, admin.email, id)
    : env.DB.prepare(
        `INSERT INTO Faqs (Topic, Question, Answer, QuestionTa, AnswerTa, Keywords, SortOrder, IsActive, CreatedAt, UpdatedAt, UpdatedBy)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, CASE WHEN ?7 > 0 THEN ?7 ELSE COALESCE((SELECT MAX(SortOrder) + 10 FROM Faqs), 10) END, ?8, ?9, ?9, ?10)`,
      ).bind(v.topic, v.question, v.answer, ta(v.questionTa), ta(v.answerTa), v.keywords, v.sortOrder, b(v.isActive), now, admin.email);
  await env.DB.batch([stmt, audit(env, admin, id ? "faq.update" : "faq.create", "Faq", id, before, v, now)]);
  await republish(env);
  return { faqs: await listFaqs(env) };
}

export async function deleteFaq(env: Env, admin: AdminIdentity, id: number) {
  requireRole(admin, CONTENT_ROLES, "manage questions & answers");
  const before = await env.DB.prepare("SELECT * FROM Faqs WHERE FaqId = ?1").bind(id).first<Record<string, unknown>>();
  if (!before) throw new HttpError(404, "not_found", "Question not found.");
  await env.DB.batch([env.DB.prepare("DELETE FROM Faqs WHERE FaqId = ?1").bind(id), audit(env, admin, "faq.delete", "Faq", id, before, null, nowIso())]);
  await republish(env);
  return { faqs: await listFaqs(env) };
}
