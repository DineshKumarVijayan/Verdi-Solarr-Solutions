# Passwords: how they are stored and what to change where

Applies to **staff** (Admin sign-in) and **customers** (My account). Passwords are never stored. Only a scrambled value (a hash) is kept in D1.

## 1. How it works (plain words)

When a password is saved:

1. A random **salt** (16 bytes) is added, so two people with the same password get different hashes.
2. The password is scrambled **10,000 times** with PBKDF2-SHA256. This is the **count** (iterations).
3. The result is scrambled once more with a **secret key** (the *pepper*). The key lives only in Cloudflare as the Worker secret `PASSWORD_PEPPER`. It is never in D1, GitHub or backups.
4. The database stores: `pbkdf2p_sha256$10000$<salt>$<hash>`.

At sign-in the same steps run on what the person typed, and the two results are compared.

**Why both?**
- A stolen database or backup is useless without the secret key.
- The count makes each guess slow if both were ever stolen together.
- Online guessing is stopped separately: 5 failed attempts lock the account for 15 minutes, and there's a per-IP sign-in rate limit (`AUTH_LIMITER`).

**Why 10,000 and not 100,000?** The Cloudflare Workers Free plan allows only about 10 ms of processing per request. 100,000 rounds can exceed that, so sign-in would fail with error 1102. 10,000 rounds takes a few milliseconds.

## 2. Where things are

| What | File / place |
|---|---|
| Hashing code used by the live site | `worker/crypto.ts`: `ITERATIONS`, `hashPassword`, `verifyPassword`, `DUMMY_HASH` |
| Same hashing for setup scripts (`npm run admin:set`, `npm run db:dev-users`) | `scripts/lib/passwords.mjs`: `ITERATIONS`, `hashPassword` |
| The secret key (production) | Cloudflare dashboard → Workers & Pages → `verdi-solarr` → Settings → Variables and Secrets → `PASSWORD_PEPPER` (or `npx wrangler secret put PASSWORD_PEPPER`) |
| The secret key (your computer) | Not needed. A built-in development key (`DEV_PEPPER`) is used when `ENVIRONMENT=development`. You can set `PASSWORD_PEPPER` in `.dev.vars` (never committed). |
| Tests | `tests/unit/accounts.test.ts` ("password hashing") |

## 3. First-time setup (before anyone signs in)

1. Generate a secret key. Copy the output and **save it in a password manager**; you will need it again.
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
2. Store it in Cloudflare. Paste the key when asked:
   ```bash
   npx wrangler secret put PASSWORD_PEPPER
   ```
   Secrets survive every later deploy. Deploys never change or remove them.
3. Create the owner account. The command needs the same key so the hash matches the live site:
   ```bash
   # PowerShell
   $env:PASSWORD_PEPPER="<the secret key>"
   npm run admin:set -- --mobile=<owner mobile> --name=Owner --role=owner --password="<strong password>" --remote
   ```
   Close the terminal afterwards so the key and password are not kept in history.

If the secret is missing, the live site refuses all sign-ins with "Sign-in is temporarily unavailable", and the Worker log says `PASSWORD_PEPPER secret is not set`. It never falls back to an unprotected hash.

## 4. Changing the count later

Example: you move to the Workers Paid plan and want 100,000 rounds.

1. Change `ITERATIONS` in **both** `worker/crypto.ts` and `scripts/lib/passwords.mjs` to the same number. The allowed range is 1,000 to 100,000; 100,000 is the Workers maximum.
2. Run `npm test`, commit and deploy.

Existing passwords keep working, because each hash records its own count. New and changed passwords use the new count. Nobody needs to do anything.

## 5. The secret key: rules

- **Never change or delete `PASSWORD_PEPPER`** unless you mean to. Every existing password, for staff and customers, then stops working.
- **If it is lost or changed:** set a new key (§3 step 2), then give the owner a new password with `admin:set` using the new key (§3 step 3). The owner resets staff passwords in Admin → Staff. Customers use the password-reset link from the admin.
- **If you think it has leaked** (with the database): set a new key and reset passwords as above.
- **Never put it in** GitHub, `wrangler.jsonc`, chat messages or screenshots.

## 6. Moving to another host

Copy the database as usual. Hashes are only usable with the same secret key, so set `PASSWORD_PEPPER` to the same value on the new host and copy the logic in `worker/crypto.ts`: PBKDF2-SHA256, then HMAC-SHA256 with the key. Passwords carry over without anyone resetting them.
