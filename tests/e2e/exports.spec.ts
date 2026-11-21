import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// "Download Excel" on the admin tables: a real .xlsx (zip of Office Open XML) with every matching row,
// readable offline; each download is written to the audit log.

/** Read the files inside a stored (uncompressed) zip. */
function unzip(buf: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const size = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const extra = buf.readUInt16LE(p + 28);
    const name = buf.toString("utf8", p + 30, p + 30 + nameLen);
    const start = p + 30 + nameLen + extra;
    out.set(name, buf.toString("utf8", start, start + size));
    p = start + size;
  }
  return out;
}

async function download(page: Page) {
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-excel").first().click()]);
  expect(dl.suggestedFilename()).toMatch(/\.xlsx$/);
  const files = unzip(readFileSync((await dl.path())!));
  for (const k of ["[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml"]) expect(files.has(k), k).toBeTruthy();
  // every XML part is well-formed
  const bad = await page.evaluate((parts) => parts.filter((x) => new DOMParser().parseFromString(x, "application/xml").querySelector("parsererror")).length, [...files.values()]);
  expect(bad).toBe(0);
  return files;
}

test("enquiries, products, customers and quotations download as Excel with all rows; downloads are logged", async ({ page, request }) => {
  const enq = (await (await request.get("/api/admin/enquiries?export=1")).json()).rows as { reference: string }[];
  await page.goto("/admin/enquiries");
  let files = await download(page);
  const sheet = files.get("xl/worksheets/sheet1.xml")!;
  expect(sheet).toContain("Reference");
  expect(sheet).toContain(enq[0].reference);
  expect(sheet).toContain(enq.at(-1)!.reference); // all rows, not just the first page
  expect((sheet.match(/<row /g) ?? []).length).toBe(enq.length + 1);

  await page.goto("/admin/products");
  files = await download(page);
  expect(files.get("xl/worksheets/sheet1.xml")).toContain("SKU");

  await page.goto("/admin/customers");
  files = await download(page);
  expect(files.get("xl/workbook.xml")).toContain('name="Points waiting"');

  await page.goto("/admin/quotations");
  files = await download(page);
  expect(files.get("xl/worksheets/sheet1.xml")).toContain("Total (₹)");

  const dash = await (await request.get("/api/admin/dashboard")).json();
  expect(dash.recentActivity.some((a: { action: string; entityId: string }) => a.action === "export.download" && a.entityId === "Quotations")).toBeTruthy();
});
