# Cloudflare setup (one-time)

Everything here uses the free plans. Steps marked **(dashboard)** are done at dash.cloudflare.com.

## 0. Prerequisites
- A Cloudflare account (free).
- Node 20+ and this repository cloned. Run `npm install`.
- `npx wrangler login`, which opens the browser to authorise Wrangler.

## 1. Create the D1 database
```bash
npx wrangler d1 create verdi-db
```
Copy the printed `database_id` into `wrangler.jsonc` → `d1_databases[0].database_id` (it replaces the zeros) and commit. The id is not a secret.

```bash
npm run db:migrate:remote      # creates tables (asks for confirmation)
npm run db:seed:remote         # imports the 45 products, categories and the owner admin (insert-only, never touches prices)
```
To make someone else the owner admin at seed time: `node scripts/generate-seed.mjs --admin=person@example.com`, then `npx wrangler d1 execute verdi-db --remote --file=./seed/seed.sql`.

## 2. Create the R2 bucket (admin uploads: product images, datasheets, field photos, logos)
```bash
npx wrangler r2 bucket create verdi-media
```
Leave it **private**. The Worker serves objects through `/api/media/…`, and no public bucket access is needed.

## 3. First deploy (to a workers.dev test URL)
```bash
npm run deploy
```
Open the printed `https://verdi-solarr.<your-subdomain>.workers.dev`, then check:
- `/api/health` returns `{ "ok": true }`
- the home page, `/products`, a product page and a datasheet preview all work
- `/admin` shows **“Admin sign-in not configured”**. This is correct: admin fails closed until Access is set up.

If the deploy is rejected because of the `ratelimits` block (rate-limit bindings might not be available on your plan), remove that block from `wrangler.jsonc`. The code works without it.

## 4. Admin sign-in (first owner password)
Admins sign in at `/admin` with mobile number + password (no Cloudflare Access needed).

**First set the password secret key** (once, before anyone signs in; full guide in PASSWORDS.md):
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # copy the output; save it in a password manager
npx wrangler secret put PASSWORD_PEPPER                                          # paste it when asked
```
Then, after the first deploy, give the owner a password **once** (the same secret key must be in `PASSWORD_PEPPER` for this command):
```bash
# PowerShell:  $env:PASSWORD_PEPPER="<the secret key>"     Git Bash:  export PASSWORD_PEPPER="<the secret key>"
npm run admin:set -- --mobile=<owner mobile> --name=Owner --role=owner --password="<a strong password>" --remote
```
The script hashes the password locally; only the hash is sent to D1. Clear the command from your shell history afterwards. Everyone else is then added by the owner in **Admin → Admin users**.

If an earlier deployment had a Cloudflare Access application on `/admin*`, delete it (Zero Trust → Access → Applications), otherwise it will sit in front of the new sign-in page.

## 5. Environment variables reference

| Name | Where | Example | Purpose |
|---|---|---|---|
| `ENVIRONMENT` | wrangler vars | `production` | Must not be `development` in production |
| `ADMIN_ALLOWED_HOSTS` | wrangler vars | `www.example.in,example.in` | Hosts allowed to perform admin writes |
| `PUBLIC_CACHE_SECONDS` | wrangler vars | `60` | Edge cache TTL for the public catalogue (10–600) |
| `SITE_URL` | **build** env (Workers Builds → Variables) | `https://www.example.in` | Canonical URLs, sitemap.xml, robots Sitemap |

## 6. Usage monitoring
- Workers & Pages → `verdi-solarr` → **Metrics**: requests per day (free: 100k), errors, CPU.
- Storage & Databases → D1 → `verdi-db` → **Metrics**: rows read and written per day (free: 5M / 100k).
- R2 → `verdi-media` → **Metrics**.
- **Notifications** → add alerts for Workers usage and errors if available on your plan.
Normal expected load is tiny: one Worker request per visitor, plus one per enquiry.
