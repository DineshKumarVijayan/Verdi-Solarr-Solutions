export interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface Env {
  DB: D1Database;
  MEDIA?: R2Bucket;
  ASSETS: Fetcher;
  PUBLIC_LIMITER?: RateLimiter;
  ADMIN_LIMITER?: RateLimiter;
  AUTH_LIMITER?: RateLimiter;
  ENVIRONMENT: string;
  /** Comma-separated hostnames allowed to perform admin writes (CSRF/origin check). */
  ADMIN_ALLOWED_HOSTS: string;
  PUBLIC_CACHE_SECONDS: string;
  /** SECRET (wrangler secret put PASSWORD_PEPPER). Secret key mixed into every password hash. See PASSWORDS.md. */
  PASSWORD_PEPPER?: string;
  /** Sentry project DSN for server error alerts (optional: alerts are off without it). */
  SENTRY_DSN?: string;
}
