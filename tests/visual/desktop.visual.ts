import { expect, test } from "@playwright/test";
import { context, freezeClock, routes, seedStorage, settle, signIn } from "./routes";

// Desktop lock: every route at 1440×900 and 1024×768 must match the saved baseline
// pixel for pixel. Create/refresh the baseline only on purpose:
//   npm run test:visual -- --project=desktop-1440 --project=desktop-1024 --update-snapshots
// Normal run (after each mobile phase): npm run test:visual -- --project=desktop-1440 --project=desktop-1024
test.describe.configure({ mode: "default" });

test("desktop baseline", async ({ page, baseURL }) => {
  test.setTimeout(15 * 60_000);
  const c = await context(page);
  const q = await (async () => {
    await signIn(page, "admin", baseURL!);
    const r = await page.request.get("/api/admin/quotations");
    const j = r.ok() ? await r.json() : null;
    const list = (j?.quotations ?? j?.items ?? (Array.isArray(j) ? j : [])) as { id: number }[];
    return list[0]?.id as number | undefined;
  })();
  const failures: string[] = [];
  for (const r of routes({ ...c, quotationId: q })) {
    await test.step(r.name, async () => {
      await page.context().clearCookies();
      const p = await page.context().newPage();
      await signIn(p, r.who, baseURL!);
      await seedStorage(p, r, c.twoIds);
      await freezeClock(p);
      await p.goto(r.path);
      await settle(p);
      try {
        // the dashboard activity feed lists every sign-in (including this test's own): live data, so it is masked (its box size is still compared)
        await expect(p).toHaveScreenshot(`${r.name}.png`, { fullPage: true, timeout: 20_000, mask: [p.locator('section:has(> h2:has-text("Recent activity")) ul'), p.locator('[data-testid="my-day"]')] });
      } catch (e) {
        const msg = (e as Error).message.split("\n").find((l) => /pixels|size|missing|writing/i.test(l)) ?? "";
        failures.push(`${r.name}: ${msg.trim()}`);
      }
      await p.evaluate(() => localStorage.clear());
      await p.close();
    });
  }
  expect(failures, failures.join("\n")).toEqual([]);
});
