import { expect, test } from "@playwright/test";

// Staff bonus: % of each won sale; owner/admin approve and pay (settling the balance, never twice);
// a sale that is undone is reversed; staff see their own bonus.

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const H = { Origin: BASE, "Content-Type": "application/json" };

test("bonus follows the sale and can only be paid once", async ({ request }) => {
  expect((await request.put("/api/admin/bonus/rates", { headers: H, data: { staffId: null, rateBasisPoints: 200 } })).ok()).toBeTruthy(); // 2 %
  const enq = (await (await request.post("/api/admin/enquiries", { headers: H, data: { source: "phone", name: `Bonus ${Date.now()}`, mobile: "9876588888", location: "Madurai" } })).json()).enquiry;
  const me = enq.owner.id;
  await request.put(`/api/admin/enquiries/${enq.id}`, { headers: H, data: { status: "won", adminNotes: null, salePaise: 10_000_000 } }); // ₹1,00,000
  let entries = (await (await request.get(`/api/admin/bonus/entries?staff=${me}&unpaid=1`)).json()).entries as { id: number; enquiryId: number; amountPaise: number; kind: string }[];
  const bonus = entries.find((e) => e.enquiryId === enq.id)!;
  expect(bonus).toMatchObject({ kind: "sale", amountPaise: 200_000 }); // 2 % of ₹1,00,000 = ₹2,000
  const total = entries.reduce((a, e) => a + e.amountPaise, 0);
  const ids = entries.map((e) => e.id);
  const paid = await request.post("/api/admin/bonus/payouts", { headers: H, data: { staffId: me, entryIds: ids, expectedPaise: total, paidOn: "2026-11-30", method: "With salary" } });
  expect(paid.status()).toBe(201);
  // the same bonuses cannot be paid again
  expect((await request.post("/api/admin/bonus/payouts", { headers: H, data: { staffId: me, entryIds: ids, expectedPaise: total, paidOn: "2026-11-30" } })).status()).toBe(409);
  const ov = await (await request.get("/api/admin/bonus")).json();
  expect(ov.staff.find((s: { staffId: number }) => s.staffId === me).unpaidPaise).toBe(0);
  // undoing the sale adds a reversing entry (a deduction from the next payment)
  await request.put(`/api/admin/enquiries/${enq.id}`, { headers: H, data: { status: "lost", adminNotes: null, closedReason: "budget" } });
  entries = (await (await request.get(`/api/admin/bonus/entries?staff=${me}&unpaid=1`)).json()).entries;
  expect(entries.find((e) => e.enquiryId === enq.id)).toMatchObject({ kind: "reversal", amountPaise: -200_000 });
});

test("owner pays a staff member's bonus from the Bonus page; the unpaid balance resets", async ({ page, request }) => {
  await request.put("/api/admin/bonus/rates", { headers: H, data: { staffId: null, rateBasisPoints: 250 } });
  const enq = (await (await request.post("/api/admin/enquiries", { headers: H, data: { source: "visit", name: `Pay UI ${Date.now()}`, mobile: "9876599999", location: "Salem" } })).json()).enquiry;
  await request.put(`/api/admin/enquiries/${enq.id}`, { headers: H, data: { status: "won", adminNotes: null, salePaise: 40_000_000 } });
  await page.goto("/admin/bonus");
  const card = page.getByTestId("bonus-staff").locator("li").filter({ hasText: enq.owner.name }).first();
  await expect(card.getByTestId("unpaid-amount")).not.toHaveText("₹0");
  await card.getByTestId("pay-bonus").click();
  const panel = page.getByTestId("pay-panel");
  await expect(panel.getByTestId("pay-entries")).toBeVisible();
  await page.getByTestId("confirm-pay").click();
  await expect(card.getByTestId("unpaid-amount")).toHaveText("₹0");
  await expect(page.getByTestId("bonus-payout").first()).toBeVisible();
});

test("default rate can be changed from the Bonus page and is validated", async ({ page }) => {
  await page.goto("/admin/bonus");
  await page.getByTestId("edit-default-rate").click();
  await page.getByTestId("rate-input").fill("150");
  await page.getByTestId("save-rate").click();
  await expect(page.getByText("Enter a percentage between 0 and 100")).toBeVisible();
  await page.getByTestId("rate-input").fill("2.5");
  await page.getByTestId("save-rate").click();
  await expect(page.getByTestId("default-rate")).toContainText("2.5%");
});
