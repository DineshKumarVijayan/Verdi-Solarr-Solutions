# AGENTS.md — rules for AI agents and contributors

## Non-negotiable business rules
1. **Prices live only in D1** (`ProductPrices`, integer paise). No XML, JSON price files or hard-coded prices.
2. **Never invent** technical data, prices, certifications, stock or availability, warranty terms, ratings or reviews. Every spec in `data/catalogue.mjs` must trace to a supplied PDF.
3. Do not describe VERDI as an authorised dealer, manufacturer or installer unless the business confirms it.
4. **Never reset or reseed production destructively.** `scripts/generate-seed.mjs` is insert-only by default and never touches prices. Do not add `DELETE`/`DROP` to seeds or deploy steps.
5. Schema changes go in a **new** numbered file in `migrations/`. Never edit an applied migration. Production deploys apply new migrations automatically (`npm run deploy:production`). `scripts/check-migrations.mjs` enforces additive SQL and pinned checksums (`migrations/checksums.json`).
6. Do not merge to `main` without the owner’s approval. Work on `develop` or feature branches.
7. Do not touch other repositories or projects (e.g. Ilam Child Clinic).

## Architecture rules
- Single Cloudflare app: static assets plus a Worker for `/api/*` only (`run_worker_first`). Keep ordinary UI events off the Worker.
- Public data flows through the **published catalogue snapshot** (`PublishedCatalogue`, 1 row). Any admin write to catalogue data must call `publishCatalogue()` and `purgeCatalogueEdgeCache()`.
- Never put admin-only fields (UpdatedBy, emails, audit data) in `PublicCatalogue` types or queries.
- Every privileged endpoint: `requireAdmin()` (hashed session cookie → active `AdminUsers` row), plus `assertSameOrigin()` for non-GET, plus role checks. Hiding UI is never authorisation.
- SQL only in `worker/*` with bound parameters (`?1`). UI components never contain SQL.
- Money: integer paise end to end (`shared/money.ts`, `rupeesToPaise`). No floats for totals.
- Datasheet preview must render the real PDF (pdf.js). Never substitute images.
- Product images: real manufacturer or business photos only. Otherwise use the labelled illustration (`ProductVisual`).
- Customer accounts (`Customers`, `CustomerSessions`) are separate from admin auth. Store only peppered PBKDF2 hashes (`worker/crypto.ts`, secret `PASSWORD_PEPPER`, see PASSWORDS.md) and token digests; never log or return them. `RewardTransactions` is append-only (corrections are new negative/positive rows).
- Site content that changes (field photos, contact details, social links, announcement) lives in D1 and is edited in the admin; do not hard-code it again. `src/site.ts` holds only fallbacks.
- Uploads: only via `/api/admin/uploads` (type-sniffed, size-limited, R2). Never trust the browser-supplied content type.
- Tailwind v4: reusable classes are `@utility` blocks in `src/styles.css` (`@apply` cannot reference `@layer components` classes).

## Commands
```
npm run dev | typecheck | test | test:e2e | build
npm run db:migrate:local | db:seed:local
```
Definition of done: typecheck clean, `npm test` and `npm run test:e2e` green, `npm run build` succeeds, and pages are checked at 390 px and 1440 px with no horizontal overflow.

## Where things are
- Catalogue source: `data/catalogue.mjs` → `scripts/generate-seed.mjs` → `seed/seed.sql` (git-ignored)
- Worker routes: `worker/index.ts`; admin logic: `worker/admin.ts`; publication: `worker/catalogue.ts`; auth: `worker/auth.ts`
- Search engine: `shared/search.ts`; compatibility checks: `shared/compat.ts`; calculators: `shared/calculators.ts`
