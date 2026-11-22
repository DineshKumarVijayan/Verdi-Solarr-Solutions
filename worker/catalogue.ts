import type { StockStatus } from "../shared/stock";
// Public catalogue publication + price revalidation.
//
// D1 is authoritative. A denormalised snapshot (PublishedCatalogue, ONE row) is rebuilt
// whenever an admin changes catalogue data. Public reads then cost:
//   edge cache hit  -> 0 D1 rows
//   edge cache miss -> 1 D1 row (the snapshot)
//   no snapshot yet -> one rebuild (~1.3k rows today), then 1 row thereafter.

import { SITE_SETTING_KEYS, type PublicCatalogue, type PublicPrice, type PublicProduct, type PublicSpec, type RevalidatedItem } from "../shared/types";
import type { RevalidateRequest } from "../shared/schemas";
import type { Env } from "./env";
import { nowIso } from "./http";

/** Snapshot format version. Older snapshots (without field photos/settings) are rebuilt on read. */
export const SNAPSHOT_SCHEMA = 3; // 3: stock status and offers

/** Media abstraction: static deployment assets vs. R2 objects. */
export function mediaUrl(storageKey: string): string {
  if (storageKey.startsWith("r2:")) return `/api/media/${storageKey.slice(3).split("/").map(encodeURIComponent).join("/")}`;
  return storageKey; // static asset path, e.g. /datasheets/x.pdf
}

interface ProductRow {
  ProductId: number;
  SKU: string;
  ProductSlug: string;
  ProductName: string;
  SeriesKey: string | null;
  SeriesName: string | null;
  VariantLabel: string | null;
  ModelNumber: string | null;
  BrandId: number;
  CategoryId: number;
  ShortDescription: string | null;
  Description: string | null;
  HighlightsJson: string | null;
  IsFeatured: number;
  StockStatus: StockStatus;
  OnOffer: number;
  OfferLabel: string | null;
  SellingPricePaise: number | null;
  MRPPaise: number | null;
  GSTIncluded: number | null;
  GSTRate: number | null;
  PriceUnit: string | null;
  Version: number | null;
  PriceUpdatedAt: string | null;
}

function toPrice(r: Pick<ProductRow, "SellingPricePaise" | "MRPPaise" | "GSTIncluded" | "GSTRate" | "PriceUnit" | "Version" | "PriceUpdatedAt">): PublicPrice {
  return {
    sellingPaise: r.SellingPricePaise ?? null,
    mrpPaise: r.MRPPaise ?? null,
    gstIncluded: r.GSTIncluded === 1,
    gstRate: r.GSTRate ?? null,
    unit: r.PriceUnit ?? "per piece",
    version: r.Version ?? 0,
    updatedAt: r.PriceUpdatedAt ?? "",
  };
}

const PRODUCT_SELECT = `
  SELECT p.ProductId, p.SKU, p.ProductSlug, p.ProductName, p.SeriesKey, p.SeriesName, p.VariantLabel, p.ModelNumber,
         p.BrandId, p.CategoryId, p.ShortDescription, p.Description, p.HighlightsJson, p.IsFeatured, p.StockStatus, p.OnOffer, p.OfferLabel,
         pp.SellingPricePaise, pp.MRPPaise, pp.GSTIncluded, pp.GSTRate, pp.PriceUnit, pp.Version, pp.UpdatedAt AS PriceUpdatedAt
  FROM Products p
  JOIN Brands b ON b.BrandId = p.BrandId AND b.IsActive = 1
  JOIN Categories c ON c.CategoryId = p.CategoryId AND c.IsActive = 1
  LEFT JOIN ProductPrices pp ON pp.ProductId = p.ProductId
  WHERE p.IsActive = 1`;

/** Build the public catalogue from normalised tables. Only public fields are selected. */
export async function buildCatalogue(env: Env, version: number): Promise<PublicCatalogue> {
  const [brands, categories, products, specs, media, photos, settings] = await env.DB.batch([
    env.DB.prepare("SELECT BrandId, BrandSlug, BrandName, Description, Website, LogoStorageKey FROM Brands WHERE IsActive = 1 ORDER BY SortOrder, BrandName"),
    env.DB.prepare("SELECT CategoryId, CategorySlug, CategoryName, Description, SortOrder FROM Categories WHERE IsActive = 1 ORDER BY SortOrder, CategoryName"),
    env.DB.prepare(`${PRODUCT_SELECT} ORDER BY p.CategoryId, p.SeriesKey, p.ProductId`),
    env.DB.prepare(
      `SELECT s.ProductId, s.SpecificationKey, s.SpecificationLabel, s.SpecificationValue, s.Unit, s.SpecGroup
       FROM ProductSpecifications s JOIN Products p ON p.ProductId = s.ProductId AND p.IsActive = 1
       ORDER BY s.ProductId, s.SortOrder`,
    ),
    env.DB.prepare(
      `SELECT m.ProductId, m.MediaType, m.StorageKey, m.AltText
       FROM ProductMedia m JOIN Products p ON p.ProductId = m.ProductId AND p.IsActive = 1
       ORDER BY m.ProductId, m.IsPrimary DESC, m.SortOrder`,
    ),
    env.DB.prepare("SELECT StorageKey, Caption, Tag, IsTall FROM FieldPhotos WHERE IsActive = 1 ORDER BY SortOrder, PhotoId"),
    env.DB.prepare("SELECT SettingKey, SettingValue FROM SiteSettings"),
  ]);

  const specMap = new Map<number, PublicSpec[]>();
  for (const s of specs.results as Record<string, unknown>[]) {
    const id = s.ProductId as number;
    if (!specMap.has(id)) specMap.set(id, []);
    specMap.get(id)!.push({
      k: s.SpecificationKey as string,
      l: s.SpecificationLabel as string,
      v: s.SpecificationValue as string,
      u: (s.Unit as string | null) ?? null,
      g: s.SpecGroup as string,
    });
  }
  const datasheets = new Map<number, string>();
  const images = new Map<number, { url: string; alt: string | null }[]>();
  for (const m of media.results as Record<string, unknown>[]) {
    const id = m.ProductId as number;
    const url = mediaUrl(m.StorageKey as string);
    if (m.MediaType === "datasheet" && !datasheets.has(id)) datasheets.set(id, url);
    if (m.MediaType === "image") {
      if (!images.has(id)) images.set(id, []);
      images.get(id)!.push({ url, alt: (m.AltText as string | null) ?? null });
    }
  }

  const productRows = products.results as unknown as ProductRow[];
  const usedBrandIds = new Set(productRows.map((p) => p.BrandId));

  const settingMap: Record<string, string> = {};
  for (const r of settings.results as { SettingKey: string; SettingValue: string }[]) {
    if ((SITE_SETTING_KEYS as readonly string[]).includes(r.SettingKey)) settingMap[r.SettingKey] = r.SettingValue;
  }

  return {
    schema: SNAPSHOT_SCHEMA,
    version,
    publishedAt: nowIso(),
    brands: (brands.results as Record<string, unknown>[])
      .filter((b) => usedBrandIds.has(b.BrandId as number))
      .map((b) => ({
        id: b.BrandId as number,
        slug: b.BrandSlug as string,
        name: b.BrandName as string,
        description: (b.Description as string) ?? null,
        logo: b.LogoStorageKey ? mediaUrl(b.LogoStorageKey as string) : null,
        website: (b.Website as string) ?? null,
      })),
    categories: (categories.results as Record<string, unknown>[]).map((c) => ({
      id: c.CategoryId as number,
      slug: c.CategorySlug as string,
      name: c.CategoryName as string,
      description: (c.Description as string) ?? null,
      sort: c.SortOrder as number,
    })),
    products: productRows.map(
      (r): PublicProduct => ({
        id: r.ProductId,
        sku: r.SKU,
        slug: r.ProductSlug,
        name: r.ProductName,
        seriesKey: r.SeriesKey,
        seriesName: r.SeriesName,
        variant: r.VariantLabel,
        model: r.ModelNumber,
        brandId: r.BrandId,
        categoryId: r.CategoryId,
        short: r.ShortDescription,
        description: r.Description,
        highlights: safeJsonArray(r.HighlightsJson),
        featured: r.IsFeatured === 1,
        stock: r.StockStatus ?? "in_stock",
        offer: r.OnOffer === 1 ? { label: r.OfferLabel } : null,
        price: toPrice(r),
        datasheet: datasheets.get(r.ProductId) ?? null,
        images: images.get(r.ProductId) ?? [],
        specs: specMap.get(r.ProductId) ?? [],
      }),
    ),
    fieldPhotos: (photos.results as Record<string, unknown>[]).map((f) => ({
      src: mediaUrl(f.StorageKey as string),
      caption: f.Caption as string,
      tag: f.Tag as string,
      tall: f.IsTall === 1,
    })),
    settings: settingMap,
  };
}

function safeJsonArray(s: string | null): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Rebuild and store the snapshot. Called after every committed admin catalogue change. */
export async function publishCatalogue(env: Env): Promise<{ version: number; payload: string }> {
  const cur = await env.DB.prepare("SELECT Version FROM PublishedCatalogue WHERE Id = 1").first<{ Version: number }>();
  const version = (cur?.Version ?? 0) + 1;
  const catalogue = await buildCatalogue(env, version);
  const payload = JSON.stringify(catalogue);
  await env.DB.prepare(
    `INSERT INTO PublishedCatalogue (Id, Version, PayloadJson, PublishedAt) VALUES (1, ?1, ?2, ?3)
     ON CONFLICT(Id) DO UPDATE SET Version = excluded.Version, PayloadJson = excluded.PayloadJson, PublishedAt = excluded.PublishedAt`,
  )
    .bind(version, payload, catalogue.publishedAt)
    .run();
  return { version, payload };
}

/** Read the snapshot (1 row). Builds it on first use. */
export async function getPublishedCatalogue(env: Env): Promise<{ version: number; payload: string }> {
  const row = await env.DB.prepare("SELECT Version, PayloadJson FROM PublishedCatalogue WHERE Id = 1").first<{ Version: number; PayloadJson: string }>();
  // JSON.stringify keeps insertion order, so a current snapshot always starts with the schema marker.
  if (row && row.PayloadJson.startsWith(`{"schema":${SNAPSHOT_SCHEMA},`)) return { version: row.Version, payload: row.PayloadJson };
  return publishCatalogue(env);
}

export const CATALOGUE_CACHE_KEY = "https://verdi-cache.internal/api/catalogue";

export async function purgeCatalogueEdgeCache(): Promise<void> {
  // NOTE: Cache API purges are per data-centre. Other locations refresh within PUBLIC_CACHE_SECONDS.
  try {
    await caches.default.delete(CATALOGUE_CACHE_KEY);
  } catch {
    /* cache unavailable (e.g. local dev) */
  }
}

/** Serve the public catalogue with shared edge caching. */
export async function handleCatalogue(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const ttl = Math.max(10, Math.min(600, Number(env.PUBLIC_CACHE_SECONDS) || 60));
  let cache: Cache | null = null;
  try {
    cache = caches.default;
  } catch {
    cache = null;
  }
  let res = cache ? await cache.match(CATALOGUE_CACHE_KEY) : undefined;
  if (!res) {
    const { version, payload } = await getPublishedCatalogue(env);
    res = new Response(payload, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        // Browsers re-check after 30s; the edge keeps it for `ttl` seconds.
        "Cache-Control": `public, max-age=30, s-maxage=${ttl}`,
        ETag: `W/"cat-${version}"`,
        "X-Catalogue-Version": String(version),
        "X-Content-Type-Options": "nosniff",
      },
    });
    if (cache) ctx.waitUntil(cache.put(CATALOGUE_CACHE_KEY, res.clone()));
  }
  const etag = res.headers.get("ETag");
  if (etag && request.headers.get("If-None-Match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": res.headers.get("Cache-Control") ?? "no-cache" } });
  }
  return res;
}

/**
 * Authoritative price check for an enquiry. ONE query against D1 for up to 50 items.
 * Reads current prices straight from ProductPrices (never from the cache).
 */
export async function revalidate(env: Env, body: RevalidateRequest): Promise<{ items: RevalidatedItem[]; checkedAt: string }> {
  const ids = [...new Set(body.items.map((i) => i.productId))];
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(",");
  const rows = await env.DB.prepare(
    `SELECT p.ProductId, p.ProductName, p.ModelNumber, p.IsActive, b.BrandName,
            pp.SellingPricePaise, pp.MRPPaise, pp.GSTIncluded, pp.GSTRate, pp.PriceUnit, pp.Version, pp.UpdatedAt AS PriceUpdatedAt
     FROM Products p JOIN Brands b ON b.BrandId = p.BrandId
     LEFT JOIN ProductPrices pp ON pp.ProductId = p.ProductId
     WHERE p.ProductId IN (${placeholders})`,
  )
    .bind(...ids)
    .all<ProductRow & { ProductName: string; IsActive: number; BrandName: string }>();
  const byId = new Map(rows.results.map((r) => [r.ProductId, r]));
  const items: RevalidatedItem[] = body.items.map((it) => {
    const r = byId.get(it.productId);
    if (!r) return { productId: it.productId, found: false, active: false, name: null, model: null, brand: null, price: null, changed: true };
    const price = toPrice(r);
    const changed =
      (it.seenSellingPaise !== undefined && it.seenSellingPaise !== price.sellingPaise) ||
      (it.seenVersion !== undefined && it.seenVersion !== price.version && it.seenSellingPaise === undefined);
    return { productId: it.productId, found: true, active: r.IsActive === 1, name: r.ProductName, model: r.ModelNumber, brand: r.BrandName, price, changed };
  });
  return { items, checkedAt: nowIso() };
}
