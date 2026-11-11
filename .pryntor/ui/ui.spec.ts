import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import pages from "./pages.json";

for (const path of pages as string[]) {
  test(`ui ${path}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => {
      (window as any).__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries() as any[]) if (!e.hadRecentInput) (window as any).__cls += e.value; })
        .observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(path, { waitUntil: "networkidle" });
    // P54: with reduced motion, nothing should still be animating.
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
    expect(running, "animations running under prefers-reduced-motion").toBe(0);
    // P57: axe, WCAG 2.2 AA.
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(axe.violations.map((v) => v.id)).toEqual([]);
    // P58: CLS budget.
    expect(await page.evaluate(() => (window as any).__cls)).toBeLessThanOrEqual(0.1);
    // P61: visual regression.
    await expect(page).toHaveScreenshot(`${path.replace(/\W+/g, "_") || "home"}.png`, { fullPage: true, maxDiffPixelRatio: 0.01 });
  });
}
