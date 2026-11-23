import type { Env } from "./env";
import { HttpError } from "./http";

/**
 * Create requests that must never happen twice. The browser sends an "Idempotency-Key" (random, one per
 * form submission, reused when the person presses Save again after an error). The first request with a
 * key runs; a repeat gets the first reply back instead of creating a second record.
 */
const GUARDED = /^\/api\/(enquiries|admin\/(enquiries|quotations|bonus\/adjustments|customers\/\d{1,9}\/points|products|faqs|field-photos|users))$/;
const KEEP_MS = 24 * 3600_000;

async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function withIdempotency(request: Request, env: Env, path: string, method: string, run: () => Promise<Response>): Promise<Response> {
  const key = request.headers.get("Idempotency-Key");
  if (method !== "POST" || !key || !GUARDED.test(path)) return run();
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(key)) throw new HttpError(400, "bad_key", "Invalid submission key.");
  // the key is scoped to the endpoint and to whoever is signed in (cookie), so it cannot fetch someone else's reply
  const hash = await sha256(`${path}|${request.headers.get("Cookie") ?? ""}|${key}`);
  const now = new Date();

  const claimed = await env.DB.prepare("INSERT OR IGNORE INTO IdempotencyKeys (KeyHash, Status, CreatedAt) VALUES (?1, 'pending', ?2)").bind(hash, now.toISOString()).run();
  if (!claimed.meta.changes) {
    const row = await env.DB.prepare("SELECT Status, ResponseStatus, ResponseBody FROM IdempotencyKeys WHERE KeyHash = ?1").bind(hash).first<{ Status: string; ResponseStatus: number | null; ResponseBody: string | null }>();
    if (row?.Status === "done" && row.ResponseBody !== null) {
      return new Response(row.ResponseBody, { status: row.ResponseStatus ?? 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Idempotent-Replay": "true" } });
    }
    throw new HttpError(409, "in_progress", "This was already sent and is still being saved. Please wait a moment, then check before sending again.");
  }

  let res: Response;
  try {
    res = await run();
  } catch (e) {
    await env.DB.prepare("DELETE FROM IdempotencyKeys WHERE KeyHash = ?1").bind(hash).run().catch(() => undefined); // failed: the person may try again
    throw e;
  }
  if (res.ok) {
    const body = await res.clone().text();
    await env.DB.prepare("UPDATE IdempotencyKeys SET Status = 'done', ResponseStatus = ?2, ResponseBody = ?3 WHERE KeyHash = ?1").bind(hash, res.status, body).run().catch(() => undefined);
  } else {
    await env.DB.prepare("DELETE FROM IdempotencyKeys WHERE KeyHash = ?1").bind(hash).run().catch(() => undefined);
  }
  // keep the table small: now and then, forget keys older than a day
  if (Math.random() < 0.05) {
    await env.DB.prepare("DELETE FROM IdempotencyKeys WHERE CreatedAt < ?1").bind(new Date(now.getTime() - KEEP_MS).toISOString()).run().catch(() => undefined);
  }
  return res;
}
