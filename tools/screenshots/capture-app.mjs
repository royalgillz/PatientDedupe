// Screenshots the full workspace by driving it like a steward would, and performs a
// real merge so the audit log has content. Doubles as an end-to-end smoke test.
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../../assets/screenshots");
const base = process.argv[2] || "http://localhost:5176";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

async function go(path) {
  await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(900);
}
async function shot(name) {
  await page.screenshot({ path: resolve(outDir, `${name}.png`) });
  console.log("saved", name);
}

await go("/");
await page.getByText("Pending review").first().waitFor({ timeout: 30000 });
await page.waitForTimeout(800); // let charts animate in
await shot("app-dashboard");

await go("/queue");
await page.getByText("Record A").first().waitFor({ timeout: 30000 });
await shot("app-queue");

await go("/sandbox");
await page.getByText("Weighted match score").first().waitFor({ timeout: 30000 });
await shot("app-sandbox");

await go("/search?q=smith");
await page.waitForTimeout(800);
await shot("app-search");

// perform a few real decisions to populate the audit log with variety
async function decide(btn, confirm) {
  await page.getByRole("button", { name: btn, exact: true }).first().click();
  await page.getByRole("button", { name: confirm }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: confirm }).click();
  await page.waitForTimeout(1200);
}
await go("/queue");
await page.getByText("Record A").first().waitFor({ timeout: 30000 });
await decide("Merge", "Confirm merge");
await decide("Not a match", "Confirm not a match");
await decide("Need info", "Flag for info");
await go("/audit");
await page.waitForTimeout(800);
await shot("app-audit");

await browser.close();
console.log("done");
