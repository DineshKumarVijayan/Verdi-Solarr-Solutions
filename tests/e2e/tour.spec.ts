import { expect, test } from "@playwright/test";

// First-visit admin tour: shows once, can be skipped at the start or in the middle, never returns by
// itself after that, and "Take the tour" replays it. (Automated browsers only get it when asked.)

test("admin tour: first visit, skip at any step, replay from the header", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("verdi.tour", JSON.stringify("on")));
  // start as a first-time visitor (once: a reload must keep the "seen" mark)
  await page.addInitScript(() => {
    if (sessionStorage.getItem("tour-test")) return;
    sessionStorage.setItem("tour-test", "1");
    Object.keys(localStorage).filter((k) => k.startsWith("verdi.tour.v1.")).forEach((k) => localStorage.removeItem(k));
  });
  await page.goto("/admin");
  const tour = page.getByTestId("admin-tour");
  await expect(tour).toBeVisible();
  await expect(tour).toContainText("Welcome");

  // walk two steps, then skip in the middle
  await page.getByTestId("tour-next").click();
  await expect(page.locator("#tour-title")).toHaveText("My day");
  await page.getByTestId("tour-next").click();
  await page.getByTestId("tour-skip").click();
  await expect(tour).toHaveCount(0);

  // the page is usable again, and the tour does not come back on its own
  await page.reload();
  await page.waitForTimeout(1500);
  await expect(tour).toHaveCount(0);

  // replay from the header; Escape closes it
  await page.getByTestId("admin-tour-start").click();
  await expect(tour).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tour).toHaveCount(0);
});
