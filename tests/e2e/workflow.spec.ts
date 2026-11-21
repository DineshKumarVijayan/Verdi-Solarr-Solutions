import { expect, test, type APIRequestContext, type PlaywrightWorkerArgs } from "@playwright/test";

// Simple, clear pipeline: New -> Contacted -> Quoted -> Won | Not won. Sales staff see their own and
// unassigned enquiries and only their own quotations; with a quotation, the sale is recorded by accepting
// it; only owner/admin reopen closed enquiries, undo accepted quotations or delete quotations;
// follow-up dates feed "My day" and the overdue count in Performance.

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const H = { Origin: BASE, "Content-Type": "application/json" };
const MOBILE = `6${String(Date.now()).slice(-9)}`;
const TEMP = "Temp@12345";
const MINE = "Flow#Pass2026";
const day = (n: number) => new Date(Date.now() + 5.5 * 3600_000 + n * 86400_000).toISOString().slice(0, 10);

test.describe.configure({ mode: "serial" });

async function staffSession(owner: APIRequestContext, playwright: PlaywrightWorkerArgs["playwright"]) {
  const created = await owner.post("/api/admin/users", { headers: H, data: { email: "", mobile: MOBILE, password: TEMP, displayName: "Flow Staff", role: "viewer", isActive: true } });
  expect(created.ok()).toBeTruthy();
  const ctx = await playwright.request.newContext({ baseURL: BASE, storageState: { cookies: [], origins: [] } });
  expect((await ctx.post("/api/admin/password", { headers: H, data: { login: MOBILE, currentPassword: TEMP, newPassword: MINE } })).ok()).toBeTruthy();
  const login = await ctx.post("/api/admin/login", { headers: H, data: { login: MOBILE, password: MINE } });
  expect(login.ok()).toBeTruthy();
  const cookie = login.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value.split(";")[0]).join("; ");
  await ctx.dispose();
  return playwright.request.newContext({ baseURL: BASE, extraHTTPHeaders: { Cookie: cookie }, storageState: { cookies: [], origins: [] } });
}

test.afterAll(async ({ request }) => {
  const users = (await (await request.get("/api/admin/users")).json()).users as { id: number; mobile: string; displayName: string; role: string }[];
  const u = users.find((x) => x.mobile?.endsWith(MOBILE.slice(-10)));
  if (u) await request.put(`/api/admin/users/${u.id}`, { headers: H, data: { email: "", mobile: MOBILE, displayName: u.displayName, role: u.role, isActive: false } });
});

test("sales staff see only their own and unassigned work; quotations belong to their maker; closed work is reopened only by owner/admin", async ({ request, playwright }) => {
  const staff = await staffSession(request, playwright);
  const log = (who: APIRequestContext, name: string) => who.post("/api/admin/enquiries", { headers: H, data: { source: "phone", name, mobile: "9876512345", location: "Karur" } }).then(async (r) => (await r.json()).enquiry);
  const mine = await log(staff, `Flow Mine ${Date.now()}`);
  const owners = await log(request, `Flow Owners ${Date.now()}`);
  // list: own + unassigned only
  const list = (await (await staff.get("/api/admin/enquiries")).json()).rows as { id: number; owner: { id: number } | null }[];
  expect(list.some((e) => e.id === mine.id)).toBeTruthy();
  expect(list.some((e) => e.id === owners.id)).toBeFalsy();
  expect(list.every((e) => e.owner === null || e.owner.id === mine.owner.id)).toBeTruthy();
  expect((await staff.get(`/api/admin/enquiries/${owners.id}/history`)).status()).toBe(403);

  // quotations: the maker owns it; staff cannot see, change, accept or delete someone else's
  const cat = await (await request.get("/api/catalogue")).json();
  const p = cat.products.find((x: { price: { sellingPaise: number | null } }) => x.price.sellingPaise !== null);
  const quote = (body: object) => ({ customerName: "Flow", customerMobile: "9876512345", validDays: 15, items: [{ productId: p.id, name: "", unit: "", qty: 2, unitPaise: null, discountType: "none", discountValue: 0 }], ...body });
  const ownerQ = (await (await request.post("/api/admin/quotations", { headers: H, data: quote({ enquiryId: owners.id }) })).json()).quote;
  expect((await staff.get(`/api/admin/quotations/${ownerQ.id}`)).status()).toBe(403);
  expect((await staff.put(`/api/admin/quotations/${ownerQ.id}/status`, { headers: H, data: { status: "accepted" } })).status()).toBe(403);
  expect((await staff.post("/api/admin/quotations", { headers: H, data: quote({ enquiryId: owners.id }) })).status()).toBe(403); // not their enquiry
  const staffQ = (await (await staff.post("/api/admin/quotations", { headers: H, data: quote({ enquiryId: mine.id }) })).json()).quote;
  expect(staffQ.owner.name).toBe("Flow Staff");
  const sList = (await (await staff.get("/api/admin/quotations")).json()).rows as { id: number }[];
  expect(sList.map((r) => r.id)).toContain(staffQ.id);
  expect(sList.map((r) => r.id)).not.toContain(ownerQ.id);
  expect((await staff.delete(`/api/admin/quotations/${staffQ.id}`, { headers: H })).status()).toBe(403);
  // customer accounts (mobiles, emails, points) are for owner and admins only
  expect((await staff.get("/api/admin/customers")).status()).toBe(403);
  // only owner/admin change the WhatsApp wording or move enquiries in bulk
  expect((await staff.put("/api/admin/message-templates", { headers: H, data: { templates: { waFollowUp: "Hi {name}" } } })).status()).toBe(403);
  expect((await staff.post("/api/admin/enquiries/bulk-assign", { headers: H, data: { ids: [mine.id], adminId: null } })).status()).toBe(403);

  // with a quotation, Won is recorded by accepting it
  expect((await staff.put(`/api/admin/enquiries/${mine.id}`, { headers: H, data: { status: "won", adminNotes: null, salePaise: 100_000 } })).status()).toBe(409);
  expect((await staff.put(`/api/admin/quotations/${staffQ.id}/status`, { headers: H, data: { status: "accepted" } })).ok()).toBeTruthy();
  let e = (await (await staff.get(`/api/admin/enquiries?q=${mine.reference}`)).json()).rows[0];
  expect(e).toMatchObject({ status: "won", salePaise: staffQ.totalPaise });
  // accepted quotations are locked; only owner/admin undo them, which undoes the sale
  expect((await staff.put(`/api/admin/quotations/${staffQ.id}`, { headers: H, data: quote({}) })).status()).toBe(409);
  expect((await staff.put(`/api/admin/quotations/${staffQ.id}/status`, { headers: H, data: { status: "sent" } })).status()).toBe(403);
  expect((await request.put(`/api/admin/quotations/${staffQ.id}/status`, { headers: H, data: { status: "sent" } })).ok()).toBeTruthy();
  e = (await (await staff.get(`/api/admin/enquiries?q=${mine.reference}`)).json()).rows[0];
  expect(e).toMatchObject({ status: "quoted", salePaise: null });
  const bonus = (await (await request.get(`/api/admin/bonus/entries?staff=${mine.owner.id}`)).json()).entries as { enquiryId: number; amountPaise: number }[];
  expect(bonus.filter((b) => b.enquiryId === mine.id).reduce((a, b) => a + b.amountPaise, 0)).toBe(0); // bonus reversed

  // Not won, then only owner/admin can reopen
  expect((await staff.put(`/api/admin/enquiries/${mine.id}`, { headers: H, data: { status: "lost", adminNotes: null, closedReason: "duplicate" } })).ok()).toBeTruthy();
  expect((await staff.put(`/api/admin/enquiries/${mine.id}`, { headers: H, data: { status: "contacted", adminNotes: null } })).status()).toBe(403);
  expect((await request.put(`/api/admin/enquiries/${mine.id}`, { headers: H, data: { status: "contacted", adminNotes: null } })).ok()).toBeTruthy();
  // the old "cancelled" stage no longer exists
  expect((await request.put(`/api/admin/enquiries/${mine.id}`, { headers: H, data: { status: "cancelled", adminNotes: null, closedReason: "price" } })).status()).toBe(422);
  await staff.dispose();
});

test("follow-up dates show in My day (overdue first) and as overdue in Performance; duplicates do not count", async ({ request }) => {
  const me = (await (await request.get("/api/admin/me")).json()).admin;
  const late = (await (await request.post("/api/admin/enquiries", { headers: H, data: { source: "phone", name: `Follow Late ${Date.now()}`, mobile: "9876500011", location: "Salem", followUpOn: day(-2) } })).json()).enquiry;
  const now = (await (await request.post("/api/admin/enquiries", { headers: H, data: { source: "phone", name: `Follow Today ${Date.now()}`, mobile: "9876500012", location: "Salem" } })).json()).enquiry;
  await request.put(`/api/admin/enquiries/${now.id}`, { headers: H, data: { adminNotes: null, followUpOn: day(0) } });
  const md = await (await request.get("/api/admin/my-day")).json();
  const refs = md.followUps.map((f: { reference: string }) => f.reference);
  expect(refs).toContain(late.reference);
  expect(refs).toContain(now.reference);
  expect(refs.indexOf(late.reference)).toBeLessThan(refs.indexOf(now.reference));
  const stats = await (await request.get("/api/admin/enquiries/stats?period=year")).json();
  const mine = stats.staff.find((s: { id: number }) => s.id === me.id);
  expect(mine.overdue).toBeGreaterThanOrEqual(1);
  // a duplicate leaves the totals
  const before = mine.total;
  await request.put(`/api/admin/enquiries/${now.id}`, { headers: H, data: { status: "lost", adminNotes: null, closedReason: "duplicate" } });
  const after = (await (await request.get("/api/admin/enquiries/stats?period=year")).json()).staff.find((s: { id: number }) => s.id === me.id);
  expect(after.total).toBe(before - 1);
  // closing clears the follow-up date
  const closed = (await (await request.get(`/api/admin/enquiries?q=${now.reference}`)).json()).rows[0];
  expect(closed.followUpOn).toBeNull();
});

test("enquiry screen shows the stage and one next step; Not won asks for a reason; My day is on the dashboard", async ({ page }) => {
  const name = `Step UI ${Date.now().toString().slice(-6)}`;
  await page.goto("/admin/enquiries");
  await page.getByTestId("log-enquiry-open").click();
  const form = page.getByTestId("log-enquiry-form");
  await form.locator("#le-name").fill(name);
  await form.locator("#le-mobile").fill("9876566666");
  await form.locator("#le-location").fill("Namakkal");
  await form.getByRole("button", { name: "Not reached yet" }).click();
  await form.getByTestId("le-followup").fill(day(-1));
  await page.getByTestId("le-save").click();
  const row = page.getByTestId("admin-enquiry").filter({ hasText: name });
  await expect(row.getByTestId("followup-chip")).toHaveText(/overdue/i);
  await row.locator("button[aria-expanded]").first().click();
  await expect(row.getByTestId("step-bar")).toBeVisible();
  await expect(row.getByTestId("status-hint")).toContainText("Nobody has spoken");
  await row.getByTestId("next-contacted").click();
  await expect(row.getByTestId("status-hint")).toContainText("create a quotation");
  await row.getByTestId("next-notwon").click();
  await row.getByTestId("confirm-notwon").click();
  await expect(row.getByText("Choose why it was not won")).toBeVisible();
  await row.getByTestId("reason-picker").getByRole("button", { name: "Order cancelled by customer" }).click();
  await row.getByTestId("confirm-notwon").click();
  await expect(row.getByTestId("closed-reason")).toContainText("Order cancelled by customer");
  await expect(row.getByTestId("reopen-enquiry")).toBeVisible(); // owner can reopen
  await page.goto("/admin");
  await expect(page.getByTestId("my-day").filter({ visible: true })).toBeVisible();
});

test("points wait for a buyer without an account and move into it when they register; corrections follow", async ({ request, playwright }) => {
  await request.put("/api/admin/loyalty", { headers: H, data: { rateBasisPoints: 50 } });
  const mobile = `8${String(Date.now()).slice(-9)}`;
  const enq = (await (await request.post("/api/admin/enquiries", { headers: H, data: { source: "visit", name: "Walk-in Buyer", mobile, location: "Dindigul" } })).json()).enquiry;
  await request.put(`/api/admin/enquiries/${enq.id}`, { headers: H, data: { status: "won", adminNotes: null, salePaise: 20_000_000 } }); // ₹2,00,000 -> 1,000 points
  let row = (await (await request.get(`/api/admin/enquiries?q=${enq.reference}`)).json()).rows[0];
  expect(row.points).toEqual({ credited: 0, waiting: 1000 });
  let pending = (await (await request.get("/api/admin/loyalty/pending")).json()).rows as { mobile: string; points: number }[];
  expect(pending.find((p) => p.mobile === `91${mobile}`)?.points).toBe(1000);
  // corrected sale amount: the waiting points follow
  await request.put(`/api/admin/enquiries/${enq.id}`, { headers: H, data: { status: "won", adminNotes: null, salePaise: 10_000_000 } });
  row = (await (await request.get(`/api/admin/enquiries?q=${enq.reference}`)).json()).rows[0];
  expect(row.points.waiting).toBe(500);
  // the buyer registers with that number: the points move into the account
  const anon = await playwright.request.newContext({ baseURL: BASE, storageState: { cookies: [], origins: [] } });
  expect((await anon.post("/api/account/register", { headers: H, data: { name: "Walk-in Buyer", mobile, password: "correct-horse-1" } })).ok()).toBeTruthy();
  const mine = await (await anon.get("/api/account/rewards")).json();
  expect(mine.balance).toBe(500);
  await anon.dispose();
  pending = (await (await request.get("/api/admin/loyalty/pending")).json()).rows;
  expect(pending.some((p) => p.mobile === `91${mobile}`)).toBeFalsy();
  row = (await (await request.get(`/api/admin/enquiries?q=${enq.reference}`)).json()).rows[0];
  expect(row.points).toEqual({ credited: 500, waiting: 0 });
  // undoing the sale now takes the points back from the account
  await request.put(`/api/admin/enquiries/${enq.id}`, { headers: H, data: { status: "lost", adminNotes: null, closedReason: "order_cancelled" } });
  row = (await (await request.get(`/api/admin/enquiries?q=${enq.reference}`)).json()).rows[0];
  expect(row.points).toEqual({ credited: 0, waiting: 0 });
});

test("a quotation made without an enquiry gets one automatically; accepting it records the sale, bonus and points once", async ({ request }) => {
  const cat = await (await request.get("/api/catalogue")).json();
  const p = cat.products.find((x: { price: { sellingPaise: number | null } }) => x.price.sellingPaise !== null);
  const item = { productId: p.id, name: "", unit: "", qty: 3, unitPaise: null, discountType: "none", discountValue: 0 };
  // mobile is required: it records the sale and the customer's points
  expect((await request.post("/api/admin/quotations", { headers: H, data: { customerName: "Offline Buyer", validDays: 15, items: [item] } })).status()).toBe(422);
  const mobile = `7${String(Date.now()).slice(-9)}`;
  const q = (await (await request.post("/api/admin/quotations", { headers: H, data: { customerName: "Offline Buyer", customerMobile: mobile, customerAddress: "Main Road\nTiruppur", validDays: 15, reachedVia: "whatsapp", items: [item] } })).json()).quote;
  expect(q.enquiryReference).toBeTruthy();
  let e = (await (await request.get(`/api/admin/enquiries?q=${q.enquiryReference}`)).json()).rows[0];
  expect(e).toMatchObject({ status: "quoted", source: "whatsapp", location: "Main Road", quoteCount: 1 });
  expect(e.items.length).toBe(1);
  // two "Accept" taps at the same moment: one wins, the other is refused; the sale is recorded once
  const [a, b] = await Promise.all([1, 2].map(() => request.put(`/api/admin/quotations/${q.id}/status`, { headers: H, data: { status: "accepted" } })));
  expect([a.status(), b.status()].sort()).toEqual([200, 409]);
  e = (await (await request.get(`/api/admin/enquiries?q=${q.enquiryReference}`)).json()).rows[0];
  expect(e).toMatchObject({ status: "won", salePaise: q.totalPaise });
  const bonus = (await (await request.get(`/api/admin/bonus/entries?staff=${e.owner.id}`)).json()).entries as { enquiryId: number; kind: string }[];
  expect(bonus.filter((x) => x.enquiryId === e.id && x.kind === "sale").length).toBe(1);
  expect(e.points.waiting).toBeGreaterThan(0);
  // an accepted quotation cannot be deleted, and its enquiry is reopened only through the quotation
  expect((await request.delete(`/api/admin/quotations/${q.id}`, { headers: H })).status()).toBe(409);
  expect((await request.put(`/api/admin/enquiries/${e.id}`, { headers: H, data: { status: "contacted", adminNotes: null } })).status()).toBe(409);
  // a quotation for an enquiry closed as Not won cannot be accepted until it is reopened
  await request.put(`/api/admin/quotations/${q.id}/status`, { headers: H, data: { status: "declined" } });
  await request.put(`/api/admin/enquiries/${e.id}`, { headers: H, data: { status: "lost", adminNotes: null, closedReason: "price" } });
  expect((await request.put(`/api/admin/quotations/${q.id}/status`, { headers: H, data: { status: "accepted" } })).status()).toBe(409);
});

test("deactivating a staff member hands their open enquiries back as Unassigned", async ({ request }) => {
  const users = (await (await request.get("/api/admin/users")).json()).users as { id: number; mobile: string; displayName: string; role: string; isActive: boolean }[];
  const u = users.find((x) => x.mobile?.endsWith(MOBILE.slice(-10)))!;
  const mine = (await (await request.post("/api/admin/enquiries", { headers: H, data: { source: "phone", name: `Handover ${Date.now()}`, mobile: "9876500077", location: "Erode" } })).json()).enquiry;
  await request.post(`/api/admin/enquiries/${mine.id}/assign`, { headers: H, data: { adminId: u.id } });
  await request.put(`/api/admin/users/${u.id}`, { headers: H, data: { email: "", mobile: MOBILE, displayName: u.displayName, role: u.role, isActive: false } });
  const after = (await (await request.get(`/api/admin/enquiries?q=${mine.reference}`)).json()).rows[0];
  expect(after.owner).toBeNull();
  const hist = (await (await request.get(`/api/admin/enquiries/${mine.id}/history`)).json()).events as { kind: string; note: string | null }[];
  expect(hist.at(-1)).toMatchObject({ kind: "assigned", note: "Staff member deactivated" });
});

test("deleting a product keeps the image that an existing quotation still shows", async ({ request }) => {
  const cat = await (await request.get("/api/catalogue")).json();
  const copy = (await (await request.post(`/api/admin/products/${cat.products[0].id}/duplicate`, { headers: H })).json());
  const productId = (copy.product?.id ?? copy.id) as number;
  // a 1x1 PNG uploaded as this product's only photo
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  const up = await (await request.post("/api/admin/uploads?kind=image", { headers: { Origin: BASE, "Content-Type": "image/png" }, data: png })).json();
  expect(up.storageKey).toBeTruthy();
  expect((await request.post(`/api/admin/products/${productId}/media`, { headers: H, data: { type: "image", storageKey: up.storageKey, isPrimary: true } })).ok()).toBeTruthy();
  const q = (await (await request.post("/api/admin/quotations", { headers: H, data: { customerName: "Image Keeper", customerMobile: "9876500099", validDays: 15, items: [{ productId, name: "", unit: "", qty: 1, unitPaise: 10000, discountType: "none", discountValue: 0 }] } })).json()).quote;
  const img = q.items[0].imageUrl as string;
  expect(img).toBeTruthy();
  expect((await request.delete(`/api/admin/products/${productId}`, { headers: H })).ok()).toBeTruthy();
  expect((await request.get(img)).status()).toBe(200);
});

test("owner moves several open enquiries (and their open quotations) to another staff member in one go", async ({ request, page }) => {
  const mob = `95${String(Date.now()).slice(-8)}`;
  const made = await request.post("/api/admin/users", { headers: H, data: { email: "", mobile: mob, password: TEMP, displayName: "Cover Staff", role: "viewer", isActive: true } });
  const cover = ((await made.json()).users as { id: number; mobile: string }[]).find((u) => u.mobile?.endsWith(mob))!;
  const log = async (n: string) => (await (await request.post("/api/admin/enquiries", { headers: H, data: { source: "phone", name: n, mobile: "9876500055", location: "Ooty" } })).json()).enquiry;
  const a = await log(`Bulk A ${Date.now()}`);
  const b = await log(`Bulk B ${Date.now()}`);
  const c = await log(`Bulk C ${Date.now()}`);
  await request.put(`/api/admin/enquiries/${c.id}`, { headers: H, data: { status: "lost", adminNotes: null, closedReason: "price" } });
  const cat = await (await request.get("/api/catalogue")).json();
  const p = cat.products.find((x: { price: { sellingPaise: number | null } }) => x.price.sellingPaise !== null);
  const q = (await (await request.post("/api/admin/quotations", { headers: H, data: { customerName: "Bulk A", customerMobile: "9876500055", validDays: 15, enquiryId: a.id, items: [{ productId: p.id, name: "", unit: "", qty: 1, unitPaise: null, discountType: "none", discountValue: 0 }] } })).json()).quote;
  // validation
  expect((await request.post("/api/admin/enquiries/bulk-assign", { headers: H, data: { ids: [], adminId: cover.id } })).status()).toBe(422);
  const r = await (await request.post("/api/admin/enquiries/bulk-assign", { headers: H, data: { ids: [a.id, b.id, c.id], adminId: cover.id } })).json();
  expect(r).toEqual({ moved: 2, skipped: 1 }); // the Not won one stays
  const rows = (await (await request.get(`/api/admin/enquiries?owner=${cover.id}`)).json()).rows as { id: number }[];
  expect(rows.map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
  expect((await (await request.get(`/api/admin/quotations/${q.id}`)).json()).quote.owner.name).toBe("Cover Staff");
  const hist = (await (await request.get(`/api/admin/enquiries/${b.id}/history`)).json()).events as { note: string | null }[];
  expect(hist.at(-1)?.note).toBe("Reassigned in bulk");

  // the same from the screen: select, choose Unassigned, move
  await page.goto(`/admin/enquiries?q=${encodeURIComponent("Bulk B")}`);
  await page.getByTestId("bulk-start").click();
  await page.getByTestId("admin-enquiry").filter({ hasText: b.reference }).getByTestId("bulk-pick").check();
  await expect(page.getByTestId("bulk-count")).toHaveText("1 selected");
  await page.getByTestId("bulk-to").selectOption("none");
  await page.getByTestId("bulk-move").click();
  await expect(page.getByText(/Moved 1 enquiry/)).toBeVisible();
  const after = (await (await request.get(`/api/admin/enquiries?q=${b.reference}`)).json()).rows[0];
  expect(after.owner).toBeNull();
  await request.put(`/api/admin/users/${cover.id}`, { headers: H, data: { email: "", mobile: mob, displayName: "Cover Staff", role: "viewer", isActive: false } });
});

test("WhatsApp messages: owner edits the wording (checked), staff pick a ready message filled with the customer's details", async ({ request, page }) => {
  expect((await request.put("/api/admin/message-templates", { headers: H, data: { templates: { waFollowUp: "Hi {nmae}" } } })).status()).toBe(422);
  expect((await request.put("/api/admin/message-templates", { headers: H, data: { templates: { waReviewLink: "not a link" } } })).status()).toBe(422);
  expect((await request.put("/api/admin/message-templates", { headers: H, data: { templates: { waSomethingElse: "x" } } })).status()).toBe(422);
  const saved = await (await request.put("/api/admin/message-templates", { headers: H, data: { templates: { waFollowUp: "Hi {name}, checking in about {reference}.", waReviewLink: "https://g.page/r/example/review" } } })).json();
  expect(saved.templates.waFollowUp).toBe("Hi {name}, checking in about {reference}.");

  const enq = (await (await request.post("/api/admin/enquiries", { headers: H, data: { source: "phone", name: "Template Customer", mobile: "9876500066", location: "Madurai" } })).json()).enquiry;
  await page.goto(`/admin/enquiries?q=${enq.reference}`);
  const row = page.getByTestId("admin-enquiry").filter({ hasText: enq.reference });
  await row.locator("button[aria-expanded]").first().click();
  await row.getByTestId("wa-menu").click();
  await expect(page.getByTestId("wa-waFollowUp")).toContainText(`Hi Template Customer, checking in about ${enq.reference}.`);
  await expect(page.getByTestId("wa-waFirstContact")).toContainText(enq.reference);
  await page.context().route("https://wa.me/**", (r) => r.fulfill({ body: "ok" }));
  const [popup] = await Promise.all([page.context().waitForEvent("page"), page.getByTestId("wa-waFollowUp").click()]);
  expect(decodeURIComponent(popup.url())).toContain(`Hi Template Customer, checking in about ${enq.reference}.`);
  await popup.close();

  // back to the default wording; the Settings page shows the editor
  await request.put("/api/admin/message-templates", { headers: H, data: { templates: { waFollowUp: "", waReviewLink: "" } } });
  await page.goto("/admin/settings");
  await expect(page.getByTestId("message-templates")).toBeVisible();
  await page.getByTestId("m-waFollowUp").fill("Hello {name} {oops}");
  await page.getByTestId("save-messages").click();
  await expect(page.getByText("Unknown placeholder {oops}")).toBeVisible();
});
