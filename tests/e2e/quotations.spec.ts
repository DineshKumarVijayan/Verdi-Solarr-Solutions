import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// Quotation builder: create from catalogue, discount, PDF preview + download, WhatsApp share link.

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const H = { Origin: BASE, "Content-Type": "application/json" };
const NAME = `E2E Quote ${Date.now().toString(36)}`;

test("admin builds a quotation, previews and downloads the PDF, and shares it on WhatsApp", async ({ page, context, request }) => {
  await context.route("https://wa.me/**", (r) => r.fulfill({ body: "whatsapp" }));
  await page.goto("/admin/quotations/new");
  await page.getByTestId("q-name").fill(NAME);
  await page.getByTestId("q-mobile").fill("9000000002");

  // add a priced product from the catalogue
  const search = page.getByTestId("q-product-search");
  const cat = await (await request.get("/api/catalogue")).json();
  const p = cat.products.find((x: { price: { sellingPaise: number | null } }) => x.price.sellingPaise !== null);
  await search.fill(p.name);
  const priced = page.getByTestId("q-product-option").filter({ hasText: p.name }).first();
  await expect(priced).toBeVisible();
  await priced.click();
  const line = page.getByTestId("q-line").first();
  await line.getByLabel("Quantity").fill("2");
  await line.getByLabel("Discount type").selectOption("pct");
  await line.getByLabel("Discount", { exact: true }).fill("10");
  const shown = await page.getByTestId("q-total").textContent();

  await page.locator('[data-testid="q-preview-btn"]:visible').click();
  await expect(page.getByTestId("q-preview")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/quotations\/\d+$/);
  const id = Number(page.url().split("/").pop());

  // server totals match what the editor showed
  const { quote } = await (await request.get(`/api/admin/quotations/${id}`)).json();
  expect(quote.items[0].qty).toBe(2);
  expect(quote.discountPaise).toBe(Math.round(quote.subtotalPaise * 0.1));
  expect(shown?.replace(/\s/g, "")).toContain((quote.totalPaise / 100).toLocaleString("en-IN").replace(/\s/g, ""));

  // download
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("q-download").click()]);
  expect(dl.suggestedFilename()).toBe(`Quotation-${quote.number}.pdf`);
  const bytes = readFileSync((await dl.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  if (process.env.QUOTE_PDF_OUT) await dl.saveAs(process.env.QUOTE_PDF_OUT);

  // WhatsApp: uploads the PDF, opens a chat with the customer and a private link
  const [popup] = await Promise.all([context.waitForEvent("page"), page.getByTestId("q-whatsapp").click()]);
  await popup.waitForURL(/wa\.me/);
  const wa = new URL(popup.url());
  expect(wa.pathname).toBe("/919000000002");
  const link = wa.searchParams.get("text")!.match(/\/api\/q\/[\w-]+/)![0];
  const pdf = await request.get(link);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await request.get(`/api/admin/quotations/${id}`).then((r) => r.json())).quote.status).toBe("sent");

  // cleanup; link stops working
  expect((await request.delete(`/api/admin/quotations/${id}`, { headers: H })).ok()).toBe(true);
  expect((await request.get(link)).status()).toBe(404);
});

test("quotation prices come from the database, not the browser", async ({ request }) => {
  const cat = await (await request.get("/api/catalogue")).json();
  const p = cat.products.find((x: { price: { sellingPaise: number | null } }) => x.price.sellingPaise !== null);
  const r = await request.post("/api/admin/quotations", {
    headers: H,
    data: { customerName: NAME, customerMobile: "9000000003", validDays: 15, items: [{ productId: p.id, qty: 1, unitPaise: 1, discountType: "none", discountValue: 0 }] },
  });
  expect(r.status()).toBe(201);
  const { quote } = await r.json();
  expect(quote.items[0].unitPaise).toBe(p.price.sellingPaise);
  await request.delete(`/api/admin/quotations/${quote.id}`, { headers: H });
});

test("PDF details: upload a UPI QR code and UPI ID; deleting uses the in-app confirmation", async ({ page, request }) => {
  const before = (await (await request.get("/api/admin/quotations/settings")).json()).settings;
  await page.goto("/admin/quotations");
  await page.getByRole("button", { name: "PDF details" }).click();
  await page.getByTestId("upi-qr-input").setInputFiles("public/brand/verdi-mark.png");
  await expect(page.locator('[data-testid="upi-qr-preview"] img')).toBeVisible();
  await page.getByPlaceholder("e.g. verdisolarr@okaxis").fill("verdisolarrsolution@okhdfcbank");
  await page.getByTestId("save-quote-settings").click();
  await expect(page.getByTestId("quote-settings")).toBeHidden();
  const s = (await (await request.get("/api/admin/quotations/settings")).json()).settings;
  expect(s.quoteUpiId).toBe("verdisolarrsolution@okhdfcbank");
  expect(s.quoteUpiQr).toMatch(/^r2:logo\//);
  // restore whatever was there
  await request.put("/api/admin/quotations/settings", { headers: H, data: { quoteUpiQr: before.quoteUpiQr ?? "", quoteUpiId: before.quoteUpiId ?? "" } });

  // delete -> styled confirmation dialog (Cancel keeps it, Delete removes it)
  const r = await request.post("/api/admin/quotations", { headers: H, data: { customerName: NAME, customerMobile: "9000000004", validDays: 15, items: [{ productId: null, name: "Transport", unit: "per trip", qty: 1, unitPaise: 100000, discountType: "none", discountValue: 0 }] } });
  const { quote } = await r.json();
  await page.goto(`/admin/quotations/${quote.id}`);
  await page.getByRole("button", { name: "Delete quotation" }).click();
  await page.getByTestId("confirm-cancel").click();
  await expect(page).toHaveURL(new RegExp(`/admin/quotations/${quote.id}$`));
  await page.getByRole("button", { name: "Delete quotation" }).click();
  await page.getByTestId("confirm-ok").click();
  await expect(page).toHaveURL(/\/admin\/quotations$/);
});
