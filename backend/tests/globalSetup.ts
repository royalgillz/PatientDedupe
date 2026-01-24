import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import postgres from "postgres";

const here = dirname(fileURLToPath(import.meta.url));

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

// Starts one Postgres for the whole suite, applies the real schema and the blocking
// setup (functional indexes + the fuzzystrmatch extension), and hands the connection
// string to the tests.
export default async function ({ provide }: { provide: (k: "databaseUrl", v: string) => void }) {
  const container = await new PostgreSqlContainer("postgres:17").start();
  const url = container.getConnectionUri();

  const sql = postgres(url, { max: 1 });
  await sql.unsafe(readFileSync(resolve(here, "../schema.sql"), "utf8"));
  await sql.unsafe(readFileSync(resolve(here, "../../sql/blocking_setup.sql"), "utf8"));
  await sql.end();

  provide("databaseUrl", url);
  return async () => {
    await container.stop();
  };
}
