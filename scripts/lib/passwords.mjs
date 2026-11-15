// Same hash format as worker/crypto.ts ("pbkdf2p_sha256$iterations$salt$hash"), for setup scripts.
// Keep ITERATIONS and DEV_PEPPER identical to worker/crypto.ts (see PASSWORDS.md).
import { webcrypto as crypto } from "node:crypto";

export const ITERATIONS = 10_000;
export const DEV_PEPPER = "verdi-local-development-pepper";

const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** pepper = the production PASSWORD_PEPPER secret (for --remote) or DEV_PEPPER (local database). */
export async function hashPassword(password, pepper) {
  if (!pepper) throw new Error("hashPassword: pepper is required");
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFKC")), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, key, 256);
  const hmacKey = await crypto.subtle.importKey("raw", enc.encode(pepper), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const hash = new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, bits));
  return `pbkdf2p_sha256$${ITERATIONS}$${b64url(salt)}$${b64url(hash)}`;
}

export function normaliseMobile(input) {
  let d = String(input).replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = "91" + d;
  return /^91[6-9]\d{9}$/.test(d) ? d : null;
}

export const sqlString = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

/** Run SQL against D1 via a temp file (avoids shell-quoting problems on Windows). */
export async function runD1(sql, remote = false, quiet = false) {
  const { execFileSync } = await import("node:child_process");
  const { writeFileSync, rmSync, mkdtempSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "verdi-sql-"));
  const file = join(dir, "run.sql");
  writeFileSync(file, sql);
  try {
    execFileSync("npx", ["wrangler", "d1", "execute", "verdi-db", remote ? "--remote" : "--local", `--file=${file}`], { stdio: quiet ? "ignore" : "inherit", shell: process.platform === "win32" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
