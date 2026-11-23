import { expect, test } from "@playwright/test";

// Icon-only buttons explain themselves on hover and keyboard focus (src/lib/tooltips.ts);
// buttons with visible text get no tooltip, and the grey browser tooltip never doubles up.

test("icon buttons show a tooltip with their name on hover and keyboard focus", async ({ page }) => {
  await page.goto("/products");
  const tip = page.locator("#vs-tip");
  const compare = page.getByRole("button", { name: "Add to comparison" }).first();
  await compare.hover();
  await expect(tip).toHaveClass(/vs-tip-on/);
  await expect(tip).toHaveText("Add to comparison");

  // moving away hides it
  await page.mouse.move(0, 0);
  await expect(tip).not.toHaveClass(/vs-tip-on/);

  // a button with visible text gets none
  await page.getByRole("button", { name: /Add to enquiry/ }).first().hover();
  await page.waitForTimeout(600);
  await expect(tip).not.toHaveClass(/vs-tip-on/);

  // keyboard focus shows it too
  await compare.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(tip).toHaveClass(/vs-tip-on/);
});
