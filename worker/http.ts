import { captureException } from "@sentry/cloudflare";
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Resource-Policy": "same-origin",
};

/** Headers for HTML pages the Worker renders itself (product pages). Keep in sync with public/_headers. */
export const PAGE_SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'self' https://*.ingest.us.sentry.io; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
};

export function json(data: unknown, init: ResponseInit & { cache?: string } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", init.cache ?? "no-store");
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  return new Response(JSON.stringify(data), { status: init.status ?? 200, headers });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  const msg = err instanceof Error ? err.message : String(err);
  // D1 daily quota exhaustion / overload surfaces as an exception — degrade gracefully.
  if (/limit|quota|exceeded|overloaded/i.test(msg)) {
    console.error("Capacity error", msg);
    return json(
      { error: { code: "capacity", message: "The service is temporarily busy. Please try again shortly, or contact us on WhatsApp." } },
      { status: 503, headers: { "Retry-After": "300" } },
    );
  }
  console.error("Unhandled error", err);
  captureException(err); // error alert (no-op when Sentry is not configured)
  return json({ error: { code: "internal", message: "Something went wrong. Please try again." } }, { status: 500 });
}

export async function readJson(request: Request, maxBytes = 16 * 1024): Promise<unknown> {
  const ct = request.headers.get("Content-Type") ?? "";
  if (!ct.toLowerCase().startsWith("application/json")) throw new HttpError(415, "unsupported_media_type", "Expected application/json");
  const len = Number(request.headers.get("Content-Length") ?? "0");
  if (len > maxBytes) throw new HttpError(413, "too_large", "Request body too large");
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "too_large", "Request body too large");
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "bad_json", "Malformed JSON body");
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
