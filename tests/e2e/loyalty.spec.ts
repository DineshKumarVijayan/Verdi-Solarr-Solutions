import { expect, request as pwRequest, test } from "@playwright/test";

// Customer loyalty points: a % of each won sale (default 0.5 %, 1 point = Rs 1), reversed when the sale is
// undone or corrected; staff can also credit points for a sale by hand; owner/admin change the %.

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const H = { Origin: BASE, "Content-Type": "application/json" };
const balance = async (req: import("@playwright/test").APIRequestContext, id: number) => (await (await req.get(`/api/admin/customers/${id}`)).json()).customer.points as number;

test.describe.configure({ mode: "serial" });

test("won sale earns loyalty points; corrections and cancellations reverse them; manual credit for a sale", async ({ request }) => {
  expect((await request.put("/api/admin/loyalty", { headers: H, data: { rateBasisPoints: 50 } })).ok()).toBeTruthy(); // 0.5 %
  // a customer account, then a staff-logged enquiry with the same mobile number
  const mobile = `9${String(Date.now()).slice(-9)}`;
  const anon = await pwRequest.newContext({ baseURL: BASE });
  expect((await anon.post("/api/account/register", { headers: H, data: { name: "Loyal Buyer", mobile, password: "correct-horse-1" } })).ok()).toBeTruthy();
  await anon.dispose();
  const cust = (await (await request.get(`/api/admin/customers?q=${mobile}`)).json()).rows[0];
  const enq = (await (await request.post("/api/admin/enquiries", { headers: H, data: { source: "phone", name: "Loyal Buyer", mobile, location: "Trichy" } })).json()).enquiry;

  await request.put(`/api/admin/enquiries/${enq.id}`, { headers: H, data: { status: "won", adminNotes: null, salePaise: 20_000_000 } }); // ₹2,00,000
  expect(await balance(request, cust.id)).toBe(1000); // 0.5 % = ₹1,000 = 1,000 points
  await request.put(`/api/admin/enquiries/${enq.id}`, { headers: H, data: { status: "won", adminNotes: null, salePaise: 10_000_000 } }); // corrected to ₹1,00,000
  expect(await balance(request, cust.id)).toBe(500);
  await request.put(`/api/admin/enquiries/${enq.id}`, { headers: H, data: { status: "cancelled", adminNotes: null, closedReason: "budget" } });
  expect(await balance(request, cust.id)).toBe(0);
  const ledger = (await (await request.get(`/api/admin/customers/${cust.id}`)).json()).rewards as { points: number }[];
  expect(ledger.map((r) => r.points).sort((a, b) => a - b)).toEqual([-1000, -500, 500, 1000]); // nothing edited, only added

  // manual credit for an offline sale: ₹50,000 at 0.5 % = 250 points
  const r = await request.post(`/api/admin/customers/${cust.id}/points`, { headers: H, data: { salePaise: 5_000_000, reason: "Shop counter sale" } });
  expect(r.status()).toBe(200);
  expect(await balance(request, cust.id)).toBe(250);
  // points and a sale amount together are refused
  expect((await request.post(`/api/admin/customers/${cust.id}/points`, { headers: H, data: { points: 5, salePaise: 100, reason: "both" } })).status()).toBe(422);
});

test("owner changes the loyalty % from Customers (validated) and the sale form previews points", async ({ page, request }) => {
  await page.goto("/admin/customers");
  await page.getByTestId("loyalty-rate-edit").click();
  await page.getByTestId("loyalty-rate-input").fill("150");
  await page.getByTestId("loyalty-rate-save").click();
  await expect(page.getByText("Enter a percentage between 0 and 100")).toBeVisible();
  await page.getByTestId("loyalty-rate-input").fill("1");
  await page.getByTestId("loyalty-rate-save").click();
  await expect(page.getByTestId("loyalty-rate-value")).toHaveText("1%");
  await page.getByTestId("admin-customer-row").first().click();
  await page.getByTestId("points-mode-sale").click();
  await page.getByTestId("points-sale").fill("25000");
  await expect(page.getByTestId("points-sale-preview")).toContainText("= 250 points (1% of the sale");
  // back to the business default
  expect((await request.put("/api/admin/loyalty", { headers: H, data: { rateBasisPoints: 50 } })).ok()).toBeTruthy();
});
