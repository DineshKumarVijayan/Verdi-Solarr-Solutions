// Admin authentication & authorisation.
//
// Admins sign in with mobile number (or email) + password, checked against the D1 AdminUsers table.
//  * Passwords: salted PBKDF2-SHA256 hashes (worker/crypto.ts); never stored or logged in plaintext.
//  * Sessions: random token in an HttpOnly, SameSite=Strict cookie; only its SHA-256 is stored (AdminSessions).
//  * Every privileged API call re-checks the session AND that the admin is still active, then the role.
//  * Brute force: per-IP rate limit (index.ts) + account lock after 5 failures for 15 minutes.
//  * Timeout: signed out after IDLE_MINUTES without activity (sliding ExpiresAt), ADMIN_MAX_HOURS at most.
//  * New / owner-reset passwords must be replaced by the staff member before a session is issued.

import { AdminPasswordChangeSchema, issues, LoginSchema, normaliseMobile } from "../shared/admin-schemas";
import { ADMIN_MAX_HOURS, IDLE_MINUTES, SLIDE_EVERY_MINUTES } from "../shared/session";
import type { AdminIdentity, AdminRole } from "../shared/types";
import { DUMMY_HASH, hashPassword, randomToken, sha256Hex, verifyPassword } from "./crypto";
import { readCookie } from "./customers";
import type { Env } from "./env";
import { HttpError, json, nowIso } from "./http";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export const adminCookieName = (url: URL) => (url.protocol === "https:" ? "__Host-vs_admin" : "vs_admin");

function adminCookies(url: URL, token: string | null): string[] {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  const maxAge = token ? ADMIN_MAX_HOURS * 3600 : 0;
  return [
    `${adminCookieName(url)}=${token ?? ""}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`,
    // Non-secret hint so the public pages can show "Admin dashboard" instead of "Staff sign-in".
    `vs_staff=${token ? "1" : ""}; Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`,
  ];
}

/** Non-secret hint cookie so public pages know a staff session may exist (refreshed on /api/admin/me). */
export function staffHintCookie(url: URL): string {
  return `vs_staff=1; Path=/; SameSite=Lax; Max-Age=${ADMIN_MAX_HOURS * 3600}${url.protocol === "https:" ? "; Secure" : ""}`;
}

const idleDeadline = (now: Date) => new Date(now.getTime() + IDLE_MINUTES * 60_000).toISOString();

export async function requireAdmin(request: Request, env: Env): Promise<AdminIdentity> {
  const token = readCookie(request, adminCookieName(new URL(request.url)));
  if (!token || !/^[A-Za-z0-9_-]{30,100}$/.test(token)) throw new HttpError(401, "unauthenticated", "Please sign in to continue.");
  const now = new Date();
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT a.AdminId, a.Email, a.DisplayName, a.Role, s.ExpiresAt FROM AdminSessions s JOIN AdminUsers a ON a.AdminId = s.AdminId
     WHERE s.SessionHash = ?1 AND s.ExpiresAt > ?2 AND s.CreatedAt > ?3 AND a.IsActive = 1 AND a.MustChangePassword = 0`,
  )
    .bind(hash, now.toISOString(), new Date(now.getTime() - ADMIN_MAX_HOURS * 3600_000).toISOString())
    .first<{ AdminId: number; Email: string; DisplayName: string | null; Role: AdminRole; ExpiresAt: string }>();
  if (!row) throw new HttpError(401, "unauthenticated", "You were signed out. Please sign in again.");
  // Activity keeps the session alive (sliding idle timeout); written at most every few minutes.
  if (Date.parse(row.ExpiresAt) - now.getTime() < (IDLE_MINUTES - SLIDE_EVERY_MINUTES) * 60_000) {
    await env.DB.prepare("UPDATE AdminSessions SET ExpiresAt = ?1 WHERE SessionHash = ?2").bind(idleDeadline(now), hash).run();
  }
  return { id: row.AdminId, email: row.Email.toLowerCase(), displayName: row.DisplayName, role: row.Role };
}

type AdminLoginRow = { AdminId: number; Email: string; DisplayName: string | null; Role: AdminRole; PasswordHash: string | null; IsActive: number; FailedLogins: number; LockedUntil: string | null; MustChangePassword: number };

/** Look up a staff member by mobile (or email) and check the password, with lockout. Shared by sign-in and password change. */
async function checkCredentials(env: Env, login: string, password: string): Promise<AdminLoginRow> {
  const mobile = normaliseMobile(login);
  const row = await env.DB.prepare(
    `SELECT AdminId, Email, DisplayName, Role, PasswordHash, IsActive, FailedLogins, LockedUntil, MustChangePassword FROM AdminUsers WHERE ${mobile ? "Mobile = ?1" : "Email = ?1"}`,
  )
    .bind(mobile ?? login.toLowerCase())
    .first<AdminLoginRow>();
  const ok = await verifyPassword(password, row?.PasswordHash ?? DUMMY_HASH, env); // always hash: no timing hint
  const generic = new HttpError(401, "bad_credentials", "Mobile number or password is incorrect.");
  if (!row || !row.PasswordHash) throw generic;
  if (row.LockedUntil && row.LockedUntil > nowIso()) throw new HttpError(429, "locked", `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.`);
  if (!row.IsActive) throw new HttpError(403, "disabled", "This staff account is disabled. Please contact the owner.");
  if (!ok) {
    const failed = row.FailedLogins + 1;
    const lock = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
    await env.DB.prepare("UPDATE AdminUsers SET FailedLogins = ?1, LockedUntil = ?2 WHERE AdminId = ?3").bind(lock ? 0 : failed, lock, row.AdminId).run();
    throw lock ? new HttpError(429, "locked", `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.`) : generic;
  }
  return row;
}

/** Issue a new session for a verified staff member. */
async function startAdminSession(request: Request, env: Env, row: AdminLoginRow, extra: D1PreparedStatement[] = []): Promise<Response> {
  const token = randomToken();
  const now = new Date();
  await env.DB.batch([
    ...extra,
    env.DB.prepare("DELETE FROM AdminSessions WHERE ExpiresAt < ?1").bind(now.toISOString()), // expired sessions only
    env.DB.prepare("INSERT INTO AdminSessions (SessionHash, AdminId, CreatedAt, ExpiresAt, UserAgent) VALUES (?1, ?2, ?3, ?4, ?5)").bind(
      await sha256Hex(token),
      row.AdminId,
      now.toISOString(),
      idleDeadline(now),
      (request.headers.get("User-Agent") ?? "").slice(0, 200),
    ),
    env.DB.prepare("UPDATE AdminUsers SET FailedLogins = 0, LockedUntil = NULL, LastLoginAt = ?1 WHERE AdminId = ?2").bind(now.toISOString(), row.AdminId),
    env.DB.prepare("INSERT INTO AuditLogs (AdminIdentity, Action, EntityType, EntityId, CreatedAt) VALUES (?1, 'admin.login', 'AdminUser', ?2, ?3)").bind(row.Email.toLowerCase(), String(row.AdminId), now.toISOString()),
  ]);
  const res = json({ admin: { id: row.AdminId, email: row.Email.toLowerCase(), displayName: row.DisplayName, role: row.Role } satisfies AdminIdentity });
  for (const c of adminCookies(new URL(request.url), token)) res.headers.append("Set-Cookie", c);
  return res;
}

/**
 * Staff change their own password (sign-in page or admin header): mobile/email + current password.
 * Works for first sign-in with the owner's temporary password. Signs out every other session.
 */
export async function adminChangePassword(request: Request, env: Env, body: unknown): Promise<Response> {
  const p = AdminPasswordChangeSchema.safeParse(body);
  if (!p.success) throw new HttpError(422, "validation", p.error.issues[0]?.message ?? "Please check the form.", issues(p.error));
  const row = await checkCredentials(env, p.data.login, p.data.currentPassword);
  if (await verifyPassword(p.data.newPassword, row.PasswordHash!, env)) {
    throw new HttpError(422, "validation", "Choose a password different from the current one.", [{ path: "newPassword", message: "Must differ from the current password" }]);
  }
  const now = nowIso();
  return startAdminSession(request, env, row, [
    env.DB.prepare("UPDATE AdminUsers SET PasswordHash = ?1, MustChangePassword = 0, PasswordChangedAt = ?2, UpdatedAt = ?2 WHERE AdminId = ?3").bind(await hashPassword(p.data.newPassword, env), now, row.AdminId),
    env.DB.prepare("DELETE FROM AdminSessions WHERE AdminId = ?1").bind(row.AdminId), // sign out everywhere else
    env.DB.prepare("INSERT INTO AuditLogs (AdminIdentity, Action, EntityType, EntityId, CreatedAt) VALUES (?1, 'admin.password_change', 'AdminUser', ?2, ?3)").bind(row.Email.toLowerCase(), String(row.AdminId), now),
  ]);
}

export async function adminLogin(request: Request, env: Env, body: unknown): Promise<Response> {
  const p = LoginSchema.safeParse(body);
  if (!p.success) throw new HttpError(422, "validation", p.error.issues[0]?.message ?? "Please check the form.", issues(p.error));
  const row = await checkCredentials(env, p.data.login, p.data.password);
  // Temporary password from the owner: no session until the staff member sets their own.
  if (row.MustChangePassword) throw new HttpError(403, "password_change_required", "Welcome! Please set your own password to continue.");
  return startAdminSession(request, env, row);
}

export async function adminLogout(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = readCookie(request, adminCookieName(url));
  if (token) await env.DB.prepare("DELETE FROM AdminSessions WHERE SessionHash = ?1").bind(await sha256Hex(token)).run();
  const res = json({ ok: true });
  for (const c of adminCookies(url, null)) res.headers.append("Set-Cookie", c);
  return res;
}

const CAN_EDIT_PRICES: AdminRole[] = ["owner", "admin", "price_editor"];

export function assertCanEditPrices(id: AdminIdentity): void {
  if (!CAN_EDIT_PRICES.includes(id.role)) throw new HttpError(403, "forbidden", "Your role does not allow editing prices.");
}

/**
 * CSRF / origin protection for state-changing admin requests.
 * Requires a same-origin browser request whose host is explicitly allowed (ADMIN_ALLOWED_HOSTS).
 */
export function assertSameOrigin(request: Request, env: Env): void {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (!origin) throw new HttpError(403, "bad_origin", "Missing Origin header.");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new HttpError(403, "bad_origin", "Invalid Origin header.");
  }
  if (originHost !== url.host) throw new HttpError(403, "bad_origin", "Cross-origin requests are not allowed.");
  const allowed = (env.ADMIN_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0 || !allowed.includes(url.hostname.toLowerCase())) {
    throw new HttpError(403, "bad_host", "Admin changes are not permitted on this hostname.");
  }
  const site = request.headers.get("Sec-Fetch-Site");
  if (site && site !== "same-origin") throw new HttpError(403, "bad_origin", "Cross-site requests are not allowed.");
}
