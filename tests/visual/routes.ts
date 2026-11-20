import type { Page } from "@playwright/test";

// Every route checked by the desktop-baseline lock and the mobile metrics.
// "who": which session the page needs. "setup": localStorage state (basket / compare).
export type Who = "public" | "customer" | "admin";
export interface RouteSpec { name: string; path: string; who: Who; basket?: boolean; compare?: boolean }

export const OWNER = { login: "9000000001", password: "Owner@12345" };
export const CUSTOMER = { login: "9000000002", password: "Customer@12345" };

const TOOLS = ["consumption", "sizing", "roof", "kit-builder", "battery", "losses", "orientation", "system-explorer", "datasheet-decoder"];

export function routes(c: { productSlug: string; categorySlug: string; lessonSlug: string; productId: number; quotationId?: number }): RouteSpec[] {
  const pub = (name: string, path: string, extra: Partial<RouteSpec> = {}): RouteSpec => ({ name, path, who: "public", ...extra });
  const adm = (name: string, path: string): RouteSpec => ({ name, path, who: "admin" });
  return [
    pub("home", "/"),
    pub("products", "/products"),
    pub("category", `/category/${c.categorySlug}`),
    pub("product-detail", `/products/${c.productSlug}`),
    pub("compare", "/compare", { compare: true }),
    pub("enquiry", "/enquiry", { basket: true }),
    pub("learn", "/learn"),
    pub("learn-lesson", `/learn/${c.lessonSlug}`),
    ...TOOLS.map((t) => pub(`tool-${t}`, `/solar-tools/${t}`)),
    pub("in-the-field", "/in-the-field"),
    pub("contact", "/contact"),
    pub("account-signed-out", "/account"),
    { name: "account-signed-in", path: "/account", who: "customer" },
    pub("privacy", "/privacy"),
    pub("terms", "/terms"),
    pub("location", "/solar-panels-chennai"),
    pub("not-found", "/this-page-does-not-exist"),
    adm("admin-dashboard", "/admin"),
    adm("admin-prices", "/admin/prices"),
    adm("admin-products", "/admin/products"),
    adm("admin-product-new", "/admin/products/new"),
    adm("admin-product-edit", `/admin/products/${c.productId}`),
    adm("admin-catalogue", "/admin/catalogue"),
    adm("admin-field-photos", "/admin/field-photos"),
    adm("admin-enquiries", "/admin/enquiries"),
    adm("admin-quotations", "/admin/quotations"),
    ...(c.quotationId ? [adm("admin-quotation-detail", `/admin/quotations/${c.quotationId}`)] : []),
    adm("admin-customers", "/admin/customers"),
    adm("admin-settings", "/admin/settings"),
    adm("admin-users", "/admin/users"),
  ];
}

/** Reads real ids/slugs from the local catalogue so nothing is hard-coded. */
export async function context(page: Page) {
  const cat = await (await page.request.get("/api/catalogue")).json();
  const lessons = (await import("../../data/lessons.json", { with: { type: "json" } })).default as { lessons: { slug: string }[] };
  const p = cat.products[0];
  const category = cat.categories.find((x: { id: number }) => x.id === p.categoryId) ?? cat.categories[0];
  return {
    productSlug: p.slug as string,
    productId: p.id as number,
    categorySlug: category.slug as string,
    lessonSlug: lessons.lessons[0].slug,
    twoIds: [cat.products[0].id, cat.products[1].id] as number[],
  };
}

export async function signIn(page: Page, who: Who, base: string) {
  if (who === "public") return;
  const [url, cred] = who === "admin" ? ["/api/admin/login", OWNER] : ["/api/account/login", CUSTOMER];
  const r = await page.request.post(url, { headers: { Origin: base }, data: cred });
  if (!r.ok()) throw new Error(`${who} sign-in failed: ${r.status()}`);
}

export async function seedStorage(page: Page, r: RouteSpec, ids: number[]) {
  const basket = r.basket ? ids.map((productId) => ({ productId, quantity: 2, seenSellingPaise: null })) : null;
  const compare = r.compare ? ids : null;
  await page.addInitScript(([b, c]) => {
    if (b) localStorage.setItem("verdi.enquiry.v1", JSON.stringify(b));
    if (c) localStorage.setItem("verdi.compare.v1", JSON.stringify(c));
  }, [basket, compare] as const);
}

/** Fake clock fixed at one instant, so rotating hero words, carousels, looping Motion
 *  animations and "time ago" text are identical on every run. Call before goto. */
export const FIXED_TIME = new Date("2026-11-20T10:00:00+05:30");
export async function freezeClock(page: Page) {
  await page.clock.install({ time: FIXED_TIME });
  await page.clock.pauseAt(new Date(FIXED_TIME.getTime() + 1000));
}

const realWait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Settles the page: network quiet, lazy images loaded, in-view animations finished, back at top.
 *  Total fake time advanced stays under 3.2 s, so the home hero (3.2 s) and catalogue (5.2 s)
 *  rotations never fire: every run captures the same first frame. */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.clock.runFor(1200);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = (page.viewportSize()?.height ?? 800) * 0.8;
  for (let y = 0; y < height; y += step) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await realWait(120); // let IntersectionObserver / lazy loading react (real time, fake clock still)
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await realWait(150);
  await page.waitForLoadState("networkidle");
  await Promise.race([
    page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => (i.complete ? null : i.decode().catch(() => null))));
    }),
    realWait(8000),
  ]);
  await page.clock.runFor(1500);
  await page.mouse.move(0, 0);
  // Server timestamps (last sign-in, activity) change on every run: normalise the text, keep the layout.
  await page.evaluate(() => {
    const re = /\b\d{1,2} [A-Z][a-z]{2} \d{4}(, \d{1,2}:\d{2}( ?[ap]m)?)?|\b\d+ (seconds?|minutes?|hours?|days?) ago\b|\bjust now\b/g;
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue && (re.lastIndex = 0, re.test(n.nodeValue))) n.nodeValue = n.nodeValue.replace(re, "01 Jan 2026, 0:00 am");
  });
}
