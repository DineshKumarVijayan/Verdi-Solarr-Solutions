// Create or update an admin with a mobile number + password (hash computed here; plaintext never stored).
//
//   npm run admin:set -- --email=owner@example.com --mobile=9876543210 --password="Strong-Pass-1" [--name="Owner"] [--role=owner] [--remote]
//
// --remote needs the production secret key in the PASSWORD_PEPPER environment variable (the same value as the
// Worker secret), otherwise the password will not work on the live site. See PASSWORDS.md.
//
// Without --remote it writes to the LOCAL dev database. Use --remote once to give the production owner a password;
// after that, owners manage everyone else in Admin → Admin users.


import { DEV_PEPPER, hashPassword, normaliseMobile, runD1, sqlString } from "./lib/passwords.mjs";

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const remote = process.argv.includes("--remote");
const email = arg("email")?.trim().toLowerCase();
const mobile = normaliseMobile(arg("mobile") ?? "");
const password = arg("password") ?? "";
const name = arg("name") ?? null;
const role = arg("role") ?? "owner";

if (!mobile || password.length < 8 || !["owner", "admin", "price_editor", "viewer"].includes(role)) {
  console.error("Usage: npm run admin:set -- --email=... --mobile=10-digit --password=(8+ chars) [--name=...] [--role=owner|admin|price_editor|viewer] [--remote]");
  process.exit(1);
}

const pepper = remote ? process.env.PASSWORD_PEPPER?.trim() : DEV_PEPPER;
if (!pepper) {
  console.error("For --remote, set PASSWORD_PEPPER to the production secret key first (see PASSWORDS.md §3).");
  process.exit(1);
}

const loginEmail = email || `${mobile}@staff.invalid`; // placeholder when no email is given (see shared/session.ts)
const sql = `INSERT INTO AdminUsers (Email, DisplayName, Role, Mobile, PasswordHash, IsActive) VALUES (${sqlString(loginEmail)}, ${sqlString(name)}, ${sqlString(role)}, ${sqlString(mobile)}, ${sqlString(await hashPassword(password, pepper))}, 1)
ON CONFLICT(Email) DO UPDATE SET Mobile = excluded.Mobile, PasswordHash = excluded.PasswordHash, Role = excluded.Role, IsActive = 1, FailedLogins = 0, LockedUntil = NULL, DisplayName = COALESCE(excluded.DisplayName, AdminUsers.DisplayName);`;

await runD1(sql, remote);
console.log(`Admin ${email || "(no email)"} (${role}) can now sign in at /admin with mobile ${mobile.slice(2)}${remote ? " on PRODUCTION" : " locally"}.`);
