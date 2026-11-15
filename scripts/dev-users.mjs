// LOCAL ONLY: create/refresh a test owner and a test customer for trying the site on your machine.
//   npm run db:dev-users
// Never runs against production (there is deliberately no --remote option).


import { DEV_PEPPER, hashPassword, runD1, sqlString } from "./lib/passwords.mjs";

export const DEV_OWNER = { email: "owner@test.local", mobile: "919000000001", password: "Owner@12345", name: "Test Owner" };
export const DEV_CUSTOMER = { mobile: "919000000002", password: "Customer@12345", name: "Test Customer", business: "Test Solar Traders", city: "Chennai" };

const o = DEV_OWNER;
const c = DEV_CUSTOMER;
const sql = `
INSERT INTO AdminUsers (Email, DisplayName, Role, Mobile, PasswordHash, IsActive) VALUES (${sqlString(o.email)}, ${sqlString(o.name)}, 'owner', ${sqlString(o.mobile)}, ${sqlString(await hashPassword(o.password, DEV_PEPPER))}, 1)
ON CONFLICT(Email) DO UPDATE SET Mobile = excluded.Mobile, PasswordHash = excluded.PasswordHash, Role = 'owner', IsActive = 1, FailedLogins = 0, LockedUntil = NULL;
INSERT INTO Customers (FullName, Mobile, BusinessName, City, PasswordHash) VALUES (${sqlString(c.name)}, ${sqlString(c.mobile)}, ${sqlString(c.business)}, ${sqlString(c.city)}, ${sqlString(await hashPassword(c.password, DEV_PEPPER))})
ON CONFLICT(Mobile) DO UPDATE SET PasswordHash = excluded.PasswordHash, IsActive = 1, FailedLogins = 0, LockedUntil = NULL;`;

await runD1(sql, false, true);
console.log(`Local test accounts ready:
  Admin (owner):  /admin    mobile ${o.mobile.slice(2)}  password ${o.password}
  Customer:       /account  mobile ${c.mobile.slice(2)}  password ${c.password}`);
