import { expect, test } from "@playwright/test";

for (const path of ["/", "/in-the-field", "/products", "/products/anchor-ino-residential-single-phase-pv-inverter-5ktlx", "/enquiry", "/learn", "/solar-tools/kit-builder", "/compare", "/admin/prices", "/admin/quotations", "/admin/quotations/new", "/solar-panels-chennai", "/account"]) {
  test(`no horizontal overflow on mobile: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("public bottom tab bar and More sheet", async ({ page }) => {
  await page.goto("/");
  const tabs = page.getByTestId("tab-bar");
  await expect(tabs).toBeVisible();
  expect((await tabs.boundingBox())!.height).toBeGreaterThanOrEqual(64);
  await tabs.getByRole("link", { name: "Learn" }).click();
  await expect(page).toHaveURL(/\/learn/);
  await tabs.getByTestId("tab-more").click();
  const sheet = page.getByTestId("more-sheet");
  await expect(sheet.getByRole("link", { name: /WhatsApp/ })).toBeVisible();
  await expect(sheet.getByRole("link", { name: /Call/ })).toBeVisible();
  await sheet.getByRole("link", { name: "Compare" }).click();
  await expect(page).toHaveURL(/\/compare/);
  await expect(sheet).toBeHidden();
});

test("product page on phones: bottom bar with quantity stepper adds to the enquiry", async ({ page, request }) => {
  const cat = await (await request.get("/api/catalogue")).json();
  await page.goto(`/products/${cat.products[0].slug}`);
  const bar = page.getByTestId("sticky-buy-bar");
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Increase quantity" }).click();
  await expect(bar.getByTestId("bar-qty")).toHaveValue("2");
  await bar.getByRole("button", { name: "Add to enquiry" }).click();
  await expect(page.getByTestId("tab-basket-count")).toHaveText("1"); // badge counts products, not units
  await expect(bar.getByRole("link", { name: "Enquire on WhatsApp" })).toHaveAttribute("href", /wa.me|whatsapp/);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

// Small phones (360 px) with someone signed in: the header (name pill, basket, menu) must still fit.
test.describe("360 px phone, signed in", () => {
  test.use({ viewport: { width: 360, height: 760 } });
  for (const path of ["/", "/products", "/admin/products/new", "/admin/quotations/new"]) {
    test(`no horizontal overflow at 360 px: ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    });
  }
});

// Admin lists on phones are cards: nothing hidden in a sideways-scrolling box (price, status, edit visible).
for (const path of ["/admin/products", "/admin/prices", "/admin/customers", "/admin/users"]) {
  test(`admin list shows everything without sideways scrolling: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const hidden = await page.evaluate(() =>
      [...document.querySelectorAll("main *")].filter((el) => {
        const o = getComputedStyle(el).overflowX;
        return (o === "auto" || o === "scroll") && el.scrollWidth > el.clientWidth + 2 && !el.closest('nav[aria-label="Admin"]') && !String(el.className).includes("scrollbar-none");
      }).length,
    );
    expect(hidden).toBe(0);
    const firstRow = page.locator("table.rtable tbody tr").first();
    const box = await firstRow.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  });
}

// Pages must actually render (a blank page passes width checks): heading visible, no script errors.
for (const path of ["/", "/products", "/products/anchor-ino-residential-single-phase-pv-inverter-5ktlx", "/enquiry", "/account"]) {
  test(`renders without script errors: ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && /Content Security Policy|Uncaught|preamble/i.test(m.text()) && errors.push(m.text()));
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("home catalogue is a swipeable card carousel on phones; dots move between categories", async ({ page }) => {
  await page.goto("/");
  const cards = page.getByTestId("catalogue-cards");
  await cards.scrollIntoViewIfNeeded();
  await expect(cards.getByTestId("catalogue-card").first()).toBeVisible();
  const dots = cards.getByRole("tab");
  await expect(dots.first()).toHaveAttribute("aria-selected", "true");
  await dots.nth(1).click();
  await expect(dots.nth(1)).toHaveAttribute("aria-selected", "true");
  // the desktop rail is not shown on phones
  await expect(page.locator('[role="tablist"][aria-label="Product categories"]')).toBeHidden();
});

// Very small phones (Galaxy Fold folded ≈ 280 px): header buttons stay on screen, nothing overflows.
test.describe("280 px phone", () => {
  test.use({ viewport: { width: 280, height: 640 }, isMobile: false });
  for (const path of ["/", "/products", "/products/anchor-ino-residential-single-phase-pv-inverter-5ktlx", "/solar-tools", "/in-the-field", "/account", "/admin/products", "/admin/quotations/new"]) {
    test(`fits at 280 px: ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(280);
      const more = page.getByTestId(path.startsWith("/admin") ? "admin-tab-more" : "tab-more");
      const box = await more.boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(280);
    });
  }
});

test("compact phone footer: link groups collapsed, under one screen, links still in the HTML", async ({ page }) => {
  await page.goto("/contact");
  const footer = page.getByTestId("mobile-footer");
  await footer.scrollIntoViewIfNeeded();
  expect((await footer.boundingBox())!.height).toBeLessThan(page.viewportSize()!.height);
  const privacy = footer.getByRole("link", { name: "Privacy policy", includeHidden: true });
  await expect(privacy).toBeHidden();
  expect(await privacy.count()).toBe(1); // collapsed, not removed
  await footer.getByText("Legal").click();
  await expect(privacy).toBeVisible();
});

test("admin on phones: own top bar, tabs and More sheet; no public header, footer or tab bar", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByTestId("admin-topbar")).toBeVisible();
  await expect(page.getByTestId("admin-tab-bar")).toBeVisible();
  await expect(page.getByTestId("tab-bar")).toHaveCount(0);
  await expect(page.getByTestId("mobile-footer")).toHaveCount(0);
  await expect(page.locator("header").first()).toBeHidden();
  await expect(page.locator('nav[aria-label="Admin"]')).toBeHidden();
  await page.getByTestId("admin-tab-bar").getByRole("link", { name: /Quotes/ }).click();
  await expect(page).toHaveURL(/\/admin\/quotations/);
  await page.getByTestId("admin-tab-more").click();
  const sheet = page.getByTestId("admin-more-sheet");
  await expect(sheet.getByRole("link", { name: "Staff", exact: true })).toBeVisible(); // owner only
  await sheet.getByRole("link", { name: "Prices" }).click();
  await expect(page).toHaveURL(/\/admin\/prices/);
  await expect(page.getByTestId("admin-topbar")).toContainText("Prices");
});

// Every route at four phone widths: the page itself never scrolls sideways.
const ALL_ROUTES = ["/", "/products", "/compare", "/enquiry", "/learn", "/learn/how-solar-cells-work", "/solar-tools/consumption", "/solar-tools/sizing", "/solar-tools/roof", "/solar-tools/kit-builder", "/solar-tools/battery", "/solar-tools/losses", "/solar-tools/orientation", "/solar-tools/system-explorer", "/solar-tools/datasheet-decoder", "/in-the-field", "/contact", "/faq", "/account", "/privacy", "/terms", "/solar-panels-chennai", "/no-such-page", "/admin", "/admin/prices", "/admin/products", "/admin/products/new", "/admin/catalogue", "/admin/field-photos", "/admin/enquiries", "/admin/quotations", "/admin/quotations/new", "/admin/customers", "/admin/settings", "/admin/users", "/admin/performance", "/admin/bonus", "/admin/my-bonus"];
for (const width of [280, 360, 390, 430]) {
  test.describe(`${width} px, every route`, () => {
    test.use({ viewport: { width, height: 800 } });
    test(`no horizontal overflow at ${width} px`, async ({ page, request }) => {
      test.setTimeout(5 * 60_000);
      // read slugs/ids from the live catalogue: content changes when the admin edits it
      const cat = await (await request.get("/api/catalogue")).json();
      const routes = [...ALL_ROUTES, `/category/${cat.categories[0].slug}`, `/products/${cat.products[0].slug}`, `/admin/products/${cat.products[0].id}`];
      const bad: string[] = [];
      for (const path of routes) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const w = await page.evaluate(() => document.documentElement.scrollWidth);
        if (w > width) bad.push(`${path}: ${w}px`);
      }
      expect(bad).toEqual([]);
    });
  });
}

test("products on phones: compact rows, filter sheet with active-count badge, add from a row", async ({ page }) => {
  await page.goto("/products");
  const rows = page.getByTestId("product-rows").getByTestId("product-row");
  await expect(rows.first()).toBeVisible();
  // about 8-10 rows on the first screen
  const firstScreen = await rows.evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().bottom <= window.innerHeight).length);
  expect(firstScreen).toBeGreaterThanOrEqual(5);
  await page.getByTestId("open-filters").click();
  const sheet = page.getByTestId("filter-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Price: low to high" }).click();
  await sheet.locator('input[type="checkbox"]').first().check();
  await sheet.getByTestId("apply-filters").click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId("open-filters")).toContainText("1");
  await expect(page).toHaveURL(/sort=price-asc/);
  await rows.first().getByTestId("row-add").click();
  await expect(page.getByTestId("tab-basket-count")).toHaveText("1");
});

test("products on phones: list/grid choice is remembered", async ({ page }) => {
  await page.goto("/products");
  await page.getByTestId("m-view-toggle").click();
  await expect(page.getByTestId("product-tiles")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("product-tiles")).toBeVisible();
  await page.getByTestId("m-view-toggle").click();
  await expect(page.getByTestId("product-rows")).toBeVisible();
});

test("search on phones is full screen with recent searches", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("m-open-search").click();
  const input = page.getByTestId("palette-input");
  await input.fill("inverter");
  await page.getByRole("button", { name: /See all results/ }).click();
  await expect(page).toHaveURL(/q=inverter/);
  await page.getByTestId("m-open-search").click();
  await expect(page.getByTestId("recent-searches")).toContainText("inverter");
  const box = await page.getByRole("dialog").boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 2);
});

test("product page tabs on phones: specs, datasheet full screen; all sections stay in the HTML", async ({ page, request }) => {
  const cat = await (await request.get("/api/catalogue")).json();
  const p = cat.products.find((x: { datasheet: string | null; specs: unknown[] }) => x.datasheet && x.specs.length);
  await page.goto(`/products/${p.slug}`);
  const tabs = page.getByTestId("product-tabs");
  // the specs section is in the page (waits for it to load) but hidden behind its tab
  await expect(page.getByRole("heading", { name: "Technical specifications", includeHidden: true })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Technical specifications" })).toBeHidden();
  await tabs.getByRole("tab", { name: "Specs" }).click();
  await expect(page.getByRole("heading", { name: "Technical specifications" })).toBeVisible();
  await tabs.getByRole("tab", { name: "Datasheet" }).click();
  await page.getByTestId("m-open-datasheet").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  expect((await dialog.boundingBox())!.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 2);
});

test("compare on phones: two products at a time, swipe to the next pair, differences only", async ({ page, request }) => {
  const cat = await (await request.get("/api/catalogue")).json();
  const ids = cat.products.slice(0, 3).map((x: { id: number }) => x.id);
  await page.addInitScript((v) => localStorage.setItem("verdi.compare.v1", JSON.stringify(v)), ids);
  await page.goto("/compare");
  const mc = page.getByTestId("mobile-compare");
  await expect(mc.getByTestId("compare-head")).toHaveCount(2);
  await expect(mc.getByTestId("compare-position")).toHaveText("1–2 of 3");
  const box = (await mc.boundingBox())!;
  const y = box.y + 200;
  await page.touchscreen.tap(box.x + 5, y); // focus
  await mc.dispatchEvent("touchstart", { touches: [{ identifier: 1, clientX: 300, clientY: y }] });
  await mc.dispatchEvent("touchend", { changedTouches: [{ identifier: 1, clientX: 150, clientY: y }] });
  await expect(mc.getByTestId("compare-position")).toHaveText("2–3 of 3");
  const all = await mc.getByTestId("compare-row").count();
  await page.getByLabel("Show differences only").check();
  expect(await mc.getByTestId("compare-row").count()).toBeLessThanOrEqual(all);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
});

test("enquiry basket on phones: stepper, swipe to remove, WhatsApp message in a bottom sheet", async ({ page, request }) => {
  const cat = await (await request.get("/api/catalogue")).json();
  const lines = cat.products.slice(0, 2).map((p: { id: number; price: { sellingPaise: number | null } }) => ({ productId: p.id, quantity: 1, seenSellingPaise: p.price.sellingPaise }));
  await page.addInitScript((v) => localStorage.setItem("verdi.enquiry.v1", JSON.stringify(v)), lines);
  await page.goto("/enquiry");
  const rows = page.getByTestId("basket-line");
  await expect(rows).toHaveCount(2);
  await rows.first().getByRole("button", { name: "Increase quantity" }).click();
  await expect(rows.first().getByRole("textbox")).toHaveValue("2");
  // swipe the second row left to remove it
  const box = (await rows.nth(1).boundingBox())!;
  const y = box.y + box.height / 2;
  await rows.nth(1).dispatchEvent("touchstart", { touches: [{ identifier: 1, clientX: box.x + box.width - 10, clientY: y }] });
  await rows.nth(1).dispatchEvent("touchmove", { touches: [{ identifier: 1, clientX: box.x + 20, clientY: y }] });
  await rows.nth(1).dispatchEvent("touchend", { changedTouches: [{ identifier: 1, clientX: box.x + 20, clientY: y }] });
  await expect(rows).toHaveCount(1);
  await page.locator("#f-name").fill("Test Buyer");
  await page.locator("#f-mobile").fill("9876543210");
  await page.locator("#f-location").fill("Chennai");
  await page.getByTestId("m-send").click();
  const sheet = page.getByTestId("preview-sheet");
  await expect(sheet.getByTestId("m-message-preview")).toContainText("Test Buyer");
  await expect(sheet.getByTestId("m-open-whatsapp")).toBeVisible();
  await expect(sheet.getByTestId("m-copy-message")).toBeVisible();
});

test("account on phones: profile card with points and Enquiries / Rewards / Profile tabs", async ({ page }) => {
  const r = await page.request.post("/api/account/login", { headers: { Origin: new URL(page.url() === "about:blank" ? "http://localhost:5173" : page.url()).origin }, data: { login: "9000000002", password: "Customer@12345" } });
  expect(r.ok()).toBeTruthy();
  await page.goto("/account");
  await expect(page.getByTestId("points-chip")).toBeVisible();
  const tabs = page.getByTestId("account-tabs");
  await tabs.getByRole("tab", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { name: "Profile" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enquiry history" })).toBeHidden();
  await tabs.getByRole("tab", { name: "Rewards" }).click();
  await expect(page.getByRole("heading", { name: "Profile" })).toBeHidden();
});

test("admin dashboard on phones: needs-attention list first, count tiles, quick actions", async ({ page }) => {
  await page.goto("/admin");
  const d = page.getByTestId("phone-dashboard");
  await expect(d).toBeVisible();
  await expect(d.getByRole("heading", { name: "Needs attention" })).toBeVisible();
  await expect(d.getByRole("link", { name: /Active products/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Products by category" })).toBeHidden();
});

test("quick price sheet on phones: Save & next moves to the next product", async ({ page }) => {
  await page.goto("/admin/prices");
  const rows = page.getByTestId("admin-price-row");
  await expect(rows.first()).toBeVisible();
  await rows.first().getByRole("button", { name: /Edit price/ }).click();
  const sheet = page.getByTestId("price-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("missing-count")).toContainText("missing a price");
  const first = await sheet.getByRole("heading").first().textContent();
  await expect(sheet.getByTestId("sheet-price-input")).toHaveAttribute("inputmode", "decimal");
  await sheet.getByTestId("sheet-save-next").click(); // saves the unchanged values, then moves on
  await expect(sheet.getByRole("heading").first()).not.toHaveText(first ?? "");
});

test("admin product editor on phones: section tabs and a sticky save bar with unsaved count", async ({ page }) => {
  await page.goto("/admin/products/new");
  const tabs = page.getByTestId("editor-tabs");
  await expect(tabs).toBeVisible();
  await expect(tabs.getByTestId("tab-dot").first()).toBeVisible(); // empty product: details need attention
  const bar = page.getByTestId("editor-save-bar");
  await expect(bar).toContainText("All changes saved");
  await page.locator("#pe-sku").fill("VS-TEST-PHONE");
  await expect(bar).toContainText("unsaved");
  await tabs.getByTestId("editor-tab-specs").click();
  await expect(page.getByRole("heading", { name: "Specifications" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Product details" })).toBeHidden();
});

test("staff log an enquiry from the phone dashboard in a full-screen sheet", async ({ page }) => {
  const name = `Phone Sheet ${Date.now().toString().slice(-6)}`;
  await page.goto("/admin");
  await page.getByTestId("m-log-enquiry").click();
  const sheet = page.getByTestId("log-enquiry");
  await expect(sheet).toBeVisible();
  expect((await sheet.boundingBox())!.height).toBeGreaterThanOrEqual(page.viewportSize()!.height - 2);
  await expect(sheet.locator("#le-mobile")).toHaveAttribute("inputmode", "tel");
  await sheet.locator("#le-name").fill(name);
  await sheet.locator("#le-mobile").fill("9876505678");
  await sheet.locator("#le-location").fill("Madurai");
  await sheet.getByTestId("le-save").click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId("admin-enquiry").filter({ hasText: name })).toBeVisible();
  await page.goto("/admin/performance");
  await expect(page.getByTestId("leaderboard-cards")).toBeVisible(); // phones: one card per staff member
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("lists are paged on phones: 5 / 10 / 20 / All, remembered, next page", async ({ page }) => {
  await page.goto("/products");
  const rows = page.getByTestId("product-rows").getByTestId("product-row");
  const pager = page.getByTestId("pager");
  await expect(pager).toBeVisible();
  await pager.getByTestId("page-size-5").click();
  await expect(rows).toHaveCount(5);
  await expect(page.getByTestId("pager-range")).toHaveText(/^1–5 of \d+/);
  await pager.getByTestId("page-next").click();
  await expect(page.getByTestId("pager-range")).toHaveText(/^6–10 of/);
  await page.reload();
  await expect(rows).toHaveCount(5); // page size remembered
  await page.getByTestId("pager").getByTestId("page-size-all").click();
  expect(await rows.count()).toBeGreaterThan(10);
  for (const s of [{ width: 280 }, { width: 390 }]) {
    await page.setViewportSize({ width: s.width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(s.width);
  }
  await page.getByTestId("pager").getByTestId("page-size-10").click();
});

test("phone: the helper opens as a sheet, fits the screen and sits above the product page's buy bar", async ({ page, request }) => {
  const cat = await (await request.get("/api/catalogue")).json();
  const p = cat.products[0];
  await page.goto(`/products/${p.slug}`);
  const fab = page.getByTestId("customer-helper-open");
  const bar = page.getByTestId("sticky-buy-bar");
  await expect(fab).toBeVisible();
  await expect(bar).toBeVisible();
  const f = (await fab.boundingBox())!;
  const b = (await bar.boundingBox())!;
  expect(f.y + f.height).toBeLessThanOrEqual(b.y); // never covers the buy bar
  await fab.click();
  const panel = page.getByTestId("customer-helper");
  await expect(panel).toBeVisible();
  await page.getByTestId("helper-input").fill("offers");
  await page.keyboard.press("Enter");
  await expect(panel.getByTestId("helper-bot")).toHaveCount(2);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByTestId("helper-minimise").click();
  await expect(panel).toBeHidden();
});

test("staff bonus on phones: tabs, one short row per staff member, details in a sheet", async ({ page }) => {
  await page.goto("/admin/bonus");
  const tabs = page.getByTestId("bonus-tabs").getByRole("tab");
  await expect(tabs).toHaveCount(3);
  const rows = page.getByTestId("bonus-staff-open");
  if ((await rows.count()) === 0) return; // no staff yet: nothing more to check
  const box = await page.getByTestId("bonus-staff").locator("li").first().boundingBox();
  expect(box!.height).toBeLessThan(110); // a compact row, not a tall card
  await rows.first().click();
  const sheet = page.getByTestId("bonus-staff-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByText("See their bonuses").click();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: /^Bonuses ·/ })).toBeVisible();
});

test("phones: text boxes and dropdowns use 16 px text, so iPhone Safari never zooms in on tap", async ({ page }) => {
  for (const path of ["/products", "/admin/products", "/admin/quotations", "/admin/performance", "/enquiry"]) {
    await page.goto(path);
    await page.locator("h1").first().waitFor({ timeout: 15_000 });
    await page.waitForTimeout(800);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll("input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), select, textarea")]
        .filter((e) => e.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(e).fontSize) < 16)
        .map((e) => e.outerHTML.slice(0, 80)),
    );
    expect(small, `${path}: controls under 16 px make iPhones zoom`).toEqual([]);
  }
});
