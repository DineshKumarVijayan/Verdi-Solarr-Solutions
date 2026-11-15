// Password hashing (staff AND customers) and opaque tokens. Web Crypto only (Workers and Node 20+).
// Full explanation and "what to change where": PASSWORDS.md.
//
// * PBKDF2-HMAC-SHA256 with ITERATIONS rounds and a 16-byte random salt, then HMAC-SHA256 with a
//   secret key ("pepper", Worker secret PASSWORD_PEPPER) that is never stored in D1 or GitHub.
//   A stolen database or backup is useless without that secret.
// * ITERATIONS is kept low enough for the Workers Free plan CPU limit (~10 ms per request).
// * Stored format: "pbkdf2p_sha256$<iterations>$<salt b64url>$<hash b64url>". The iteration count
//   travels with the hash, so ITERATIONS can be changed later without breaking existing accounts.
//   Older un-peppered "pbkdf2_sha256$..." hashes (local test data only) are still accepted.
// * Session / reset tokens are 32 random bytes; only their SHA-256 digest is stored in D1.
// * scripts/lib/passwords.mjs must produce the same format (used by npm run admin:set).

import { HttpError } from "./http";

/** Rounds for NEW hashes. Change here AND in scripts/lib/passwords.mjs (see PASSWORDS.md). */
export const ITERATIONS = 10_000;
const MIN_ITERATIONS = 1_000;
const MAX_ITERATIONS = 100_000; // Workers runtime maximum
/** Used only when ENVIRONMENT=development and no PASSWORD_PEPPER is set (local machine, tests). */
export const DEV_PEPPER = "verdi-local-development-pepper";

export type PepperEnv = { PASSWORD_PEPPER?: string; ENVIRONMENT?: string };
const enc = new TextEncoder();

/** The secret key. Production refuses to hash or check passwords without it (never falls back silently). */
function pepperOf(env: PepperEnv): string {
  const p = env.PASSWORD_PEPPER?.trim();
  if (p) return p;
  if (env.ENVIRONMENT === "development") return DEV_PEPPER;
  console.error("PASSWORD_PEPPER secret is not set: sign-in is disabled until it is (see PASSWORDS.md).");
  throw new HttpError(503, "auth_not_configured", "Sign-in is temporarily unavailable. Please try again later.");
}

async function pepper(hash: Uint8Array, env: PepperEnv): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(pepperOf(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, hash));
}

export function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** Constant-time comparison (does not short-circuit on the first differing byte). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

export async function hashPassword(password: string, env: PepperEnv): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pepper(await pbkdf2(password, salt, ITERATIONS), env);
  return `pbkdf2p_sha256$${ITERATIONS}$${b64url(salt)}$${b64url(hash)}`;
}

export async function verifyPassword(password: string, stored: string, env: PepperEnv): Promise<boolean> {
  const parts = stored.split("$");
  const peppered = parts[0] === "pbkdf2p_sha256";
  if (parts.length !== 4 || !(peppered || parts[0] === "pbkdf2_sha256")) return false;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) return false;
  const expected = fromB64url(parts[3]);
  let actual = await pbkdf2(password, fromB64url(parts[2]), iterations);
  if (peppered) actual = await pepper(actual, env);
  return timingSafeEqual(actual, expected);
}

/** A stored hash for a random password: used to equalise timing when an account does not exist. Keep its count = ITERATIONS. */
export const DUMMY_HASH = `pbkdf2p_sha256$${ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;

export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256Hex(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}
