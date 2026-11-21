import { expect, test, type Page } from "@playwright/test";

/** Number of products currently published (admins add products, so never hard-code it). */
async function liveCount(page: Page): Promise<number> {
  return (await (await page.request.get("/api/catalogue")).json()).products.length;
}

const TOPCON_620 = "/products/anchor-n-type-topcon-dual-glass-bifacial-module-620-wp";

const cspViolations: string[] = [];
test.afterEach(() => {
  expect(cspViolations, "Content-Security-Policy violations").toEqual([]);
  cspViolations.length = 0;
});

test.beforeEach(async ({ page }) => {
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to (load|execute|connect|apply)/i.test(m.text())) cspViolations.push(m.text());
  });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("__init")) {
      localStorage.clear();
      sessionStorage.setItem("__init", "1");
    }
  });
});

test("hero search leads to filtered, highlighted results", async ({ page }) => {
  await page.goto("/");
  await page.locator("#hero-q").fill("620 Wp");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/products\?q=620/);
  const first = page.getByTestId("product-card").first();
  await expect(first).toContainText("620 Wp");
  await expect(first.locator("mark").first()).toBeVisible();
});

test("filters sync to the URL and can be cleared", async ({ page }) => {
  await page.goto("/products");
  await expect(page.getByTestId("result-count")).toHaveText(new RegExp(`${await liveCount(page)} products`));
  await page.getByRole("checkbox", { name: "SolarEdge" }).check();
  await expect(page).toHaveURL(/brand=solaredge/);
  await expect(page.getByTestId("result-count")).toHaveText(/6 products/);
  await page.getByRole("button", { name: "Three phase" }).click();
  await expect(page.getByTestId("result-count")).toHaveText(/0 products/);
  await page.getByRole("button", { name: "Clear all" }).first().click();
  await expect(page.getByTestId("result-count")).toHaveText(new RegExp(`${await liveCount(page)} products`));
});

test("instant search palette supports keyboard navigation", async ({ page }) => {
  await page.goto("/products");
  await page.keyboard.press("Control+k");
  await page.getByTestId("palette-input").fill("S650B");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/products\/solaredge-s-series-residential-power-optimizer-s650b/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("S650B");
});

test("PDF datasheet opens in a modal, scrolls, and closes with Escape preserving filters", async ({ page }) => {
  await page.goto("/products?q=stellar");
  await expect(page.getByTestId("result-count")).toHaveText(/9 products/);
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.getByTestId("preview-datasheet").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText(/Page \d+ \/ 3/)).toBeVisible({ timeout: 30_000 }); // Stellar datasheet has 3 pages
  await expect(dialog.getByRole("link", { name: /Download/ })).toHaveAttribute("href", /\.pdf$/);
  await expect(dialog.getByRole("link", { name: /Open in new tab/ })).toHaveAttribute("target", "_blank");
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/q=stellar/);
  await expect(page.getByTestId("product-search")).toHaveValue("stellar");
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("");
});

test("enquiry: add, revalidate prices, preview and generate a WhatsApp link", async ({ page }) => {
  await page.goto(TOPCON_620);
  await page.getByTestId("add-to-enquiry-main").click();
  await expect(page.getByTestId("basket-count")).toHaveText("1");
  await page.goto("/enquiry");
  await expect(page.getByTestId("basket-lines").locator("li")).toHaveCount(1);
  // validation
  await page.getByTestId("check-prices").click();
  await expect(page.getByText("Please enter your name")).toBeVisible();
  await page.getByLabel(/Your name/).fill("Test Installer");
  await page.getByLabel(/Business name/).fill("Sunrise EPC");
  await page.getByLabel(/Mobile number/).fill("+91 98765 43210");
  await page.getByLabel(/Delivery location/).fill("Chennai");
  await page.getByLabel(/Additional requirements/).fill("Need 10 pallets");
  const reval = page.waitForResponse((r) => r.url().endsWith("/api/enquiry/revalidate") && r.status() === 200);
  await page.getByTestId("check-prices").click();
  await reval;
  const preview = page.getByTestId("message-preview");
  await expect(preview).toBeVisible();
  await expect(preview).toContainText("Test Installer");
  await expect(preview).toContainText("620 Wp");
  await expect(preview).toContainText("subject to confirmation by VERDI SOLARR SOLUTION");
  await page.context().route("https://wa.me/**", (r) => r.fulfill({ body: "ok" }));
  const [popup] = await Promise.all([page.context().waitForEvent("page"), page.getByTestId("open-whatsapp").click()]);
  await popup.waitForURL(/wa.me/);
  const href = popup.url();
  await popup.close();
  expect(href).toMatch(/^https:\/\/wa\.me\/918939277997\?text=/);
  expect(decodeURIComponent(href!.split("text=")[1])).toContain("Sunrise EPC");
  // basket survives reload
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByTestId("basket-lines").locator("li")).toHaveCount(1);
});

test("calculators compute client-side", async ({ page }) => {
  let apiCalls = 0;
  page.on("request", (r) => r.url().includes("/api/") && !r.url().includes("/api/catalogue") && !r.url().includes("/api/admin/me") && apiCalls++);
  await page.goto("/solar-tools/battery");
  await page.getByLabel("Capacity", { exact: true }).fill("100");
  await page.getByLabel("Connected load").fill("960");
  await expect(page.getByTestId("battery-results")).toContainText("1.8 h"); // 100Ah×12V×2 batteries ×80% DoD ×90% eff / 960W = 1.8 h
  await page.goto("/solar-tools/consumption");
  await expect(page.getByTestId("consumption-results")).toContainText("kWh");
  expect(apiCalls).toBe(0);
});

test("admin routes are not indexed and robots meta is set", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("header account menu exposes staff/admin sign-in", async ({ page }) => {
  await page.goto("/products");
  await page.getByTestId("account-menu").click();
  await expect(page.getByTestId("admin-signin-link")).toHaveAttribute("href", "/admin");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("admin-signin-link")).toBeHidden();
});

test("floating WhatsApp and Call buttons link to the official number", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("fab-whatsapp")).toHaveAttribute("href", "https://wa.me/918939277997");
  await expect(page.getByTestId("fab-call")).toHaveAttribute("href", "tel:+918939277997");
});

test("clear filters button resets every filter", async ({ page }) => {
  await page.goto("/products?brand=solaredge&phase=single&q=inverter");
  await expect(page.getByTestId("result-count")).toHaveText(/2 products/);
  await page.getByTestId("clear-filters").click();
  await expect(page.getByTestId("result-count")).toHaveText(new RegExp(`${await liveCount(page)} products`));
  await expect(page).toHaveURL(/\/products$/);
});

test("product gallery shows real image and opens a large preview", async ({ page }) => {
  await page.goto("/products/anchor-stellar-three-phase-grid-tie-inverter-5ktl3x");
  const img = page.getByTestId("gallery-main").locator("img");
  await expect(img).toHaveAttribute("src", /anchor-stellar-inverter\.webp/);
  await page.getByTestId("gallery-main").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("learning hub: open a lesson, interact, go to next lesson", async ({ page }) => {
  await page.goto("/learn");
  await page.getByTestId("pager").getByTestId("page-size-all").click(); // lessons are paged (20 per page by default)
  await expect(page.getByTestId("lesson-card")).toHaveCount(24);
  await page.getByRole("tab", { name: "Wiring & safety" }).click();
  await expect(page.getByTestId("lesson-card")).toHaveCount(5);
  await page.getByRole("link", { name: /Solar cables & ohmic losses/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Solar cables & ohmic losses");
  await page.getByRole("radio", { name: "6 mm²" }).click();
  await expect(page.getByText("3.39 Ω/km", { exact: false })).toBeVisible();
  await page.getByTestId("next-lesson").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("MC4 connectors done right");
});

test("in-the-field gallery filters and opens a lightbox", async ({ page }) => {
  await page.goto("/in-the-field");
  await expect(page.getByTestId("field-photo").first()).toBeVisible();
  const all = await page.getByTestId("field-photo").count();
  expect(all).toBeGreaterThan(5);
  await page.getByRole("tab", { name: "Inverters" }).click();
  await expect(page.getByTestId("field-photo")).toHaveCount(2);
  await page.getByTestId("field-photo").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Next photo" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("home catalogue showcase switches category", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("tab", { name: /Solar DC Cables/ }).click();
  await expect(page.getByRole("heading", { level: 3, name: "Solar DC Cables" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Explore solar dc cables/i })).toHaveAttribute("href", "/category/solar-dc-cables");
});
