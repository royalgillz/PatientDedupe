// Captures the matching playground in a few states by actually driving it: the
// default "likely match" case, a "not a match" case (by clicking a preset), and a
// mobile view. Doubles as a smoke test that the WebAssembly engine loads and scores.
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../../assets/screenshots");
const url = process.argv[2] || "http://localhost:4317";

const browser = await chromium.launch();

async function shot(name, width, height, prepare) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector(".score-num", { timeout: 30000 });
  if (prepare) await prepare(page);
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(outDir, `${name}.png`), fullPage: true });
  console.log(`saved ${name}.png`);
  await ctx.close();
}

// default state is the Robert vs Bob match
await shot("playground-desktop", 1440, 900);

// click the "Different people" preset to show a no-match verdict
await shot("playground-nomatch", 1440, 900, async (page) => {
  await page.click('button.chip:has-text("Different people")');
  await page.waitForFunction(() => {
    const el = document.querySelector(".verdict");
    return el && el.textContent && el.textContent.includes("Not a match");
  }, { timeout: 10000 });
});

await shot("playground-mobile", 390, 844);

await browser.close();
