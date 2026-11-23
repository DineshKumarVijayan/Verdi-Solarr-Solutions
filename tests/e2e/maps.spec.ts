import { expect, test } from "@playwright/test";

// The shop's Google Maps link and embedded map: shown on Contact, used by every "Open in Google Maps"
// button, and editable in Settings (link or the whole embed code from Google Maps).

const BASE = process.env.BASE_URL ?? "http://localhost:5173";
const H = { Origin: BASE, "Content-Type": "application/json" };

test("Contact shows the embedded map and every map button opens the shop in Google Maps", async ({ page }) => {
  await page.goto("/contact");
  const map = page.getByTestId("contact-map");
  await expect(map.locator("iframe")).toHaveAttribute("src", /^https:\/\/www\.google\.com\/maps\/embed\?pb=/);
  const link = await page.getByTestId("contact-map-link").getAttribute("href");
  expect(link).toMatch(/^https:\/\/(maps\.app\.goo\.gl|www\.google\.com\/maps)/);
  await expect(page.getByTestId("contact-maps-link")).toHaveAttribute("href", link!);
});

test("Settings: the map link and embed code are checked and saved", async ({ request }) => {
  const before = (await (await request.get("/api/admin/settings")).json()).settings as Record<string, string>;
  const bad = await request.put("/api/admin/settings", { headers: H, data: { settings: { mapsUrl: "https://example.com/where" } } });
  expect(bad.status()).toBe(422);
  const embed = '<iframe src="https://www.google.com/maps/embed?pb=!1m18!test" width="600" height="450" style="border:0;" loading="lazy"></iframe>';
  const ok = await request.put("/api/admin/settings", { headers: H, data: { settings: { mapsUrl: "https://maps.app.goo.gl/testlink123", mapsEmbedUrl: embed } } });
  expect(ok.status()).toBe(200);
  const saved = (await ok.json()).settings as Record<string, string>;
  expect(saved.mapsEmbedUrl).toBe("https://www.google.com/maps/embed?pb=!1m18!test"); // only the link is kept
  // put the previous values back (empty = the built-in defaults)
  await request.put("/api/admin/settings", { headers: H, data: { settings: { mapsUrl: before.mapsUrl ?? "", mapsEmbedUrl: before.mapsEmbedUrl ?? "" } } });
});
