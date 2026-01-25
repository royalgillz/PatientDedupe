import postgres from "postgres";
import { expect, test } from "@playwright/test";
import { loadFixture } from "../../backend/tests/fixture.ts";
import { E2E_DATABASE_URL } from "../playwright.config.ts";

// Reset to the same fixture before each test so they are independent of order.
const sql = postgres(E2E_DATABASE_URL, { max: 1 });
test.beforeEach(async () => {
  await loadFixture(sql);
});
test.afterAll(async () => {
  await sql.end();
});

// The band <select> in the queue rail, located by an option only it has.
const bandSelect = (page: import("@playwright/test").Page) =>
  page.locator('select:has(option[value="match"])');

// @spec CONSOLE-001, CONSOLE-002
test("the queue loads with pairs and the score-and-reason breakdown", async ({ page }) => {
  await page.goto("/queue");
  await expect(page.getByRole("heading", { name: "Review queue" })).toBeVisible();
  // a pair auto-opens on desktop: the side-by-side comparison with similarity scores
  await expect(page.getByText("Record A", { exact: true })).toBeVisible();
  await expect(page.getByText("Record B", { exact: true })).toBeVisible();
  await expect(page.getByText("Similarity")).toBeVisible();
});

// @spec CONSOLE-001
test("filtering by band shows only pairs in that score band", async ({ page }) => {
  await page.goto("/queue");
  await bandSelect(page).selectOption("match");
  await expect(page.getByText("1 likely match")).toBeVisible();
});

// @spec CONSOLE-004, API-003
test("merge previews the surviving golden record, then confirms and clears the pair", async ({ page }) => {
  await page.goto("/queue");
  await bandSelect(page).selectOption("match");
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(page.getByText("Surviving golden record")).toBeVisible();
  await page.getByRole("button", { name: "Confirm merge" }).click();
  await expect(page.getByText(/Merged:/)).toBeVisible();
});

// @spec CONSOLE-005, API-004
test("not-a-match suppresses the pair and advances", async ({ page }) => {
  await page.goto("/queue");
  await page.getByRole("button", { name: "Not a match", exact: true }).click();
  await page.getByRole("button", { name: "Confirm not a match" }).click();
  await expect(page.getByText(/Marked not a match/)).toBeVisible();
});

// @spec CONSOLE-003, API-002
test("actions are disabled with no acting reviewer (no anonymous merges)", async ({ page }) => {
  await page.route("**/api/reviewers", (route) => route.fulfill({ json: [] }));
  await page.goto("/queue");
  await expect(page.getByText("Select a reviewer to act")).toBeVisible();
  await expect(page.getByRole("button", { name: "Merge", exact: true })).toBeDisabled();
});

// @spec CONSOLE-006
test("the dashboard leads with the pending-review count", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Pending review")).toBeVisible();
});

// @spec CONSOLE-009, API-010
test("a merge can be reversed from the audit log", async ({ page }) => {
  await page.goto("/queue");
  await bandSelect(page).selectOption("match");
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await page.getByRole("button", { name: "Confirm merge" }).click();
  await expect(page.getByText(/Merged:/)).toBeVisible();

  await page.goto("/audit");
  await page.getByRole("button", { name: /Unmerge/ }).first().click();
  await page.getByRole("button", { name: "Confirm unmerge" }).click();
  await expect(page.getByText("Merge reversed")).toBeVisible();
});

// @spec CONSOLE-010, API-011
test("the dashboard bulk auto-merges the eligible pairs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Auto-merge all" }).click();
  await page.getByRole("button", { name: "Confirm auto-merge" }).click();
  await expect(page.getByText(/Auto-merged/)).toBeVisible();
});

// @spec CONSOLE-011
test("the command palette navigates with the keyboard", async ({ page }) => {
  await page.goto("/");
  await page.locator("body").press("Control+k");
  await expect(page.getByPlaceholder("Jump to...")).toBeVisible();
  await page.getByText("Go to Audit log").click();
  await expect(page).toHaveURL(/\/audit/);
});

// @spec CONSOLE-011
test("single-key shortcuts open a decision from the queue", async ({ page }) => {
  await page.goto("/queue");
  await expect(page.getByText("Record A", { exact: true })).toBeVisible(); // a pair is open
  await page.locator("body").press("m");
  await expect(page.getByText("Surviving golden record")).toBeVisible();
});

// @spec CONSOLE-007
test("the audit log shows a decision with its reviewer", async ({ page }) => {
  await page.goto("/queue");
  await page.getByRole("button", { name: "Not a match", exact: true }).click();
  await page.getByRole("button", { name: "Confirm not a match" }).click();
  await expect(page.getByText(/Marked not a match/)).toBeVisible();
  await page.goto("/audit");
  await expect(page.getByRole("cell", { name: "Test Steward" })).toBeVisible();
});
