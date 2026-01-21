// Screenshots the workspace at desktop and narrow phone widths (including the Fold 6
// cover screen at ~344px), and performs real decisions so the audit log has content.
// Doubles as an end-to-end smoke test of the live or local app.
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../../assets/screenshots");
const base = process.argv[2] || "http://localhost:5176";

const browser = await chromium.launch();

async function go(page, path) {
  await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(900);
}
async function shot(page, name) {
  await page.screenshot({ path: resolve(outDir, `${name}.png`) });
  console.log("saved", name);
}
async function decide(page, btn, confirm) {
  await page.getByRole("button", { name: btn, exact: true }).first().click();
  await page.getByRole("button", { name: confirm }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: confirm }).click();
  await page.waitForTimeout(1200);
}
async function session(width, height, fn) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await fn(page);
  await ctx.close();
}

// Desktop
await session(1440, 900, async (page) => {
  await go(page, "/");
  await page.getByText("Pending review").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  await shot(page, "app-dashboard");

  await go(page, "/queue");
  await page.getByText("Record A").first().waitFor({ timeout: 30000 });
  await shot(page, "app-queue");

  await go(page, "/sandbox");
  await page.getByText("Weighted match score").first().waitFor({ timeout: 30000 });
  await shot(page, "app-sandbox");

  await go(page, "/search?q=smith");
  await page.waitForTimeout(800);
  await shot(page, "app-search");

  await go(page, "/queue");
  await page.getByText("Record A").first().waitFor({ timeout: 30000 });
  await decide(page, "Merge", "Confirm merge");
  await decide(page, "Not a match", "Confirm not a match");
  await decide(page, "Need info", "Flag for info");
  await go(page, "/audit");
  await page.waitForTimeout(800);
  await shot(page, "app-audit");
});

// Fold 6 cover screen (~344px wide)
await session(344, 882, async (page) => {
  await go(page, "/");
  await page.getByText("Pending review").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(700);
  await shot(page, "app-fold-dashboard");

  await go(page, "/queue");
  await page.locator("main button").first().waitFor({ timeout: 30000 });
  await shot(page, "app-fold-queue");

  await page.locator("main button").first().click();
  await page.getByText("Back to queue").first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  await shot(page, "app-fold-review");
});

// Phone (~390px wide)
await session(390, 844, async (page) => {
  await go(page, "/queue");
  await page.locator("main button").first().waitFor({ timeout: 30000 });
  await shot(page, "app-mobile-queue");
});

await browser.close();
console.log("done");
