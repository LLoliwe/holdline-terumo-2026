import { defineConfig } from "@playwright/test";
// P61: Lebo's real device sizes. Pages to check live in .pryntor/ui/pages.json.
export default defineConfig({
  testDir: ".",
  testMatch: "ui.spec.ts",
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  use: { baseURL: process.env.URL },
  projects: [
    { name: "mbp14-1512x982", use: { viewport: { width: 1512, height: 982 } } },
    { name: "mbp16-1728x1117", use: { viewport: { width: 1728, height: 1117 } } },
    { name: "iphone16promax-440x956", use: { viewport: { width: 440, height: 956 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
  ],
});
