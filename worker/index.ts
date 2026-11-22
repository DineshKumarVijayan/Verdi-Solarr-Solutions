// VERDI SOLARR — Cloudflare Worker entry.
// Only /api/* reaches this code (see wrangler.jsonc `run_worker_first`); every other
// request is served directly from static assets without a Worker invocation.

import { RevalidateSchema } from "../shared/schemas";
import type { AdminIdentity } from "../shared/types";
import { dashboard, listPrices, priceHistory, updatePrice } from "./admin";
import { adminChangePassword, adminLogin, adminLogout, assertSameOrigin, requireAdmin, staffHintCookie } from "./auth";
import * as quotes from "./quotations";
import { handleCatalogue, revalidate } from "./catalogue";
import { LIVE_PATHS, livePage, robots, sitemap } from "./seo";
import * as content from "./content";
import * as bonus from "./bonus";
import * as loyalty from "./loyalty";
import * as customers from "./customers";
import type { Env } from "./env";
import { errorResponse, HttpError, json, readJson } from "./http";

async function rateLimit(limiter: Env["PUBLIC_LIMITER"], key: string): Promise<void> {
  if (!limiter) return;
  try {
    const { success } = await limiter.limit({ key });
    if (!success) throw new HttpError(429, "rate_limited", "Too many requests. Please wait a minute and try again.");
  } catch (e) {
    if (e instanceof HttpError) throw e; // limiter infrastructure errors must not take the site down
  }
}

const R2_KEY = /^[a-z0-9][a-z0-9/_.-]{0,200}$/i;

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";

  // ------------------------------------------------- SEO (non-API, see seo.ts)
  if (!path.startsWith("/api/")) {
    if (path === "/sitemap.xml") return sitemap(request, env, ctx);
    if (path === "/robots.txt") return robots(request);
    if (path.startsWith("/products/") || path.startsWith("/category/") || LIVE_PATHS.includes(path.replace(/\/+$/, "") || "/")) return livePage(request, env, ctx);
    return env.ASSETS.fetch(request);
  }

  // ------------------------------------------------------------------ public
  if (path === "/api/health" && method === "GET") {
    return json({ ok: true, time: new Date().toISOString() });
  }

  if (path.startsWith("/api/q/") && method === "GET") {
    await rateLimit(env.PUBLIC_LIMITER, `quote:${ip}`);
    return quotes.servePdf(env, path.slice("/api/q/".length));
  }

  if (path === "/api/catalogue" && (method === "GET" || method === "HEAD")) {
    return handleCatalogue(request, env, ctx);
  }

  if (path === "/api/enquiry/revalidate" && method === "POST") {
    await rateLimit(env.PUBLIC_LIMITER, `reval:${ip}`);
    const parsed = RevalidateSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new HttpError(422, "validation", "Invalid enquiry items.");
    return json(await revalidate(env, parsed.data));
  }

  // ------------------------------------------------------- customer accounts
  if (path.startsWith("/api/account/") || path === "/api/enquiries") {
    if (method !== "GET") {
      customers.assertSameSite(request);
      // Sign-in/registration get a tighter per-IP budget than enquiry submissions.
      const auth = path.startsWith("/api/account/");
      await rateLimit(auth ? (env.AUTH_LIMITER ?? env.PUBLIC_LIMITER) : env.PUBLIC_LIMITER, `${auth ? "acct" : "enq"}:${ip}`);
    }
    if (path === "/api/account/me" && method === "GET") return customers.me(request, env);
    if (path === "/api/account/register" && method === "POST") return customers.register(request, env, await readJson(request));
    if (path === "/api/account/login" && method === "POST") return customers.login(request, env, await readJson(request));
    if (path === "/api/account/logout" && method === "POST") return customers.logout(request, env);
    if (path === "/api/account/profile" && method === "PUT") return customers.updateProfile(request, env, await readJson(request));
    if (path === "/api/account/password" && method === "PUT") return customers.changePassword(request, env, await readJson(request));
    if (path === "/api/account/reset" && method === "POST") return customers.resetPassword(request, env, await readJson(request));
    if (path === "/api/account/enquiries" && method === "GET") return customers.myEnquiries(request, env);
    if (path === "/api/account/rewards" && method === "GET") return customers.myRewards(request, env);
    if (path === "/api/enquiries" && method === "POST") return customers.createEnquiry(request, env, await readJson(request, 32 * 1024));
    throw new HttpError(404, "not_found", "Unknown account endpoint.");
  }

  if (path.startsWith("/api/media/") && method === "GET") {
    // Phase 2: admin-uploaded images/datasheets stored in R2 (read-only, public).
    const key = decodeURIComponent(path.slice("/api/media/".length));
    if (!R2_KEY.test(key) || key.includes("..")) throw new HttpError(400, "bad_key", "Invalid media key.");
    if (key.startsWith("quote/")) throw new HttpError(404, "not_found", "Not found."); // quotations only via /api/q/<token>
    if (!env.MEDIA) throw new HttpError(404, "not_found", "Media storage not configured.");
    // Keys are random and never reused, so files are immutable: cache at the edge and in the browser.
    let cache: Cache | null = null;
    try {
      cache = caches.default;
    } catch {
      cache = null;
    }
    const cacheKey = new Request(`https://verdi-cache.internal/media/${key}`);
    const hit = cache ? await cache.match(cacheKey) : undefined;
    if (hit) return hit;
    const obj = await env.MEDIA.get(key);
    if (!obj) throw new HttpError(404, "not_found", "File not found.");
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("ETag", obj.httpEtag);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("X-Content-Type-Options", "nosniff");
    const res = new Response(obj.body, { headers });
    if (cache) ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  }

  // ------------------------------------------------------------------- admin
  if (path === "/api/admin/login" && method === "POST") {
    customers.assertSameSite(request);
    await rateLimit(env.AUTH_LIMITER ?? env.PUBLIC_LIMITER, `admin-login:${ip}`);
    return adminLogin(request, env, await readJson(request));
  }
  if (path === "/api/admin/password" && method === "POST") {
    customers.assertSameSite(request);
    await rateLimit(env.AUTH_LIMITER ?? env.PUBLIC_LIMITER, `admin-login:${ip}`);
    return adminChangePassword(request, env, await readJson(request));
  }
  if (path === "/api/admin/logout" && method === "POST") {
    customers.assertSameSite(request);
    return adminLogout(request, env);
  }

  if (path.startsWith("/api/admin/")) {
    const admin = await requireAdmin(request, env);
    if (method !== "GET") {
      assertSameOrigin(request, env);
      await rateLimit(env.ADMIN_LIMITER, `admin:${admin.email}`);
    }

    if (path === "/api/admin/me" && method === "GET") {
      const res = json({ admin });
      res.headers.append("Set-Cookie", staffHintCookie(url)); // lets the public header show the staff name
      return res;
    }
    if (path === "/api/admin/dashboard" && method === "GET") return json(await dashboard(env, admin));
    if (path === "/api/admin/my-day" && method === "GET") return json(await content.myDay(env, admin));
    if (path === "/api/admin/exports" && method === "POST") return json(await content.logExport(env, admin, await readJson(request)));
    if (path === "/api/admin/message-templates" && method === "GET") return json(await content.getMessageTemplates(env));
    if (path === "/api/admin/message-templates" && method === "PUT") return json(await content.saveMessageTemplates(env, admin, await readJson(request, 32 * 1024)));
    if (path === "/api/admin/prices" && method === "GET") return json(await listPrices(env, url));

    const m = path.match(/^\/api\/admin\/prices\/(\d{1,9})(\/history)?$/);
    if (m) {
      const productId = Number(m[1]);
      if (m[2] && method === "GET") return json({ history: await priceHistory(env, productId) });
      if (!m[2] && method === "PUT") return json(await updatePrice(env, admin, productId, await readJson(request)));
    }

    const res = await adminContent(request, env, admin, path, method, url);
    if (res) return res;
    throw new HttpError(404, "not_found", "Unknown admin endpoint.");
  }

  throw new HttpError(404, "not_found", "Unknown API endpoint.");
}

/** Admin content-management routes. Returns null when no route matches. */
async function adminContent(request: Request, env: Env, admin: AdminIdentity, path: string, method: string, url: URL): Promise<Response | null> {
  const body = (max?: number) => readJson(request, max);
  const seg = path.slice("/api/admin/".length).split("/");
  const id = seg[1] && /^\d{1,9}$/.test(seg[1]) ? Number(seg[1]) : null;
  const [res, , sub, subId] = seg;
  const subNum = subId && /^\d{1,9}$/.test(subId) ? Number(subId) : null;

  switch (res) {
    case "loyalty":
      if (seg.length === 1 && method === "GET") return json(await loyalty.loyaltyRate(env));
      if (seg.length === 1 && method === "PUT") return json(await loyalty.setLoyaltyRate(env, admin, await body()));
      if (seg[1] === "pending" && seg.length === 2 && method === "GET") return json(await loyalty.listPendingRewards(env, admin));
      break;
    case "bonus":
      if (seg.length === 1 && method === "GET") return json(await bonus.overview(env, admin));
      if (seg[1] === "entries" && seg.length === 2 && method === "GET") return json(await bonus.listEntries(env, admin, url));
      if (seg[1] === "rates" && seg.length === 2 && method === "PUT") return json(await bonus.setRate(env, admin, await body()));
      if (seg[1] === "approve" && seg.length === 2 && method === "POST") return json(await bonus.approve(env, admin, await body(32 * 1024)));
      if (seg[1] === "adjustments" && seg.length === 2 && method === "POST") return json(await bonus.addAdjustment(env, admin, await body()), { status: 201 });
      if (seg[1] === "payouts" && seg.length === 2 && method === "POST") return json(await bonus.pay(env, admin, await body(64 * 1024)), { status: 201 });
      if (seg[1] === "payouts" && /^\d{1,9}$/.test(seg[2] ?? "") && seg[3] === "cancel" && seg.length === 4 && method === "POST") return json(await bonus.cancelPayout(env, admin, Number(seg[2]), await body()));
      break;
    case "brands":
      if (seg.length === 1 && method === "GET") return json({ brands: await content.listBrands(env) });
      if (seg.length === 1 && method === "POST") return json(await content.saveBrand(env, admin, null, await body()), { status: 201 });
      if (id && seg.length === 2 && method === "PUT") return json(await content.saveBrand(env, admin, id, await body()));
      if (id && seg.length === 2 && method === "DELETE") return json(await content.deleteBrand(env, admin, id));
      break;
    case "categories":
      if (seg.length === 1 && method === "GET") return json({ categories: await content.listCategories(env) });
      if (seg.length === 1 && method === "POST") return json(await content.saveCategory(env, admin, null, await body()), { status: 201 });
      if (id && seg.length === 2 && method === "PUT") return json(await content.saveCategory(env, admin, id, await body()));
      if (id && seg.length === 2 && method === "DELETE") return json(await content.deleteCategory(env, admin, id));
      break;
    case "products":
      if (seg.length === 1 && method === "GET") return json(await content.listProducts(env, url));
      if (seg.length === 1 && method === "POST") return json(await content.createProduct(env, admin, await body(256 * 1024)), { status: 201 });
      if (id && seg.length === 2 && method === "GET") return json({ product: await content.getProduct(env, id) });
      if (id && seg.length === 2 && method === "PUT") return json(await content.updateProduct(env, admin, id, await body(256 * 1024)));
      if (id && seg.length === 2 && method === "DELETE") return json(await content.deleteProduct(env, admin, id));
      if (id && sub === "status" && seg.length === 3 && method === "PUT") return json(await content.setProductStatus(env, admin, id, await body()));
      if (id && sub === "duplicate" && seg.length === 3 && method === "POST") return json(await content.duplicateProduct(env, admin, id), { status: 201 });
      if (id && sub === "media" && seg.length === 3 && method === "POST") return json(await content.addMedia(env, admin, id, await body()), { status: 201 });
      if (id && sub === "media" && subNum && method === "PUT") return json(await content.updateMedia(env, admin, id, subNum, await body()));
      if (id && sub === "media" && subNum && method === "DELETE") return json(await content.deleteMedia(env, admin, id, subNum));
      break;
    case "uploads":
      if (seg.length === 1 && method === "POST") return json(await content.upload(env, admin, request, url), { status: 201 });
      break;
    case "field-photos":
      if (seg.length === 1 && method === "GET") return json({ photos: await content.listFieldPhotos(env) });
      if (seg.length === 1 && method === "POST") return json(await content.saveFieldPhoto(env, admin, null, await body()), { status: 201 });
      if (id && seg.length === 2 && method === "PUT") return json(await content.saveFieldPhoto(env, admin, id, await body()));
      if (id && seg.length === 2 && method === "DELETE") return json(await content.deleteFieldPhoto(env, admin, id));
      break;
    case "faqs":
      if (seg.length === 1 && method === "GET") return json({ faqs: await content.listFaqs(env) });
      if (seg.length === 1 && method === "POST") return json(await content.saveFaq(env, admin, null, await body()), { status: 201 });
      if (id && seg.length === 2 && method === "PUT") return json(await content.saveFaq(env, admin, id, await body()));
      if (id && seg.length === 2 && method === "DELETE") return json(await content.deleteFaq(env, admin, id));
      break;
    case "settings":
      if (seg.length === 1 && method === "GET") return json({ settings: await content.getSettings(env) });
      if (seg.length === 1 && method === "PUT") return json(await content.saveSettings(env, admin, await body()));
      break;
    case "users":
      content.requireRole(admin, ["owner"], "manage admin users");
      if (seg.length === 1 && method === "GET") return json({ users: await content.listAdminUsers(env) });
      if (seg.length === 1 && method === "POST") return json(await content.saveAdminUser(env, admin, null, await body()), { status: 201 });
      if (id && seg.length === 2 && method === "PUT") return json(await content.saveAdminUser(env, admin, id, await body()));
      break;
    case "customers":
      content.requireRole(admin, ["owner", "admin"], "see customer accounts");
      if (seg.length === 1 && method === "GET") return json(await content.listCustomers(env, url));
      if (id && seg.length === 2 && method === "GET") return json(await content.customerDetail(env, id));
      if (id && seg.length === 2 && method === "PUT") return json(await content.setCustomerActive(env, admin, id, await body()));
      if (id && sub === "points" && seg.length === 3 && method === "POST") return json(await content.adjustPoints(env, admin, id, await body()));
      if (id && sub === "reset-link" && seg.length === 3 && method === "POST") return json(await content.customerResetLink(env, admin, id, url.origin));
      break;
    case "quotations":
      if (seg[1] === "settings" && seg.length === 2 && method === "GET") return json({ settings: await quotes.getQuoteSettings(env) });
      if (seg[1] === "settings" && seg.length === 2 && method === "PUT") return json({ settings: await quotes.saveQuoteSettings(env, admin, await body()) });
      if (seg.length === 1 && method === "GET") return json(await quotes.listQuotations(env, admin, url));
      if (seg.length === 1 && method === "POST") return json({ quote: await quotes.createQuotation(env, admin, await body(128 * 1024)) }, { status: 201 });
      if (id && seg.length === 2 && method === "GET") return json({ quote: await quotes.viewQuotation(env, admin, id) });
      if (id && seg.length === 2 && method === "PUT") return json({ quote: await quotes.updateQuotation(env, admin, id, await body(128 * 1024)) });
      if (id && seg.length === 2 && method === "DELETE") return json(await quotes.deleteQuotation(env, admin, id));
      if (id && sub === "status" && seg.length === 3 && method === "PUT") return json({ quote: await quotes.setQuotationStatus(env, admin, id, await body()) });
      if (id && sub === "pdf" && seg.length === 3 && method === "POST") return json(await quotes.shareQuotationPdf(env, admin, id, request));
      break;
    case "enquiries":
      if (seg[1] === "bulk-assign" && seg.length === 2 && method === "POST") return json(await content.bulkAssign(env, admin, await body(32 * 1024)));
      if (seg.length === 1 && method === "GET") return json(await content.listEnquiries(env, admin, url));
      if (seg.length === 1 && method === "POST") return json(await content.createStaffEnquiry(env, admin, await body(64 * 1024)), { status: 201 });
      if (seg[1] === "stats" && seg.length === 2 && method === "GET") return json(await content.enquiryStats(env, admin, url));
      if (id && seg.length === 2 && method === "PUT") return json(await content.updateEnquiry(env, admin, id, await body()));
      if (id && sub === "assign" && seg.length === 3 && method === "POST") return json(await content.assignEnquiry(env, admin, id, await body()));
      if (id && sub === "history" && seg.length === 3 && method === "GET") return json(await content.enquiryHistory(env, admin, id));
      break;
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(request, env, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  },
} satisfies ExportedHandler<Env>;
