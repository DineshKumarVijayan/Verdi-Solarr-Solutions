# Deployment: GitHub → Cloudflare Workers Builds, GoDaddy domain, rollback

Repository: `https://github.com/DineshKumarVijayan/Verdi-Solarr`
Branches: `main` = production (merged only with the owner’s approval) · `develop` and feature branches = previews.

## 1. Connect GitHub to Workers Builds (dashboard)
Complete CLOUDFLARE_SETUP.md §1–3 first (D1 id in `wrangler.jsonc`, one manual deploy).

1. Workers & Pages → `verdi-solarr` → **Settings → Builds → Connect** → GitHub → authorise the Cloudflare app for **only** the `Verdi-Solarr` repository.
2. Build configuration:
   | Setting | Value |
   |---|---|
   | Production branch | `main` |
   | Build command | `npm run build` |
   | Deploy command | `npm run deploy:production` (checks, then applies new database migrations, then deploys) |
   | Non-production branch deploy command | `npx wrangler versions upload` (creates a preview / version URL; **never** migrates the database) |
   | Root directory | `/` |
   | Build variables | `SITE_URL=https://www.<your-domain>` (and `NODE_VERSION=22` if the default Node is older) |
3. The Worker name in the dashboard must match `"name": "verdi-solarr"` in `wrangler.jsonc`, or the build fails.
4. No secrets are needed in GitHub. Builds use Cloudflare’s own build token. Never commit `.dev.vars`.
5. The build token must be allowed to change D1. If the first production deploy log shows an authorisation error at the `d1 migrations apply` step, open **Settings → Builds → API token** and add **Account → D1 → Edit**.

**Behaviour:**
- A push to `develop` or a pull request builds and uploads a **preview version**, and production is unchanged. The preview URL appears in the dashboard (and on the PR for supported providers).
- Merging to `main` builds and deploys. If `npm run build` (which includes `tsc`) fails, **nothing is deployed** and the previous production version keeps serving.
- Preview URLs share the production D1 binding. They can read public data, and admin writes are refused there (not in `ADMIN_ALLOWED_HOSTS`). For an isolated preview database, add a second D1 database and a `env.preview` block later.

**Recommended PR checks** (locally or in CI): `npm run typecheck && npm test && npm run build`.

## 2. Database changes during deploys (automatic)
Every production deploy (merge to `main`) runs `npm run deploy:production`, which:
1. **checks the migrations** (`scripts/check-migrations.mjs`, also run by every build):
   - files that were already applied must be unchanged (pinned in `migrations/checksums.json`);
   - migrations must be additive: `DROP TABLE`, `DROP COLUMN`, `DELETE FROM`, `TRUNCATE` and any write to `ProductPrices` (live prices) are refused, unless the file carries `-- allow-destructive: <reason>` approved by the owner;
2. logs a **D1 Time Travel bookmark** (a restore point for the database just before the change);
3. **applies only the new migration files** to the production database (`wrangler d1 migrations apply --remote`). Already-applied files are tracked in D1's `d1_migrations` table and never run twice;
4. deploys the new code.

If any step fails, the deploy stops and the current site keeps running unchanged. Preview builds (`develop`, pull requests) never touch the database.

**Never automatic:** seeds and product imports (`npm run db:seed:remote`), price changes, and anything that deletes data. Products and prices are managed in the admin.

**Writing a migration:** add `migrations/000N_description.sql` with additive SQL (`CREATE TABLE`, `ALTER TABLE … ADD COLUMN`, `CREATE INDEX`). It must stay compatible with the live code. Run `npm run db:migrate:local` (this pins it in `checksums.json`) and commit both files.

**Restoring after a bad migration:** `npx wrangler d1 time-travel restore verdi-db --bookmark=<bookmark from the deploy log>` (Free plan: the last 7 days; paid: 30 days).

## 3. GoDaddy domain → Cloudflare
A Workers **custom domain** needs the domain’s DNS zone on Cloudflare. On the Free plan that means changing the domain’s **nameservers** at GoDaddy to Cloudflare’s. This is **not** a domain transfer: GoDaddy stays the registrar and you keep renewing there.

> ⚠️ **Changing nameservers moves ALL DNS for the domain to Cloudflare, including email.** If any record is missed, email (MX), Google/Microsoft verification or other services can stop working. Follow the checklist and change nothing else at GoDaddy.

1. **Test first.** Confirm the workers.dev deployment works (CLOUDFLARE_SETUP.md §3).
2. **Record existing DNS.** In GoDaddy → My Products → Domain → **DNS**, screenshot or export every record. Pay particular attention to:
   - **MX** (mail servers), **TXT** (SPF `v=spf1 …`, DMARC `_dmarc`, Google/Microsoft site verification), **CNAME** (DKIM selectors such as `google._domainkey`, `selector1._domainkey`, plus `autodiscover`, `mail`)
   - any existing **A/CNAME** for `@` and `www` (a current website), and subdomains in use.
3. **Add the site to Cloudflare:** dashboard → **Add a domain** → enter the domain → Free plan. Cloudflare scans and imports records.
4. **Compare** the imported list against your GoDaddy records. Add anything missing, and keep MX, SPF, DKIM and DMARC exactly the same. Set mail-related records to **DNS only** (grey cloud).
5. Cloudflare shows two nameservers (e.g. `xxx.ns.cloudflare.com`). In GoDaddy → Domain → **Nameservers** → **Change** → **“I’ll use my own nameservers”** → enter both → Save. If GoDaddy’s DNSSEC is on, turn it **off** first, then re-enable DNSSEC later from Cloudflare.
6. Wait for Cloudflare to show the domain as **Active** (minutes to 24 h). Send and receive a test email to confirm mail still works.
7. **Attach the Worker:** Workers & Pages → `verdi-solarr` → **Settings → Domains & Routes → Add → Custom domain** → `www.<domain>`, and again for `<domain>` (root). Cloudflare creates the DNS records and the certificate. **If an old website’s A/CNAME record exists for those names, remove it only now**, and only once you are ready to switch.
8. **HTTPS:** SSL/TLS → Overview → **Full (strict)**. Edge Certificates → **Always Use HTTPS** on. Wait for the certificates to show *Active*.
9. **Root vs www:** pick one canonical host (recommended: `www`). Add a Redirect Rule (Rules → Redirect Rules → template “Redirect from root to WWW”) so `https://<domain>/*` → `https://www.<domain>/${1}` with a 301. Use the same host in `SITE_URL` and Access.
10. Set `ADMIN_ALLOWED_HOSTS` to the final hostnames and deploy. Set the `PASSWORD_PEPPER` secret first (PASSWORDS.md §3), then give the owner a password once: `npm run admin:set -- --mobile=... --password=... --remote` with `PASSWORD_PEPPER` set in the shell (CLOUDFLARE_SETUP.md §4).
11. **Verify on the live domain:** home and product pages, a datasheet modal, search, an enquiry through to the WhatsApp preview, `/robots.txt`, `/sitemap.xml`, admin login and a price save (then check it on the public page within about a minute), and email delivery.

Do not modify any other domains or zones in the account.

## 4. Rollback
- **Code:** Workers & Pages → `verdi-solarr` → **Deployments** → choose a previous version → **Rollback**. Or from the CLI: `npx wrangler rollback`. Static assets roll back with the version.
- **Data:** D1 Time Travel (`npx wrangler d1 time-travel restore verdi-db --timestamp=…`, last 7 days on Free) or re-import an export (DATABASE.md). Export first, because a restore replaces the whole database.
- **Bad price:** simply edit it again in Admin → Prices. History keeps the trail.

## 5. Verification status (be explicit)
| Item | Status |
|---|---|
| Local build, typecheck, 41 unit tests, 28 Playwright tests (desktop + mobile) against the production build with CSP | ✅ verified locally (Workers runtime via miniflare + local D1) |
| Seed idempotency (prices untouched on re-run) | ✅ verified locally |
| Cloudflare deploy, remote D1, Workers Builds | ⏳ not yet performed (requires the owner’s Cloudflare login) |
| Admin and customer sign-in on the real domain (incl. the free-plan CPU limit for password hashing) | ⏳ must be verified on the deployed domain |
| GoDaddy DNS / HTTPS / custom domain | ⏳ not performed: requires the domain name and the owner’s action |
