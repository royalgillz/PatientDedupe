// Captures screenshots of PatientDedupe UI states for the README and for review.
// Usage: node capture.mjs [url]
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../../assets/screenshots");

const target = process.argv[2] || "https://sehajgill-patientdedupe.static.hf.space";

const shots = [
  { name: "status-page-desktop", width: 1440, height: 900, fullPage: true },
  { name: "status-page-mobile", width: 390, height: 844, fullPage: true },
];

const browser = await chromium.launch();
for (const s of shots) {
  const ctx = await browser.newContext({
    viewport: { width: s.width, height: s.height },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(target, { waitUntil: "networkidle", timeout: 60000 });
  // give web fonts a moment to settle so spacing renders as intended
  await page.waitForTimeout(800);
  const file = resolve(outDir, `${s.name}.png`);
  await page.screenshot({ path: file, fullPage: s.fullPage });
  console.log(`saved ${file}`);
  await ctx.close();
}
await browser.close();
