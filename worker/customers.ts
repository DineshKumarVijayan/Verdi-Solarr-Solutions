// Customer accounts, sessions, enquiry recording/history and reward points.
// Completely separate from admin authentication (which is Cloudflare Access + AdminUsers).

import { CUSTOMER_MAX_DAYS, IDLE_MINUTES, SLIDE_EVERY_MINUTES } from "../shared/session";
import {
  EnquiryCreateSchema,
  issues,
  LoginSchema,
  normaliseMobile,
  PasswordChangeSchema,
  PasswordResetSchema,
  ProfileUpdateSchema,
  RegisterSchema,
} from "../shared/admin-schemas";
import { lineTotalPaise } from "../shared/money";
import type { CustomerProfile, EnquiryItemView, EnquiryStatus, EnquiryView, RewardEntry } from "../shared/types";
import { DUMMY_HASH, hashPassword, randomToken, sha256Hex, verifyPassword } from "./crypto";
import type { Env } from "./env";
import { HttpError, json, nowIso } from "./http";

// Sessions: signed out after IDLE_MINUTES without activity; at most CUSTOMER_MAX_DAYS in total.
const SESSION_DAYS = CUSTOMER_MAX_DAYS;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

// ------------------------------------------------------------------ cookies

function cookieName(url: URL): string {
  // __Host- prefix (Secure, Path=/, no Domain) on HTTPS; plain name for http://localhost dev.
  return url.protocol === "https:" ? "__Host-vs_session" : "vs_session";
}

export function readCookie(request: Request, name: string): string | null {
  const raw = request.headers.get("Cookie") ?? "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function sessionCookies(url: URL, token: string | null): string[] {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  const maxAge = token ? SESSION_DAYS * 86400 : 0;
  return [
    `${cookieName(url)}=${token ?? ""}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`,
    // Non-secret hint so the browser only asks /api/account/me when a session may exist.
    `vs_signed_in=${token ? "1" : ""}; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`,
  ];
}

function withCookies(res: Response, cookies: string[]): Response {
  for (const c of cookies) res.headers.append("Set-Cookie", c);
  return res;
}

/** CSRF protection for cookie-authenticated customer writes. */
export function assertSameSite(request: Request): void {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (!origin) throw new HttpError(403, "bad_origin", "Missing Origin header.");
  let host = "";
  try {
    host = new URL(origin).host;
  } catch {
    /* fallthrough */
  }
  if (host !== url.host) throw new HttpError(403, "bad_origin", "Cross-origin requests are not allowed.");
  const site = request.headers.get("Sec-Fetch-Site");
  if (site && site !== "same-origin") throw new HttpError(403, "bad_origin", "Cross-site requests are not allowed.");
}

// ------------------------------------------------------------------ sessions

interface CustomerRow {
  CustomerId: number;
  FullName: string;
  Mobile: string;
  Email: string | null;
  BusinessName: string | null;
  City: string | null;
  CreatedAt: string;
}

export async function currentCustomer(request: Request, env: Env): Promise<CustomerRow | null> {
  const url = new URL(request.url);
  const token = readCookie(request, cookieName(url));
  if (!token || !/^[A-Za-z0-9_-]{30,100}$/.test(token)) return null;
  const now = new Date();
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT c.CustomerId, c.FullName, c.Mobile, c.Email, c.BusinessName, c.City, c.CreatedAt, s.ExpiresAt AS SessionExpiresAt
     FROM CustomerSessions s JOIN Customers c ON c.CustomerId = s.CustomerId
     WHERE s.SessionHash = ?1 AND s.ExpiresAt > ?2 AND s.CreatedAt > ?3 AND c.IsActive = 1`,
  )
    .bind(hash, now.toISOString(), new Date(now.getTime() - CUSTOMER_MAX_DAYS * 86400_000).toISOString())
    .first<CustomerRow & { SessionExpiresAt: string }>();
  if (!row) return null;
  if (Date.parse(row.SessionExpiresAt) - now.getTime() < (IDLE_MINUTES - SLIDE_EVERY_MINUTES) * 60_000) {
    await env.DB.prepare("UPDATE CustomerSessions SET ExpiresAt = ?1 WHERE SessionHash = ?2").bind(new Date(now.getTime() + IDLE_MINUTES * 60_000).toISOString(), hash).run();
  }
  const { SessionExpiresAt: _, ...customer } = row;
  return customer;
}

async function requireCustomer(request: Request, env: Env): Promise<CustomerRow> {
  const c = await currentCustomer(request, env);
  if (!c) throw new HttpError(401, "unauthenticated", "Please sign in to your account.");
  return c;
}

async function startSession(request: Request, env: Env, customerId: number): Promise<string[]> {
  const token = randomToken();
  const now = new Date();
  const expires = new Date(now.getTime() + IDLE_MINUTES * 60_000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM CustomerSessions WHERE ExpiresAt < ?1").bind(now.toISOString()), // expired sessions only
    env.DB.prepare("INSERT INTO CustomerSessions (SessionHash, CustomerId, CreatedAt, ExpiresAt, UserAgent) VALUES (?1, ?2, ?3, ?4, ?5)").bind(
      await sha256Hex(token),
      customerId,
      now.toISOString(),
      expires.toISOString(),
      (request.headers.get("User-Agent") ?? "").slice(0, 200),
    ),
    env.DB.prepare("UPDATE Customers SET LastLoginAt = ?1, FailedLogins = 0, LockedUntil = NULL WHERE CustomerId = ?2").bind(now.toISOString(), customerId),
  ]);
  return sessionCookies(new URL(request.url), token);
}

async function points(env: Env, customerId: number): Promise<number> {
  const r = await env.DB.prepare("SELECT COALESCE(SUM(Points), 0) AS p FROM RewardTransactions WHERE CustomerId = ?1").bind(customerId).first<{ p: number }>();
  return r?.p ?? 0;
}

async function profile(env: Env, c: CustomerRow): Promise<CustomerProfile> {
  return {
    id: c.CustomerId,
    name: c.FullName,
    mobile: c.Mobile,
    email: c.Email,
    business: c.BusinessName,
    city: c.City,
    points: await points(env, c.CustomerId),
    createdAt: c.CreatedAt,
  };
}

// ------------------------------------------------------------------ handlers

function invalid(e: import("zod").ZodError): never {
  throw new HttpError(422, "validation", e.issues[0]?.message ?? "Please check the form.", issues(e));
}

export async function register(request: Request, env: Env, body: unknown): Promise<Response> {
  const p = RegisterSchema.safeParse(body);
  if (!p.success) invalid(p.error);
  const v = p.data;
  const dup = await env.DB.prepare("SELECT Mobile, Email FROM Customers WHERE Mobile = ?1 OR (?2 IS NOT NULL AND Email = ?2)").bind(v.mobile, v.email).first<{ Mobile: string; Email: string | null }>();
  if (dup) {
    const which = dup.Mobile === v.mobile ? "mobile number" : "email";
    throw new HttpError(409, "exists", `An account with this ${which} already exists. Please sign in instead.`);
  }
  const hash = await hashPassword(v.password, env);
  const now = nowIso();
  const r = await env.DB.prepare(
    `INSERT INTO Customers (FullName, Mobile, Email, BusinessName, City, PasswordHash, CreatedAt, UpdatedAt) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)`,
  )
    .bind(v.name, v.mobile, v.email, v.business, v.city, hash, now)
    .run();
  const id = r.meta.last_row_id as number;
  const cookies = await startSession(request, env, id);
  const row = await env.DB.prepare("SELECT CustomerId, FullName, Mobile, Email, BusinessName, City, CreatedAt FROM Customers WHERE CustomerId = ?1").bind(id).first<CustomerRow>();
  return withCookies(json({ customer: await profile(env, row!) }, { status: 201 }), cookies);
}

export async function login(request: Request, env: Env, body: unknown): Promise<Response> {
  const p = LoginSchema.safeParse(body);
  if (!p.success) invalid(p.error);
  const { login: id, password } = p.data;
  const mobile = normaliseMobile(id);
  const row = await env.DB.prepare(
    `SELECT CustomerId, PasswordHash, IsActive, FailedLogins, LockedUntil FROM Customers WHERE ${mobile ? "Mobile = ?1" : "Email = ?1"}`,
  )
    .bind(mobile ?? id.toLowerCase())
    .first<{ CustomerId: number; PasswordHash: string; IsActive: number; FailedLogins: number; LockedUntil: string | null }>();

  const ok = await verifyPassword(password, row?.PasswordHash ?? DUMMY_HASH, env); // always hash: no timing hint
  const generic = new HttpError(401, "bad_credentials", "Mobile number / email or password is incorrect.");
  if (!row) throw generic;
  if (row.LockedUntil && row.LockedUntil > nowIso()) {
    throw new HttpError(429, "locked", `Too many failed attempts. Please try again after ${LOCK_MINUTES} minutes or contact us on WhatsApp.`);
  }
  if (!row.IsActive) throw new HttpError(403, "disabled", "This account is disabled. Please contact us on WhatsApp.");
  if (!ok) {
    const failed = row.FailedLogins + 1;
    const lock = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
    await env.DB.prepare("UPDATE Customers SET FailedLogins = ?1, LockedUntil = ?2 WHERE CustomerId = ?3").bind(lock ? 0 : failed, lock, row.CustomerId).run();
    throw generic;
  }
  const cookies = await startSession(request, env, row.CustomerId);
  const c = await env.DB.prepare("SELECT CustomerId, FullName, Mobile, Email, BusinessName, City, CreatedAt FROM Customers WHERE CustomerId = ?1").bind(row.CustomerId).first<CustomerRow>();
  return withCookies(json({ customer: await profile(env, c!) }), cookies);
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = readCookie(request, cookieName(url));
  if (token) await env.DB.prepare("DELETE FROM CustomerSessions WHERE SessionHash = ?1").bind(await sha256Hex(token)).run();
  return withCookies(json({ ok: true }), sessionCookies(url, null));
}

export async function me(request: Request, env: Env): Promise<Response> {
  const c = await currentCustomer(request, env);
  if (!c) return withCookies(json({ customer: null }), sessionCookies(new URL(request.url), null));
  return json({ customer: await profile(env, c) });
}

export async function updateProfile(request: Request, env: Env, body: unknown): Promise<Response> {
  const c = await requireCustomer(request, env);
  const p = ProfileUpdateSchema.safeParse(body);
  if (!p.success) invalid(p.error);
  const v = p.data;
  if (v.email) {
    const dup = await env.DB.prepare("SELECT 1 FROM Customers WHERE Email = ?1 AND CustomerId <> ?2").bind(v.email, c.CustomerId).first();
    if (dup) throw new HttpError(409, "exists", "Another account already uses this email.");
  }
  await env.DB.prepare("UPDATE Customers SET FullName = ?1, Email = ?2, BusinessName = ?3, City = ?4, UpdatedAt = ?5 WHERE CustomerId = ?6")
    .bind(v.name, v.email, v.business, v.city, nowIso(), c.CustomerId)
    .run();
  return json({ customer: await profile(env, { ...c, FullName: v.name, Email: v.email, BusinessName: v.business, City: v.city }) });
}

export async function changePassword(request: Request, env: Env, body: unknown): Promise<Response> {
  const c = await requireCustomer(request, env);
  const p = PasswordChangeSchema.safeParse(body);
  if (!p.success) invalid(p.error);
  const row = await env.DB.prepare("SELECT PasswordHash FROM Customers WHERE CustomerId = ?1").bind(c.CustomerId).first<{ PasswordHash: string }>();
  if (!row || !(await verifyPassword(p.data.currentPassword, row.PasswordHash, env))) {
    throw new HttpError(422, "validation", "Your current password is incorrect.", [{ path: "currentPassword", message: "Incorrect password" }]);
  }
  await env.DB.batch([
    env.DB.prepare("UPDATE Customers SET PasswordHash = ?1, UpdatedAt = ?2 WHERE CustomerId = ?3").bind(await hashPassword(p.data.newPassword, env), nowIso(), c.CustomerId),
    env.DB.prepare("DELETE FROM CustomerSessions WHERE CustomerId = ?1").bind(c.CustomerId), // sign out other devices
  ]);
  const cookies = await startSession(request, env, c.CustomerId);
  return withCookies(json({ ok: true }), cookies);
}

export async function resetPassword(request: Request, env: Env, body: unknown): Promise<Response> {
  const p = PasswordResetSchema.safeParse(body);
  if (!p.success) invalid(p.error);
  const th = await sha256Hex(p.data.token);
  const t = await env.DB.prepare("SELECT CustomerId FROM PasswordResetTokens WHERE TokenHash = ?1 AND UsedAt IS NULL AND ExpiresAt > ?2").bind(th, nowIso()).first<{ CustomerId: number }>();
  if (!t) throw new HttpError(400, "invalid_token", "This reset link is invalid or has expired. Please ask us for a new one.");
  const now = nowIso();
  const res = await env.DB.batch([
    env.DB.prepare("UPDATE PasswordResetTokens SET UsedAt = ?1 WHERE TokenHash = ?2 AND UsedAt IS NULL").bind(now, th),
    env.DB.prepare("UPDATE Customers SET PasswordHash = ?1, FailedLogins = 0, LockedUntil = NULL, UpdatedAt = ?2 WHERE CustomerId = ?3 AND changes() = 1").bind(
      await hashPassword(p.data.newPassword, env),
      now,
      t.CustomerId,
    ),
    env.DB.prepare("DELETE FROM CustomerSessions WHERE CustomerId = ?1").bind(t.CustomerId),
  ]);
  if ((res[0].meta.changes ?? 0) !== 1) throw new HttpError(400, "invalid_token", "This reset link has already been used.");
  const cookies = await startSession(request, env, t.CustomerId);
  return withCookies(json({ ok: true }), cookies);
}

/** Admin: issue a one-time reset link (valid 48 h). Returned once; only the hash is stored. */
export async function issueResetLink(env: Env, origin: string, customerId: number, adminEmail: string): Promise<{ url: string; expiresAt: string }> {
  const c = await env.DB.prepare("SELECT CustomerId FROM Customers WHERE CustomerId = ?1").bind(customerId).first();
  if (!c) throw new HttpError(404, "not_found", "Customer not found.");
  const token = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 48 * 3600_000).toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE PasswordResetTokens SET UsedAt = ?1 WHERE CustomerId = ?2 AND UsedAt IS NULL").bind(now.toISOString(), customerId), // revoke older links
    env.DB.prepare("INSERT INTO PasswordResetTokens (TokenHash, CustomerId, CreatedBy, CreatedAt, ExpiresAt) VALUES (?1, ?2, ?3, ?4, ?5)").bind(
      await sha256Hex(token),
      customerId,
      adminEmail,
      now.toISOString(),
      expiresAt,
    ),
    env.DB.prepare("INSERT INTO AuditLogs (AdminIdentity, Action, EntityType, EntityId, AfterValue, CreatedAt) VALUES (?1, 'customer.reset_link', 'Customer', ?2, ?3, ?4)").bind(
      adminEmail,
      String(customerId),
      JSON.stringify({ expiresAt }),
      now.toISOString(),
    ),
  ]);
  return { url: `${origin}/account/reset?token=${token}`, expiresAt };
}

// ------------------------------------------------------------------ enquiries

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function reference(): string {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const r = crypto.getRandomValues(new Uint8Array(5));
  return `VS-${ymd}-${[...r].map((b) => REF_ALPHABET[b % REF_ALPHABET.length]).join("")}`;
}

/** Record an enquiry from the basket. Prices are read from D1 here, never trusted from the browser. */
export async function createEnquiry(request: Request, env: Env, body: unknown): Promise<Response> {
  const p = EnquiryCreateSchema.safeParse(body);
  if (!p.success) invalid(p.error);
  const v = p.data;
  const customer = await currentCustomer(request, env);

  const ids = [...new Set(v.items.map((i) => i.productId))];
  const rows = await env.DB.prepare(
    `SELECT p.ProductId, p.ProductName, p.ModelNumber, p.IsActive, b.BrandName,
            pp.SellingPricePaise, pp.PriceUnit, pp.GSTRate, pp.GSTIncluded
     FROM Products p JOIN Brands b ON b.BrandId = p.BrandId LEFT JOIN ProductPrices pp ON pp.ProductId = p.ProductId
     WHERE p.ProductId IN (${ids.map((_, i) => `?${i + 1}`).join(",")})`,
  )
    .bind(...ids)
    .all<{ ProductId: number; ProductName: string; ModelNumber: string | null; IsActive: number; BrandName: string; SellingPricePaise: number | null; PriceUnit: string | null; GSTRate: number | null; GSTIncluded: number | null }>();
  const byId = new Map(rows.results.map((r) => [r.ProductId, r]));

  let total = 0;
  let priced = 0;
  const items = v.items
    .filter((i) => byId.has(i.productId))
    .map((i) => {
      const r = byId.get(i.productId)!;
      const unit = v.pricesVerified && r.IsActive ? r.SellingPricePaise : null;
      if (unit !== null) {
        total += lineTotalPaise(unit, i.quantity);
        priced++;
      }
      return { ...i, r, unit };
    });
  if (items.length === 0) throw new HttpError(422, "validation", "None of these products are available any more.");

  const ref = reference();
  const now = nowIso();
  const c = v.customer;
  const stmts = [
    env.DB.prepare(
      `INSERT INTO Enquiries (Reference, CustomerId, ContactName, BusinessName, Mobile, Location, Comments, PricesVerified, IndicativeTotalPaise, CreatedAt, UpdatedAt)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)`,
    ).bind(ref, customer?.CustomerId ?? null, c.name, c.business || null, c.mobile, c.location, c.comments || null, v.pricesVerified ? 1 : 0, priced > 0 ? total : null, now),
    ...items.map((i) =>
      env.DB.prepare(
        `INSERT INTO EnquiryItems (EnquiryId, ProductId, ProductName, BrandName, ModelNumber, Quantity, UnitPricePaise, PriceUnit, GSTRate, GSTIncluded)
         SELECT EnquiryId, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10 FROM Enquiries WHERE Reference = ?1`,
      ).bind(ref, i.productId, i.r.ProductName, i.r.BrandName, i.r.ModelNumber, i.quantity, i.unit, i.r.PriceUnit ?? "per piece", i.r.GSTRate, i.r.GSTIncluded ?? 0),
    ),
  ];
  await env.DB.batch(stmts);
  return json({ reference: ref, linkedToAccount: !!customer }, { status: 201 });
}

interface EnquiryDbRow {
  EnquiryId: number;
  Reference: string;
  Status: EnquiryStatus;
  CreatedAt: string;
  IndicativeTotalPaise: number | null;
  PricesVerified: number;
  Location: string;
  Comments: string | null;
}

/** Load enquiries + their items with two queries. `where` must use bound parameters only. */
export async function loadEnquiries<T extends EnquiryDbRow>(env: Env, sql: string, binds: unknown[]): Promise<(T & { items: EnquiryItemView[] })[]> {
  const head = await env.DB.prepare(sql).bind(...binds).all<T>();
  if (head.results.length === 0) return [];
  const ids = head.results.map((r) => r.EnquiryId);
  const items = await env.DB.prepare(
    `SELECT EnquiryId, ProductId, ProductName, BrandName, ModelNumber, Quantity, UnitPricePaise, PriceUnit, GSTRate, GSTIncluded
     FROM EnquiryItems WHERE EnquiryId IN (SELECT value FROM json_each(?1)) ORDER BY EnquiryItemId`, // one JSON parameter: D1 allows at most 100 bound values
  )
    .bind(JSON.stringify(ids))
    .all<Record<string, unknown>>();
  const map = new Map<number, EnquiryItemView[]>();
  for (const it of items.results) {
    const id = it.EnquiryId as number;
    if (!map.has(id)) map.set(id, []);
    map.get(id)!.push({
      productId: (it.ProductId as number) ?? null,
      name: it.ProductName as string,
      brand: (it.BrandName as string) ?? null,
      model: (it.ModelNumber as string) ?? null,
      quantity: it.Quantity as number,
      unitPaise: (it.UnitPricePaise as number) ?? null,
      unit: (it.PriceUnit as string) ?? null,
      gstRate: (it.GSTRate as number) ?? null,
      gstIncluded: it.GSTIncluded === 1,
    });
  }
  return head.results.map((r) => ({ ...r, items: map.get(r.EnquiryId) ?? [] }));
}

export function toEnquiryView(r: EnquiryDbRow & { items: EnquiryItemView[] }): EnquiryView {
  return {
    id: r.EnquiryId,
    reference: r.Reference,
    status: r.Status,
    createdAt: r.CreatedAt,
    totalPaise: r.IndicativeTotalPaise,
    pricesVerified: r.PricesVerified === 1,
    location: r.Location,
    comments: r.Comments,
    items: r.items,
  };
}

export async function myEnquiries(request: Request, env: Env): Promise<Response> {
  const c = await requireCustomer(request, env);
  const rows = await loadEnquiries<EnquiryDbRow>(
    env,
    `SELECT EnquiryId, Reference, Status, CreatedAt, IndicativeTotalPaise, PricesVerified, Location, Comments
     FROM Enquiries WHERE CustomerId = ?1 ORDER BY CreatedAt DESC, EnquiryId DESC LIMIT 100`,
    [c.CustomerId],
  );
  return json({ enquiries: rows.map(toEnquiryView) });
}

export async function rewardLedger(env: Env, customerId: number): Promise<RewardEntry[]> {
  const r = await env.DB.prepare(
    `SELECT t.TransactionId, t.Points, t.Reason, t.CreatedAt, e.Reference
     FROM RewardTransactions t LEFT JOIN Enquiries e ON e.EnquiryId = t.EnquiryId
     WHERE t.CustomerId = ?1 ORDER BY t.CreatedAt DESC, t.TransactionId DESC LIMIT 200`,
  )
    .bind(customerId)
    .all<Record<string, unknown>>();
  return r.results.map((x) => ({
    id: x.TransactionId as number,
    points: x.Points as number,
    reason: x.Reason as string,
    enquiryReference: (x.Reference as string) ?? null,
    createdAt: x.CreatedAt as string,
  }));
}

export async function myRewards(request: Request, env: Env): Promise<Response> {
  const c = await requireCustomer(request, env);
  return json({ balance: await points(env, c.CustomerId), entries: await rewardLedger(env, c.CustomerId) });
}
