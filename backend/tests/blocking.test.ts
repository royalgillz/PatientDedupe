import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, expect, inject, it } from "vitest";
import type { Fixture } from "./fixture.ts";

const here = dirname(fileURLToPath(import.meta.url));
const blockingSql = readFileSync(resolve(here, "../../sql/blocking_candidates.sql"), "utf8");

let sql: ReturnType<typeof import("postgres")["default"]>;
let loadFixture: (s: typeof sql) => Promise<Fixture>;
let fx: Fixture;

beforeAll(async () => {
  process.env.DATABASE_URL = inject("databaseUrl");
  process.env.NODE_ENV = "test";
  sql = (await import("../src/db.ts")).sql;
  loadFixture = (await import("./fixture.ts")).loadFixture;
});

beforeEach(async () => {
  fx = await loadFixture(sql);
});

const candidates = () => sql.unsafe(blockingSql) as Promise<{ a_id: number; b_id: number }[]>;
const key = (x: number, y: number) => (x < y ? `${x}-${y}` : `${y}-${x}`);

// @spec BLOCK-001
it("generates only pairs that share a blocking key, far fewer than all pairs", async () => {
  const cands = await candidates();
  const allPairs = (5 * 4) / 2; // 10
  expect(cands.length).toBeGreaterThan(0);
  expect(cands.length).toBeLessThan(allPairs);

  for (const c of cands) {
    const [row] = await sql<{ shares: boolean }[]>`
      select (
        (dmetaphone(a.last_name) = dmetaphone(b.last_name) and left(a.dob, 4) = left(b.dob, 4))
        or (dmetaphone(a.first_name) = dmetaphone(b.first_name) and left(a.dob, 4) = left(b.dob, 4))
        or (dmetaphone(a.first_name) = dmetaphone(b.first_name) and dmetaphone(a.last_name) = dmetaphone(b.last_name))
        or (left(lower(a.last_name), 3) = left(lower(b.last_name), 3) and a.dob = b.dob)
      ) as shares
      from source_records a, source_records b
      where a.id = ${c.a_id} and b.id = ${c.b_id}`;
    expect(row.shares).toBe(true);
  }
});

// @spec BLOCK-002
it("the unioned phonetic strategies capture the known true-duplicate pairs", async () => {
  const cands = new Set((await candidates()).map((c) => key(c.a_id, c.b_id)));
  expect(cands.has(key(fx.ids.a1, fx.ids.a2))).toBe(true); // Smith / Smith, same year
  expect(cands.has(key(fx.ids.b1, fx.ids.b2))).toBe(true); // Doe / Doe, same year
});

// @spec BLOCK-003
it("every blocking key is backed by a functional index", async () => {
  const idx = await sql<{ indexname: string; indexdef: string }[]>`
    select indexname, indexdef from pg_indexes where tablename = 'source_records'`;
  const names = new Set(idx.map((r) => r.indexname));
  for (const expected of [
    "idx_block_last_dmeta",
    "idx_block_first_dmeta",
    "idx_block_dob_year",
    "idx_block_last_prefix",
  ]) {
    expect(names.has(expected)).toBe(true);
  }
  const defs = idx.map((r) => r.indexdef.toLowerCase()).join("\n");
  expect(defs).toContain("dmetaphone");
  expect(defs).toContain("left");
});

// @spec BLOCK-004
it("reports comparison reduction and blocking recall against ground truth", async () => {
  const cands = await candidates();
  const allPairs = (5 * 4) / 2;
  const reduction = 1 - cands.length / allPairs;
  expect(reduction).toBeGreaterThan(0);
  expect(reduction).toBeLessThan(1);

  const candSet = new Set(cands.map((c) => key(c.a_id, c.b_id)));
  const truth = [key(fx.ids.a1, fx.ids.a2), key(fx.ids.b1, fx.ids.b2)];
  const captured = truth.filter((t) => candSet.has(t)).length;
  expect(captured / truth.length).toBe(1);
});
