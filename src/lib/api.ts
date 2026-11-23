export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** When the signed-in identity last changed; 401s from requests sent before that are stale. */
let authChangedAt = 0;
const AUTH_PATHS = /^\/api\/(admin\/(login|password)|account\/(login|register|reset|password))$/;

/**
 * Creates that must not happen twice (mirrors worker/idempotency.ts). If the exact same request is sent
 * again within 10 minutes (Save pressed again after a lost reply on a weak connection), it carries the
 * same one-time key, so the server returns the first result instead of saving a second copy.
 */
const ONCE = /^\/api\/(enquiries|admin\/(enquiries|quotations|bonus\/adjustments|customers\/\d{1,9}\/points|products|faqs|field-photos|users))$/;
const recentKeys = new Map<string, { key: string; at: number }>();
function submissionKey(path: string, body: string): string {
  const now = Date.now();
  for (const [k, v] of recentKeys) if (now - v.at > 10 * 60_000) recentKeys.delete(k);
  const sig = `${path}|${body}`;
  const hit = recentKeys.get(sig);
  if (hit) return hit.key;
  const key = (globalThis.crypto?.randomUUID?.() ?? `${now}-${Math.random()}`).replace(/[^A-Za-z0-9]/g, "").padEnd(16, "0");
  recentKeys.set(sig, { key, at: now });
  return key;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const sentAt = Date.now();
  const once: Record<string, string> = (init.method ?? "GET").toUpperCase() === "POST" && typeof init.body === "string" && ONCE.test(path) ? { "Idempotency-Key": submissionKey(path, init.body) } : {};
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(typeof init.body === "string" ? { "Content-Type": "application/json" } : {}), ...once, ...init.headers },
    });
  } catch {
    throw new ApiError(0, "network", "Network error — please check your connection.");
  }
  // Cloudflare Access may redirect an expired admin session to its login page.
  if (res.type === "opaqueredirect" || (res.redirected && !res.url.includes("/api/"))) {
    throw new ApiError(401, "unauthenticated", "Your session has expired. Please sign in again.");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    if (!res.ok) throw new ApiError(res.status, "http", `Request failed (${res.status}).`);
    throw new ApiError(res.status, "bad_response", "Unexpected response from server.");
  }
  if (!res.ok) {
    const e = (data as { error?: { code: string; message: string; details?: unknown } })?.error;
    if (res.status === 401 && typeof window !== "undefined" && sentAt >= authChangedAt) {
      if (path.startsWith("/api/admin/") && !/^\/api\/admin\/(login|password)/.test(path)) window.dispatchEvent(new Event("vs:admin-expired"));
      else if (path.startsWith("/api/account/") && !/^\/api\/account\/(login|register|reset)/.test(path)) window.dispatchEvent(new Event("vs:account-expired"));
    }
    throw new ApiError(res.status, e?.code ?? "http", e?.message ?? `Request failed (${res.status}).`, e?.details);
  }
  if (AUTH_PATHS.test(path)) authChangedAt = Date.now();
  return data as T;
}
