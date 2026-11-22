# AGENTS.md — rules for AI agents and contributors

## Non-negotiable business rules
1. **Prices live only in D1** (`ProductPrices`, integer paise). No XML, JSON price files or hard-coded prices.
2. **Never invent** technical data, prices, certifications, warranty terms, ratings or reviews. Stock status and offers come only from what the owner/admin set per product (`shared/stock.ts`; every product starts "In stock" by the owner's decision); a % off is only ever computed from the listed MRP and selling price. Every spec in `data/catalogue.mjs` must trace to a supplied PDF.
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
- Everything product-related is dynamic (the admin may delete and rebuild the whole catalogue). Never hard-code product/category slugs, counts, photos or spec claims in the UI: read the live catalogue, and recognise a category by what it is with `shared/category-role.ts`. Catalogue pages (`/`, `/products`, `/category/*`, `/products/*`, local pages) get their title, preview tags, JSON-LD and crawler text from the live catalogue in `worker/seo.ts` (`run_worker_first`); deleted items answer 404 + noindex. `scripts/prerender.mjs` only prerenders non-catalogue pages.
- Tailwind v4: reusable classes are `@utility` blocks in `src/styles.css` (`@apply` cannot reference `@layer components` classes).

## Phone layout rules (below `lg`, 1024 px)
- Desktop (≥ 1024 px) must not change when you work on phones: use `max-lg:` / `lg:hidden` variants or phone-only elements. Check with `npm run test:visual -- --project=desktop-1440 --project=desktop-1024` (pixel lock; run it **before** `npm run test:e2e`, which writes test data). Refresh the baseline only on purpose (`--update-snapshots`) after a deliberate desktop change.
- New pages automatically get the shell (top bar, bottom tabs, More sheet, compact footer; admin: own top bar, tabs, More sheet). Admin and public menus come from one list each, so a new section is added in one place.
- Build phone UI from the shared blocks: `src/components/mobile/kit.tsx` (BottomSheet, SheetGroup, ChipRow, MobileTabs, Accordion, ActionBar, ClampText, usePullToRefresh), `ProductRow` for product lists, and the `@utility` classes in `src/styles.css` (tap, tabbar, sheet, list-row, action-bar, m-tabs, m-acc).
- Layouts must adapt to any admin content: no hard-coded counts, names or image sizes; fixed-ratio image frames; `ProductVisual` when a photo is missing; truncate/clamp long text; hide empty tabs/sections.
- Content hidden behind phone tabs/accordions stays in the HTML (CSS-hidden), never removed. 44 px minimum tap targets; no sideways page scroll at 280/360/390/430 px (add new routes to the "every route" test in `tests/e2e/mobile.spec.ts`).

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
