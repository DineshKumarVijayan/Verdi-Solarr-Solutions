import { expect, test } from "@playwright/test";

// A create sent twice with the same one-time key (Save pressed again after a lost reply) saves once
// and returns the first result; a new key saves a new record.

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const H = { Origin: BASE, "Content-Type": "application/json" };

test("the same submission sent twice creates one enquiry, not two", async ({ request }) => {
  const name = `Retry Check ${Date.now()}`;
  const body = { source: "phone", name, mobile: "98765 43210", location: "Chennai", items: [] };
  const key = `k${Date.now()}abcdefghijklmnop`;

  const first = await request.post("/api/admin/enquiries", { headers: { ...H, "Idempotency-Key": key }, data: body });
  expect(first.status()).toBe(201);
  const again = await request.post("/api/admin/enquiries", { headers: { ...H, "Idempotency-Key": key }, data: body });
  expect(again.status()).toBe(201);
  expect(again.headers()["idempotent-replay"]).toBe("true");
  expect((await again.json()).enquiry.reference).toBe((await first.json()).enquiry.reference);

  const list = await (await request.get(`/api/admin/enquiries?q=${encodeURIComponent(name)}`)).json();
  expect(list.rows.filter((r: { contactName: string }) => r.contactName === name)).toHaveLength(1);

  // a genuinely new submission (new key) is saved as a new enquiry
  const other = await request.post("/api/admin/enquiries", { headers: { ...H, "Idempotency-Key": `${key}2` }, data: body });
  expect(other.status()).toBe(201);
  expect((await other.json()).enquiry.reference).not.toBe((await first.json()).enquiry.reference);
});
