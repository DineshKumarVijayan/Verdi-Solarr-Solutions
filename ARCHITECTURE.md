# Architecture

```
Browser ──► Cloudflare edge
             ├─ Static assets (HTML, JS, CSS, PDFs, pdf.js data)  ← no Worker invocation, free & unlimited
             │    • 98 prerendered SEO pages (products/x.html, category/x.html …)
             │    • SPA fallback index.html for /admin and client routes
             └─ /api/*  ──► Worker (worker/index.ts)
                   ├─ GET  /api/catalogue            public, edge-cached snapshot (1 D1 row on miss)
                   ├─ POST /api/enquiry/revalidate   authoritative prices for ≤50 items (1 query)
                   ├─ GET  /api/media/:key           R2 objects (admin uploads, edge + browser cached)
                   ├─ /api/account/*  /api/enquiries  customer accounts & enquiry records (cookie session)
                   ├─ GET  /api/health
                   └─ /api/admin/*                   admin session cookie + D1 AdminUsers + origin check
                         me · dashboard · prices (list) · prices/:id (PUT) · prices/:id/history
                                   │
                         Cloudflare D1 (SQLite)  ·  R2 bucket "verdi-media" (uploads)
```

## Free-tier-first decisions

Limits read from the official docs on 2026-11-13. Re-check them before relying on these figures, because they change.

| Resource | Free limit | How this site stays inside it |
|---|---|---|
| Worker requests | 100,000/day | Static pages, JS, PDFs and calculators never invoke the Worker. A typical visit makes **1** Worker call (`/api/catalogue`). An enquiry adds 1 (`revalidate`). |
| Worker CPU | 10 ms/request | The catalogue is returned as a pre-serialised string. JWT verification uses cached JWKS. |
| D1 rows read | 5 M/day | Public catalogue = **1 row** per edge-cache miss (≤1/min per location). Revalidate reads ≤50 rows. The rebuild (~1.3 k rows) happens only after an admin save. |
| D1 rows written | 100 k/day | Writes only on admin price saves (≈4 rows + snapshot). |
| D1 storage | 500 MB per DB, 5 GB per account | The catalogue is a few MB. Binaries are never stored in D1. |
| D1 queries per invocation | 50 | `db.batch()` is used (it counts as one). |
| R2 | 10 GB-month, 1 M Class A, 10 M Class B per month, free egress | Admin uploads (product images, datasheets, field photos, logos). Images are resized to ≤2000 px WebP in the browser before upload. Supplied PDFs remain static assets. |
| Static assets | 20,000 files, 25 MiB per file | ~200 files today. The largest PDF is 4 MB. |

**When quotas are exceeded:** Worker requests over the limit return Cloudflare error 1027 for API calls. Static pages keep working, and the catalogue falls back to the copy cached in the visitor’s session. D1 errors are caught and returned as `503 capacity` with a friendly message (`worker/http.ts`). The enquiry page offers “Continue without prices” if revalidation fails, and never quotes stale prices.

**Monitoring:** Cloudflare dashboard → Workers & Pages → verdi-solarr → Metrics (requests, CPU, errors), and Storage & Databases → D1 → verdi-db → Metrics (rows read and written). Workers Observability logs are enabled in `wrangler.jsonc`.

## Catalogue publication and caching

1. D1 is authoritative.
2. `PublishedCatalogue` holds one denormalised JSON snapshot (public fields only) plus a `Version`.
3. `GET /api/catalogue` checks the Cache API (`caches.default`). On a miss it reads the snapshot row (building it if absent) and caches it for `PUBLIC_CACHE_SECONDS` (default 60 s). It returns an `ETag` (`W/"cat-<version>"`), and browsers revalidate after 30 s.
4. An admin price save commits the update, history and audit atomically, then calls `publishCatalogue()` (new version) and purges the local edge cache entry.
5. **Propagation:** Cache API purges are per data-centre, so other locations refresh within `PUBLIC_CACHE_SECONDS` (≤60 s plus up to 30 s of browser cache). The UI shows “Prices last published …”.
6. Before the WhatsApp message is generated, `/api/enquiry/revalidate` reads live prices straight from `ProductPrices`. Cached prices are never quoted as final.

If the catalogue grows past ~1,500 products, or the snapshot approaches D1’s 2 MB row limit, switch the public listing to paginated, indexed SQL search (`IX_Products_*`, optional FTS5) behind the same `shared/search.ts` interface.

## Rendering and SEO

The Vite SPA is code-split per route. pdf.js (≈440 KB) loads only when a datasheet is opened. `scripts/prerender.mjs` writes static HTML for every public route from `data/catalogue.mjs` at build time. Live prices are deliberately not baked in. `main.tsx` replaces the prerendered markup on boot. Products added later in D1 work immediately in the app, and gain prerendered SEO HTML on the next build.

## Security model

| Layer | Implementation |
|---|---|
| Admin sign-in | Mobile number + password against `AdminUsers` (PBKDF2-SHA256, 10k iterations, salted, plus a secret key: PASSWORDS.md). Dummy hash for unknown users; 5 failures lock for 15 min; `AUTH_LIMITER` per IP. |
| Admin session | 32-byte random token in `__Host-vs_admin` (HttpOnly, Secure, SameSite=Strict, 12 h). Only its SHA-256 is stored (`AdminSessions`). Every `/api/admin/*` call re-checks the session and that the admin is still active; password change or deactivation revokes sessions. |
| Authorisation | Active row in `AdminUsers` (D1). Roles: owner, admin, price_editor (can edit), viewer (read-only). |
| CSRF / origin | Non-GET admin calls need `Origin` = request host, host in `ADMIN_ALLOWED_HOSTS`, and `Sec-Fetch-Site: same-origin`. This blocks writes from preview and workers.dev hosts. |
| Validation | Zod `.strict()` schemas. Integer paise between 0 and ₹10 crore. GST ∈ {0, 5, 12, 18, 28}. Selling price ≤ MRP. Body ≤ 16 KB. |
| Concurrency | `UPDATE … WHERE Version = expected`. History and audit rows are inserted only `WHERE changes() = 1`, all in one atomic batch. Conflicts return 409 with the current values. |
| SQL | Bound parameters only. `LIKE` input is escaped. |
| Rate limiting | Workers rate-limit bindings: 60 per minute per IP (revalidate, enquiries), 20 per minute per IP (customer sign-in and registration) and 120 per minute per admin (writes). The code tolerates a missing binding. |
| Headers | CSP, HSTS, X-Frame-Options DENY, nosniff and Permissions-Policy (`public/_headers`). `noindex` on /admin. |
| Secrets | None in the repo. No passwords anywhere in code; setup scripts hash before writing. `.dev.vars` is git-ignored. |

## Media strategy

`ProductMedia.StorageKey` is either a static path (`/datasheets/x.pdf`) or `r2:<key>`, which is served via `/api/media/<key>` with immutable caching. `mediaUrl()` in `worker/catalogue.ts` abstracts both. D1 stores metadata only.

## Dynamic content (admin-managed)

Everything that changes over time is data, not code:

| What | Admin screen | Storage | Public delivery |
|---|---|---|---|
| Brands, categories, products, specs, highlights | Products, Brands & categories | D1 | Snapshot |
| Prices | Prices (or initial price on create) | D1 `ProductPrices` + history | Snapshot + live revalidation |
| Product images, datasheets, brand logos, field photos | Product editor, Field photos | R2 (`r2:` keys) + D1 metadata | `/api/media/<key>`, immutable cache |
| Contact details, social links, announcement | Settings | D1 `SiteSettings` | Snapshot (`useSite()`) |
| Enquiries, customers, reward points | Enquiries, Customers | D1 | Account pages (private) |

Every admin write is role-checked, audited in the same D1 batch, then calls `republish()`, which rebuilds `PublishedCatalogue` and purges the edge cache. The browser fetches the catalogue with `cache: "no-cache"` (ETag → 304), so changes show on the next page load. Product edits use `UpdatedAt` as an optimistic-concurrency token. Uploads are size-limited and **type-sniffed from their bytes** (PDF/JPEG/PNG/WebP only), and are deleted from R2 when nothing references them any more.

**New products and SEO:** products created in the admin are fully functional immediately (client-rendered via the SPA fallback). They get prerendered HTML and a sitemap entry at the next `npm run build` only if they are also in `data/catalogue.mjs`. A later improvement is to prerender from the live API at build time.

## Customer accounts

Separate from admin auth. Mobile number (normalised to 91XXXXXXXXXX) + password.
- Passwords: PBKDF2-HMAC-SHA256, 10,000 iterations (fits the Workers Free CPU limit), 16-byte salt, then HMAC with the secret `PASSWORD_PEPPER`; constant-time compare, dummy hash for unknown users (no timing leak). The format carries the iteration count, so it can be changed later. Details and how to change: PASSWORDS.md.
- Sessions: 32 random bytes in an `HttpOnly; Secure; SameSite=Lax` cookie (`__Host-vs_session` on HTTPS). Only the SHA-256 is stored. 30-day expiry. Password change or reset revokes all sessions.
- A non-secret `vs_signed_in=1` hint cookie means anonymous visitors never call `/api/account/me`.
- Abuse controls: `AUTH_LIMITER` (20 per minute per IP); 5 failed sign-ins lock the account for 15 minutes; Origin + Sec-Fetch-Site checks on every write.
- Password reset: there is no email/SMS provider yet, so an admin issues a one-time 48 h link and shares it on WhatsApp. Email or OTP reset can be added later without schema changes.
- Enquiries: `POST /api/enquiries` re-reads prices from D1 (never trusts the browser), stores a snapshot and returns a reference that is included in the WhatsApp message. Guests are recorded with `CustomerId` NULL.

## SEO, link previews and images

- `run_worker_first` also covers `/products/*`, `/sitemap.xml` and `/robots.txt` (`worker/seo.ts`). Product HTML is rewritten from the live snapshot: title, description, canonical, Open Graph / Twitter tags with the product photo, and schema.org `Product` JSON-LD with an `Offer` **only when a price is listed** (no stock or ratings claimed). This works for products added in the admin after the last build. Cost: one Worker request per product page view.
- `sitemap.xml` = build routes (`dist/client/routes.json`) + every live product and category, using the request host (no `SITE_URL` needed). `robots.txt` points to it.
- Location landing pages (`data/local-pages.json` → `/solar-panels-chennai` etc.) are prerendered with FAQPage JSON-LD and list live products. Keep their text factual.
- Responsive images: static photos have `-480`/`-960` WebP copies (`node scripts/make-image-variants.mjs` after adding photos, needs `sharp`); admin uploads store an `-800.webp` copy. `src/lib/img.ts` builds `srcset` and falls back to the original if a copy is missing.
- Mobile: sticky "Add to enquiry" bar on product pages (`StickyBuyBar`), swipeable gallery, share button (native share sheet on phones; WhatsApp/Email/Facebook/LinkedIn/Telegram/Instagram/copy link elsewhere).
