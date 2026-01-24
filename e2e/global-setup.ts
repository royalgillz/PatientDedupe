import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { loadFixture } from "../backend/tests/fixture.ts";
import { E2E_DATABASE_URL } from "./playwright.config.ts";

const here = dirname(fileURLToPath(import.meta.url));

// Starts a throwaway Postgres in Docker, applies the real schema and blocking setup, and
// loads the deterministic fixture the e2e flows assert against.
export default async function globalSetup() {
  try {
    execSync("docker rm -f pdd-e2e-pg", { stdio: "ignore" });
  } catch {
    // not running yet, fine
  }
  execSync(
    "docker run -d --name pdd-e2e-pg -p 5544:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=patientdedupe_e2e postgres:17",
    { stdio: "ignore" },
  );

  const sql = postgres(E2E_DATABASE_URL, { max: 1 });
  for (let i = 0; i < 60; i++) {
    try {
      await sql`select 1`;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  await sql.unsafe(readFileSync(resolve(here, "../backend/schema.sql"), "utf8"));
  await sql.unsafe(readFileSync(resolve(here, "../sql/blocking_setup.sql"), "utf8"));
  await loadFixture(sql);
  await sql.end();
}
