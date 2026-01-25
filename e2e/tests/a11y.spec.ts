import AxeBuilder from "@axe-core/playwright";
import postgres from "postgres";
import { expect, test } from "@playwright/test";
import { loadFixture } from "../../backend/tests/fixture.ts";
import { E2E_DATABASE_URL } from "../playwright.config.ts";

const sql = postgres(E2E_DATABASE_URL, { max: 1 });
test.beforeEach(async () => {
  await loadFixture(sql);
});
test.afterAll(async () => {
  await sql.end();
});

// @spec CONSOLE-012
for (const path of ["/", "/queue", "/audit", "/search", "/sandbox"]) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    const summary = serious.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
    expect(serious, JSON.stringify(summary, null, 2)).toEqual([]);
  });
}
