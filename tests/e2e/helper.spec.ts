import { expect, test, type BrowserContext } from "@playwright/test";

// Website helper (read only, public data only), staff helper (own data, role rules) and the owner's
// questions & answers (Admin → Settings → /faq page, helper answers, live FAQ structured data).

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const H = { Origin: BASE, "Content-Type": "application/json" };
const TAG = Date.now().toString(36);

test.describe.configure({ mode: "serial" });

test("owner writes a question & answer; it shows on /faq, in search-engine data and in the website helper", async ({ page, request, browser, playwright }) => {
  await page.goto("/admin/settings#faqs");
  await page.getByTestId("faq-add").click();
  await page.getByLabel("Topic").fill("Delivery");
  await page.getByTestId("faq-question").fill(`Do you deliver to Hosur ${TAG}?`);
  await page.getByTestId("faq-answer").fill(`Yes, we deliver to Hosur ${TAG}.`);
  await page.getByText("Tamil version (optional)").click();
  await page.getByTestId("faq-question-ta").fill(`ஓசூருக்கு டெலிவரி உண்டா ${TAG}?`);
  await page.getByTestId("faq-answer-ta").fill(`ஆம், ஓசூருக்கு டெலிவரி செய்கிறோம் ${TAG}.`);
  await page.getByTestId("faq-save").click();
  await expect(page.getByTestId("faq-row").filter({ hasText: TAG })).toBeVisible();
  // the owner can try how a customer might ask
  await page.getByTestId("faq-try").fill(`deliver hosur ${TAG}`);
  await expect(page.getByTestId("faq-try-result")).toContainText(`Hosur ${TAG}`);

  const faqs = (await (await request.get("/api/admin/faqs")).json()).faqs as { id: number; question: string }[];
  const faq = faqs.find((f) => f.question.includes(TAG))!;

  // live FAQ page for search engines
  const html = await (await request.get("/faq")).text();
  expect(html).toContain('"@type":"FAQPage"');
  expect(html).toContain(`Do you deliver to Hosur ${TAG}?`);

  // public page, English and Tamil (a fresh visitor)
  const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const v = await visitor.newPage();
  await v.goto("/faq");
  const item = v.getByTestId("faq-item").filter({ hasText: TAG });
  await item.click();
  await expect(item).toContainText(`Yes, we deliver to Hosur ${TAG}.`);
  await v.getByTestId("faq-lang-ta").click();
  await expect(v.getByTestId("faq-item").filter({ hasText: TAG })).toContainText("ஓசூருக்கு");

  // the helper answers with it (in Tamil now, the language the visitor chose)
  await v.getByTestId("faq-ask").click();
  await expect(v.getByTestId("customer-helper")).toBeVisible();
  await v.getByTestId("helper-input").fill(`ஓசூருக்கு டெலிவரி ${TAG}`);
  await v.getByTestId("helper-send").click();
  await expect(v.getByTestId("helper-bot").last()).toContainText(`ஓசூருக்கு டெலிவரி செய்கிறோம் ${TAG}`);
  await visitor.close();

  // signed-out visitors cannot change questions & answers
  const ctxNoAuth = await playwright.request.newContext({ baseURL: BASE, storageState: { cookies: [], origins: [] } });
  expect((await ctxNoAuth.post("/api/admin/faqs", { headers: H, data: { topic: "X", question: "Hello there?", answer: "No" } })).status()).toBe(401);
  await ctxNoAuth.dispose();

  // hide, then delete (in-app confirmation)
  expect((await request.delete(`/api/admin/faqs/${faq.id}`, { headers: H })).ok()).toBeTruthy();
  expect(await (await request.get("/faq")).text()).not.toContain(TAG);
});

async function visitorContext(browser: import("@playwright/test").Browser): Promise<BrowserContext> {
  return browser.newContext({ storageState: { cookies: [], origins: [] } });
}

test("website helper answers from the live catalogue and contact details, never calls admin APIs, and only reads", async ({ browser, request }) => {
  const cat = await (await request.get("/api/catalogue")).json();
  const p = cat.products.find((x: { price: { sellingPaise: number | null } }) => x.price.sellingPaise !== null);
  const ctx = await visitorContext(browser);
  const page = await ctx.newPage();
  const calls: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/") && u.pathname !== "/api/catalogue") calls.push(`${r.method()} ${u.pathname}`);
  });
  await page.goto("/");
  await page.getByTestId("customer-helper-open").click();
  const panel = page.getByTestId("customer-helper");
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId("helper-chip").first()).toBeVisible();

  // a product price
  await page.getByTestId("helper-input").fill(`price of ${p.name}`);
  await page.getByTestId("helper-send").click();
  await expect(panel.getByTestId("helper-typing")).toBeHidden();
  const card = panel.getByTestId("helper-product").filter({ hasText: p.name }).first();
  await expect(card).toBeVisible();
  // adding to the enquiry list is the visitor's own action (stored in their browser)
  await card.getByTestId("helper-add").click();
  await expect(card.getByTestId("helper-add")).toContainText("In enquiry");

  // contact details from Admin → Settings
  await page.getByTestId("helper-input").fill("what is your phone number");
  await page.keyboard.press("Enter");
  await expect(panel.getByTestId("helper-bot").last()).toContainText("call us");

  // something it does not know: honest, with real ways to reach the business
  await page.getByTestId("helper-input").fill("can you repair my washing machine");
  await page.keyboard.press("Enter");
  const miss = panel.locator('[data-testid="helper-bot"][data-miss="1"]').last();
  await expect(miss).toBeVisible();
  await expect(miss.getByTestId("helper-link").first()).toHaveAttribute("href", /wa\.me/);

  // Tamil
  await page.getByTestId("helper-lang-ta").click();
  await expect(panel.getByTestId("helper-bot").first()).toContainText("வணக்கம்");

  // the welcome options stay in the conversation (scroll up and pick another)
  await expect(panel.getByTestId("helper-bot").first().getByTestId("helper-chip").first()).toBeAttached();
  const said = await panel.getByTestId("helper-bot").count();
  // Escape (and the minimise button) only minimise: the conversation is still there when reopened
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await page.getByTestId("customer-helper-open").click();
  await expect(panel.getByTestId("helper-bot")).toHaveCount(said);
  await page.getByTestId("helper-minimise").click();
  await expect(panel).toBeHidden();
  await page.getByTestId("customer-helper-open").click();
  await expect(panel.getByTestId("helper-bot")).toHaveCount(said);
  // End chat clears it: the next opening starts afresh
  await page.getByTestId("helper-end").click();
  await expect(panel).toBeHidden();
  await page.getByTestId("customer-helper-open").click();
  await expect(panel.getByTestId("helper-bot")).toHaveCount(1);
  await expect(panel.getByTestId("helper-me")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  expect(calls.filter((c) => !c.startsWith("GET "))).toEqual([]);
  expect(calls.filter((c) => c.includes("/api/admin/"))).toEqual([]);
  await ctx.close();
});

test("staff helper: sales staff get their own day and pages they may use; owner/admin topics are refused", async ({ browser, request }) => {
  const mobile = `7${String(Date.now()).slice(-9)}`;
  const made = await request.post("/api/admin/users", { headers: H, data: { email: "", mobile, password: "Temp@12345", displayName: "Helper Staff", role: "viewer", isActive: true } });
  expect(made.ok()).toBeTruthy();
  const ctx = await visitorContext(browser);
  try {
    expect((await ctx.request.post("/api/admin/password", { headers: H, data: { login: mobile, currentPassword: "Temp@12345", newPassword: "Helper#Pass2026" } })).ok()).toBeTruthy();
    expect((await ctx.request.post("/api/admin/login", { headers: H, data: { login: mobile, password: "Helper#Pass2026" } })).ok()).toBeTruthy();
    // sales staff cannot change questions & answers either
    expect((await ctx.request.post("/api/admin/faqs", { headers: H, data: { topic: "X", question: "Hello there?", answer: "No" } })).status()).toBe(403);
    const page = await ctx.newPage();
    const calls: string[] = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.pathname.startsWith("/api/admin/")) calls.push(`${r.method()} ${u.pathname}`);
    });
    await page.goto("/admin");
    await expect(page.getByTestId("customer-helper-open")).toHaveCount(0); // the website helper is not in the admin
    await page.getByTestId("staff-helper-open").click();
    const panel = page.getByTestId("staff-helper");
    await expect(panel).toBeVisible();
    const before = calls.length;

    const ask = async (q: string) => {
      await page.getByTestId("helper-input").fill(q);
      await page.keyboard.press("Enter");
      await expect(panel.getByTestId("helper-typing")).toBeHidden();
      return panel.getByTestId("helper-bot").last();
    };
    for (const q of ["customer list", "staff performance", "approve bonus", "add staff"]) {
      const a = await ask(q);
      await expect(a, q).toContainText("only available to the owner");
      await expect(a.getByTestId("helper-link"), q).toHaveCount(0);
    }
    // nothing was fetched for those
    expect(calls.slice(before)).toEqual([]);

    // pages they can open but not change, explained in any wording
    await expect(await ask("how do I upload product photos?")).toContainText("only the owner or an admin can change it");
    await expect(await ask("changing price")).toContainText("price editor");

    // own day: the same endpoint as the dashboard
    await ask("my day");
    await expect(panel.getByTestId("helper-myday")).toBeVisible();
    expect(calls.slice(before).length).toBeGreaterThan(0);
    expect(new Set(calls.slice(before))).toEqual(new Set(["GET /api/admin/my-day"]));

    // a new quotation opens prefilled (the person saves it themselves)
    const a = await ask("new quote for Ravi Kumar 98400 12345");
    await a.getByTestId("helper-link").click();
    await expect(page).toHaveURL(/\/admin\/quotations\/new\?name=Ravi\+Kumar&mobile=9840012345/);
    await expect(page.getByTestId("q-name")).toHaveValue("Ravi Kumar");
    expect(calls.filter((c) => !c.startsWith("GET "))).toEqual([]);
  } finally {
    await ctx.close();
    const users = (await (await request.get("/api/admin/users")).json()).users as { id: number; mobile: string; displayName: string; role: string }[];
    const u = users.find((x) => x.mobile?.endsWith(mobile.slice(-10)));
    if (u) await request.put(`/api/admin/users/${u.id}`, { headers: H, data: { email: "", mobile, displayName: u.displayName, role: u.role, isActive: false } });
  }
});

test("one gentle hint per visit on a product page; the helper opens with questions about that product", async ({ browser, request }) => {
  const cat = await (await request.get("/api/catalogue")).json();
  const p = cat.products[0];
  const ctx = await visitorContext(browser);
  await ctx.addInitScript(() => localStorage.setItem("verdi.helper.hints", JSON.stringify("on")));
  const page = await ctx.newPage();
  await page.clock.install();
  await page.goto(`/products/${p.slug}`);
  await expect(page.getByTestId("customer-helper-open")).toBeVisible();
  await page.clock.fastForward(8000);
  const hint = page.getByTestId("helper-hint");
  await expect(hint).toBeVisible();
  await hint.locator("button").first().click();
  const panel = page.getByTestId("customer-helper");
  await expect(panel).toBeVisible();
  await page.clock.runFor(1000);
  await panel.getByTestId("helper-chip").filter({ hasText: "Price" }).click();
  await page.clock.runFor(1000);
  await expect(panel.getByTestId("helper-product").filter({ hasText: p.name }).first()).toBeVisible();
  // dismissed for this visit
  await page.keyboard.press("Escape");
  await page.reload();
  await page.clock.fastForward(9000);
  await expect(page.getByTestId("helper-hint")).toHaveCount(0);
  await ctx.close();
});
