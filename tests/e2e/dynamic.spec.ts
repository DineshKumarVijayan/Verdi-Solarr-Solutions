import { expect, test } from "@playwright/test";

// The whole site follows the admin's catalogue: a category and product created after the build (with a
// different name than the seed's, e.g. "Solar Modules") appear for visitors, search engines, link previews,
// the sitemap and the tools; once deleted they answer 404 (noindex) and leave the sitemap.

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const H = { Origin: BASE, "Content-Type": "application/json" };
const RUN = Date.now().toString(36);

test("a catalogue rebuilt in the admin is what visitors, search engines and the sitemap see", async ({ request, page }) => {
  const catSlug = `e2e-solar-modules-${RUN}`;
  const prodSlug = `e2e-live-module-${RUN}`;
  const brands = (await (await request.get("/api/admin/brands")).json()).brands as { id: number }[];
  const cat = (await (await request.post("/api/admin/categories", { headers: H, data: { name: `Solar Modules ${RUN}`, slug: catSlug, description: "Modules added after the build." } })).json()).categories.find((c: { slug: string }) => c.slug === catSlug);
  const created = await request.post("/api/admin/products", {
    headers: H,
    data: {
      sku: `E2E-LIVE-${RUN}`,
      slug: prodSlug,
      name: `Live Module 600 Wp ${RUN}`,
      brandId: brands[0].id,
      categoryId: cat.id,
      short: "Added after the build",
      specs: [{ key: "power_wp", label: "Maximum power", value: "600", unit: "Wp", group: "Electrical" }],
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const productId = (await created.json()).product?.id ?? (await created.json()).id;

  // search engines / link previews: live title, tags and readable content
  const catHtml = await (await request.get(`/category/${catSlug}`)).text();
  expect(catHtml).toContain(`<title>Solar Modules ${RUN} — products &amp; prices | VERDI SOLARR SOLUTION</title>`);
  expect(catHtml).toContain(`/products/${prodSlug}`);
  const prodRes = await request.get(`/products/${prodSlug}`);
  expect(prodRes.status()).toBe(200);
  const prodHtml = await prodRes.text();
  expect(prodHtml).toContain(`Live Module 600 Wp ${RUN}`);
  expect(prodHtml).toContain('"@type":"Product"');
  expect(prodHtml).toContain("<td>600 Wp</td>");
  expect(await (await request.get("/")).text()).toContain(`/category/${catSlug}`);
  expect(await (await request.get("/products")).text()).toContain(`/products/${prodSlug}`);
  const map = await (await request.get("/sitemap.xml")).text();
  expect(map).toContain(`/category/${catSlug}</loc>`);
  expect(map).toContain(`/products/${prodSlug}</loc>`);

  // visitors: the home catalogue section and the category page show it; a renamed "modules" category
  // is still recognised as panels (kit builder lists the module)
  await page.goto(`/category/${catSlug}`);
  await expect(page.getByText(`Live Module 600 Wp ${RUN}`).first()).toBeVisible();
  await page.goto("/solar-tools/kit-builder");
  await expect(page.locator("#kb-mod option", { hasText: `Live Module 600 Wp ${RUN}` })).toHaveCount(1);

  // deleted: 404 + noindex, gone from the sitemap and from the crawler text
  expect((await request.delete(`/api/admin/products/${productId}`, { headers: H })).ok()).toBeTruthy();
  expect((await request.delete(`/api/admin/categories/${cat.id}`, { headers: H })).ok()).toBeTruthy();
  const gone = await request.get(`/products/${prodSlug}`);
  expect(gone.status()).toBe(404);
  expect(await gone.text()).toContain('name="robots" content="noindex, nofollow"');
  expect((await request.get(`/category/${catSlug}`)).status()).toBe(404);
  const map2 = await (await request.get("/sitemap.xml")).text();
  expect(map2).not.toContain(prodSlug);
  expect(map2).not.toContain(catSlug);
});

test("home page figures are real counts (never placeholders) and the catalogue section uses the products' own photos", async ({ page, request }) => {
  const cat = await (await request.get("/api/catalogue")).json();
  await page.goto("/");
  // the figure counts up to the real number of products (no placeholder numbers while loading)
  const stat = page.locator("dt", { hasText: "Product models" }).locator("..");
  await stat.scrollIntoViewIfNeeded();
  await expect(stat).toContainText(String(cat.products.length), { timeout: 10_000 });
  // no bundled stock photos in the catalogue section: images come from product media
  const srcs = await page.locator("section img").evaluateAll((els) => els.map((e) => (e as HTMLImageElement).getAttribute("src") ?? ""));
  const productImages = new Set(cat.products.flatMap((p: { images: { url: string }[] }) => p.images.map((i) => i.url)));
  const showcase = srcs.filter((s) => s.startsWith("/images/products/") || s.startsWith("/api/media/"));
  expect(showcase.every((s) => productImages.has(s))).toBeTruthy();
});

test("product cards keep share and compare together on one line, also after 'Add to enquiry'", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/products");
  const cards = page.locator("article", { has: page.getByTestId("add-to-enquiry") });
  await cards.first().getByTestId("add-to-enquiry").click();
  await expect(cards.first().getByTestId("add-to-enquiry")).toContainText("Add another");
  for (let i = 0; i < 3; i++) {
    const icons = cards.nth(i).getByTestId("card-icons").locator("button");
    const [a, b] = [await icons.nth(0).boundingBox(), await icons.nth(1).boundingBox()];
    expect(Math.abs(a!.y - b!.y)).toBeLessThan(2); // same line
  }
});
