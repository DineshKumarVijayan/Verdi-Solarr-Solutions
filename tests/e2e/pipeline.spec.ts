import { expect, test, type APIRequestContext, type PlaywrightWorkerArgs } from "@playwright/test";

// Sales pipeline: each enquiry has a responsible staff member; staff move their own enquiries through
// New -> Contacted -> Quoted -> Won / Not won with their own login; Not won needs a reason,
// won needs the sale value; a quotation made from an enquiry is linked to it. Owner/admin see the stats.

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const H = { Origin: BASE, "Content-Type": "application/json" };
const MOBILE = `7${String(Date.now()).slice(-9)}`;
const TEMP = "Temp@12345";
const MINE = "Sales#Pass2026";

/** A sales staff member (role 'viewer') with their own password, signed in on their own request context. */
async function staffSession(owner: APIRequestContext, playwright: PlaywrightWorkerArgs["playwright"]) {
  const created = await owner.post("/api/admin/users", { headers: H, data: { email: "", mobile: MOBILE, password: TEMP, displayName: "Sales Person", role: "viewer", isActive: true } });
  expect(created.ok()).toBeTruthy();
  const ctx = await playwright.request.newContext({ baseURL: BASE, storageState: { cookies: [], origins: [] } });
  const pw = await ctx.post("/api/admin/password", { headers: H, data: { login: MOBILE, currentPassword: TEMP, newPassword: MINE } });
  expect(pw.ok()).toBeTruthy();
  const login = await ctx.post("/api/admin/login", { headers: H, data: { login: MOBILE, password: MINE } });
  expect(login.ok()).toBeTruthy();
  // the request context does not keep the session cookie over plain http: send it explicitly
  const cookie = login.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value.split(";")[0]).join("; ");
  await ctx.dispose();
  return playwright.request.newContext({ baseURL: BASE, extraHTTPHeaders: { Cookie: cookie }, storageState: { cookies: [], origins: [] } });
}

test.afterAll(async ({ request }) => {
  const users = (await (await request.get("/api/admin/users")).json()).users as { id: number; mobile: string; displayName: string; role: string }[];
  const u = users.find((x) => x.mobile?.endsWith(MOBILE.slice(-10)));
  if (u) await request.put(`/api/admin/users/${u.id}`, { headers: H, data: { email: "", mobile: MOBILE, displayName: u.displayName, role: u.role, isActive: false } });
});

test("staff update only their own enquiries with their own login; reasons and sale value are required; history is kept", async ({ request, playwright }) => {
  const staff = await staffSession(request, playwright);
  // staff logs an enquiry: they become responsible for it
  const res = await staff.post("/api/admin/enquiries", { headers: H, data: { source: "phone", name: "Pipeline Customer", mobile: "9876511111", location: "Trichy" } });
  const body = await res.json();
  expect(body.enquiry, JSON.stringify(body).slice(0, 300)).toBeTruthy();
  const mine = body.enquiry;
  expect(mine.owner.name).toBe("Sales Person");
  // an enquiry owned by someone else (the owner logs it) cannot be changed by this staff member
  const other = (await (await request.post("/api/admin/enquiries", { headers: H, data: { source: "visit", name: "Owner Customer", mobile: "9876522222", location: "Erode" } })).json()).enquiry;
  expect((await staff.put(`/api/admin/enquiries/${other.id}`, { headers: H, data: { status: "quoted", adminNotes: null } })).status()).toBe(403);
  // reasons / sale value
  expect((await staff.put(`/api/admin/enquiries/${mine.id}`, { headers: H, data: { status: "lost", adminNotes: null } })).status()).toBe(422);
  expect((await staff.put(`/api/admin/enquiries/${mine.id}`, { headers: H, data: { status: "lost", adminNotes: null, closedReason: "other" } })).status()).toBe(422);
  expect((await staff.put(`/api/admin/enquiries/${mine.id}`, { headers: H, data: { status: "won", adminNotes: null } })).status()).toBe(422);
  const won = await staff.put(`/api/admin/enquiries/${mine.id}`, { headers: H, data: { status: "won", adminNotes: "Paid in full", salePaise: 25_000_000 } });
  expect(won.ok()).toBeTruthy();
  const w = (await won.json()).enquiry;
  expect(w.salePaise).toBe(25_000_000);
  expect(w.closedAt).toBeTruthy();
  // staff cannot reassign, and cannot see the performance report
  expect((await staff.post(`/api/admin/enquiries/${mine.id}/assign`, { headers: H, data: { adminId: null } })).status()).toBe(403);
  expect((await staff.get("/api/admin/enquiries/stats")).status()).toBe(403);
  // owner unassigns the other enquiry; the staff member picks it up, then a second take is refused
  await request.post(`/api/admin/enquiries/${other.id}/assign`, { headers: H, data: { adminId: null } });
  const take = await staff.post(`/api/admin/enquiries/${other.id}/assign`, { headers: H, data: { take: true } });
  expect((await take.json()).enquiry.owner.name).toBe("Sales Person");
  expect((await request.post(`/api/admin/enquiries/${other.id}/assign`, { headers: H, data: { take: true } })).status()).toBe(409);
  const lost = await staff.put(`/api/admin/enquiries/${other.id}`, { headers: H, data: { status: "lost", adminNotes: null, closedReason: "price", closedNote: "Found cheaper locally" } });
  expect((await lost.json()).enquiry.closedReason).toBe("price");
  // history records who did what
  const hist = (await (await staff.get(`/api/admin/enquiries/${other.id}/history`)).json()).events as { kind: string; toStatus: string | null; reason: string | null; by: string }[];
  expect(hist.map((e) => e.kind)).toEqual(["created", "assigned", "assigned", "status"]);
  expect(hist.at(-1)).toMatchObject({ toStatus: "lost", reason: "price", by: "Sales Person" });
  // owner's report credits the staff member
  const stats = await (await request.get("/api/admin/enquiries/stats?period=year")).json();
  const me = stats.staff.find((s: { name: string }) => s.name === "Sales Person");
  expect(me).toMatchObject({ total: 2, won: 1, lost: 1, salePaise: 25_000_000 });
  expect(stats.reasons.some((r: { reason: string }) => r.reason === "price")).toBeTruthy();
  await staff.dispose();
});

test("a quotation made from an enquiry moves it to Quoted; accepting the quotation marks it Won with the quotation total", async ({ page }) => {
  const name = `Quote Flow ${Date.now().toString().slice(-6)}`;
  await page.goto("/admin/enquiries");
  await page.getByTestId("log-enquiry-open").click();
  const form = page.getByTestId("log-enquiry-form");
  await form.locator("#le-name").fill(name);
  await form.locator("#le-mobile").fill("9876533333");
  await form.locator("#le-location").fill("Vellore");
  // a product with a listed price, so the quotation needs no manual price
  const cat = await (await page.request.get("/api/catalogue")).json();
  const priced = cat.products.find((x: { price: { sellingPaise: number | null } }) => x.price.sellingPaise !== null);
  await form.getByTestId("le-product-search").fill(priced.sku);
  await form.getByTestId("le-product-hit").first().click();
  await page.getByTestId("le-save").click();
  const row = page.getByTestId("admin-enquiry").filter({ hasText: name });
  await row.locator("button[aria-expanded]").first().click();
  await row.getByTestId("enquiry-to-quote").click();
  await expect(page).toHaveURL(/\/admin\/quotations\/new/);
  await page.locator('[data-testid="q-save"]:visible').first().click();
  await expect(page).toHaveURL(/\/admin\/quotations\/\d+/);
  const id = Number(page.url().match(/quotations\/(\d+)/)![1]);
  const enq = (await (await page.request.get(`/api/admin/enquiries?q=${encodeURIComponent(name)}`)).json()).rows[0];
  expect(enq.status).toBe("quoted");
  expect(enq.quoteCount).toBe(1);
  const quote = (await (await page.request.get(`/api/admin/quotations/${id}`)).json()).quote;
  await page.request.put(`/api/admin/quotations/${id}/status`, { headers: H, data: { status: "accepted" } });
  const after = (await (await page.request.get(`/api/admin/enquiries?q=${encodeURIComponent(name)}`)).json()).rows[0];
  expect(after.status).toBe("won");
  expect(after.salePaise).toBe(quote.totalPaise);
});

test("lost enquiry in the admin screen asks for a reason; the performance page shows reasons and the pipeline", async ({ page }) => {
  const name = `Lost UI ${Date.now().toString().slice(-6)}`;
  await page.goto("/admin/enquiries");
  await page.getByTestId("log-enquiry-open").click();
  const form = page.getByTestId("log-enquiry-form");
  await form.locator("#le-name").fill(name);
  await form.locator("#le-mobile").fill("9876544444");
  await form.locator("#le-location").fill("Hosur");
  await page.getByTestId("le-save").click();
  const row = page.getByTestId("admin-enquiry").filter({ hasText: name });
  await row.locator("button[aria-expanded]").first().click();
  await row.getByTestId("next-notwon").click();
  await row.getByTestId("confirm-notwon").click();
  await expect(row.getByText("Choose why it was not won")).toBeVisible();
  await row.getByTestId("reason-picker").getByRole("button", { name: "Delivery time too long" }).click();
  await row.getByTestId("confirm-notwon").click();
  await expect(row.getByTestId("closed-reason")).toContainText("Delivery time too long");
  await page.goto("/admin/performance");
  await expect(page.getByTestId("leaderboard")).toBeVisible();
  await expect(page.getByTestId("lost-reasons")).toContainText("Delivery time too long");
});
