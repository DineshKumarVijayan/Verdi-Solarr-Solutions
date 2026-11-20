import { mkdirSync, writeFileSync } from "node:fs";
import { test } from "@playwright/test";
import { context, freezeClock, routes, seedStorage, settle, signIn } from "./routes";

// Phone measurements at 390×844 for every route, written to tests/visual/out/mobile-metrics-<label>.json
// plus a first-screen screenshot per route. Run: npm run test:visual -- --project=mobile-390
// Set METRICS_LABEL=before / phase1 / ... to keep runs apart.
const LABEL = process.env.METRICS_LABEL ?? "before";
const H = 844;

test("mobile metrics", async ({ page: first, baseURL }) => {
  test.setTimeout(15 * 60_000);
  const c = await context(first);
  const out = `tests/visual/out/mobile-${LABEL}`;
  mkdirSync(out, { recursive: true });
  const rows = [];
  for (const r of routes(c)) {
    await first.context().clearCookies();
    const page = await first.context().newPage();
    await signIn(page, r.who, baseURL!);
    await seedStorage(page, r, c.twoIds);
    await freezeClock(page);
    await page.goto(r.path);
    await settle(page);
    const m = await page.evaluate((vh) => {
      const doc = document.documentElement;
      const pageH = Math.max(doc.scrollHeight, document.body.scrollHeight);
      // Fixed/sticky chrome visible on the first screen, split into top and bottom.
      let top = 0, bottom = 0;
      const seen: Element[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("body *")) {
        const cs = getComputedStyle(el);
        if (cs.position !== "fixed" && cs.position !== "sticky") continue;
        if (seen.some((s) => s.contains(el))) continue;
        const b = el.getBoundingClientRect();
        if (b.height < 4 || b.width < 100 || cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
        if (b.bottom <= 0 || b.top >= vh || b.height > vh * 0.9) continue;
        seen.push(el);
        if (b.top < vh / 2) top = Math.max(top, b.bottom);
        else bottom = Math.max(bottom, vh - b.top);
      }
      // Announcement / header block at the very top (non-fixed parts count too).
      const header = document.querySelector("header");
      const headerBottom = header ? Math.min(vh, header.getBoundingClientRect().bottom) : 0;
      const chromeTop = Math.max(top, headerBottom);
      const footer = document.querySelector("body footer:last-of-type") as HTMLElement | null;
      const main = document.querySelector("main") ?? document.body;
      const visible = (e: Element) => { const b = e.getBoundingClientRect(); return b.height > 0 && b.top < vh - bottom && b.bottom > chromeTop; };
      const productLinks = new Set([...main.querySelectorAll<HTMLAnchorElement>('a[href^="/products/"]')].filter(visible).map((a) => a.getAttribute("href")));
      const rowsVisible = [...main.querySelectorAll("tbody tr, ul > li, ol > li")].filter(visible).length;
      const wide = [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((e) => e.getBoundingClientRect().right > doc.clientWidth + 1 && !e.closest("[class*=overflow-x], [class*=scrollbar-none], .overflow-auto, .overflow-hidden"))
        .slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(" ").slice(0, 3).join(".")}`);
      return {
        screens: +(pageH / vh).toFixed(1),
        chromeTopPx: Math.round(chromeTop),
        chromeBottomPx: Math.round(bottom),
        chromePct: Math.round(((chromeTop + bottom) / vh) * 100),
        hOverflowPx: Math.max(0, doc.scrollWidth - doc.clientWidth),
        overflowCulprits: doc.scrollWidth > doc.clientWidth ? wide : [],
        productsFirstScreen: productLinks.size,
        listRowsFirstScreen: rowsVisible,
        footerPx: footer ? Math.round(footer.getBoundingClientRect().height) : 0,
        footerScreens: footer ? +(footer.getBoundingClientRect().height / vh).toFixed(2) : 0,
        // tallest top-level sections, to explain where the scrolling comes from
        biggest: [...main.querySelectorAll(":scope > *, :scope > * > section, :scope > * > div > section")]
          .map((e) => ({ e, h: e.getBoundingClientRect().height }))
          .filter((x) => x.h > vh * 0.6)
          .sort((a, b) => b.h - a.h)
          .slice(0, 4)
          .map(({ e, h }) => `${(e.querySelector("h1,h2,h3")?.textContent ?? e.tagName).trim().slice(0, 40)} (${(h / vh).toFixed(1)})`),
      };
    }, H);
    await page.screenshot({ path: `${out}/${r.name}.png` });
    rows.push({ route: r.name, path: r.path, ...m });
    await page.evaluate(() => localStorage.clear());
    await page.close();
  }
  writeFileSync(`tests/visual/out/mobile-metrics-${LABEL}.json`, JSON.stringify(rows, null, 2));
});
