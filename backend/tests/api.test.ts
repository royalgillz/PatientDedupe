import { beforeAll, beforeEach, expect, inject, it } from "vitest";
import type { Fixture } from "./fixture.ts";

// Drives the real Hono routes through app.request against a Testcontainers Postgres.
// Each test starts from the same fixture.
let app: { request: (p: string, init?: RequestInit) => Promise<Response> };
let sql: ReturnType<typeof import("postgres")["default"]>;
let loadFixture: (s: typeof sql) => Promise<Fixture>;
let fx: Fixture;

beforeAll(async () => {
  process.env.DATABASE_URL = inject("databaseUrl");
  process.env.NODE_ENV = "test";
  sql = (await import("../src/db.ts")).sql;
  app = (await import("../src/server.ts")).app;
  loadFixture = (await import("./fixture.ts")).loadFixture;
});

beforeEach(async () => {
  fx = await loadFixture(sql);
});

const get = (p: string) => app.request(p);
const post = (p: string, body: unknown) =>
  app.request(p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// @spec API-001
it("queue returns pending pairs with both records and the reasons, sorted by score desc", async () => {
  const res = await get("/api/queue");
  expect(res.status).toBe(200);
  const rows = await res.json();
  expect(rows).toHaveLength(3);
  expect(rows[0].score).toBeGreaterThanOrEqual(rows[1].score);
  expect(rows[0].record_a).toBeTruthy();
  expect(rows[0].record_b).toBeTruthy();
  expect(rows[0].reasons).toBeTruthy();
});

// @spec API-001
it("queue filters by band, minimum score, and free-text name", async () => {
  const byBand = await (await get("/api/queue?band=match")).json();
  expect(byBand.every((r: any) => r.band === "match")).toBe(true);

  const byScore = await (await get("/api/queue?minScore=0.9")).json();
  expect(byScore.length).toBe(1);
  expect(byScore.every((r: any) => r.score >= 0.9)).toBe(true);

  const byName = await (await get("/api/queue?q=Doe")).json();
  expect(byName.length).toBeGreaterThan(0);
  expect(byName.every((r: any) => r.record_a.last_name === "Doe" || r.record_b.last_name === "Doe")).toBe(true);
});

// @spec API-002
it("rejects a decision with no reviewer and changes nothing (no anonymous decisions)", async () => {
  const res = await post(`/api/pairs/${fx.pairs.match}/decision`, { action: "merge" });
  expect(res.status).toBe(400);
  const [pair] = await sql`select status from candidate_pairs where id = ${fx.pairs.match}`;
  expect(pair.status).toBe("pending");
});

// @spec API-003
it("merge creates a golden record, links the sources, sets merged, and writes an audit row", async () => {
  const res = await post(`/api/pairs/${fx.pairs.match}/decision`, { action: "merge", reviewerId: fx.reviewerId });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("merged");
  expect(body.golden).toBeTruthy();

  const [golden] = await sql`select * from golden_records where pair_id = ${fx.pairs.match}`;
  expect(golden).toBeTruthy();
  const [pair] = await sql`select status from candidate_pairs where id = ${fx.pairs.match}`;
  expect(pair.status).toBe("merged");
  const [audit] = await sql`select * from audit_log where pair_id = ${fx.pairs.match} and action = 'merge'`;
  expect(audit).toBeTruthy();
});

// @spec API-004
it("not-a-match updates the status and writes an audit row", async () => {
  const res = await post(`/api/pairs/${fx.pairs.reviewFalse}/decision`, { action: "not_a_match", reviewerId: fx.reviewerId });
  expect(res.status).toBe(200);
  const [pair] = await sql`select status from candidate_pairs where id = ${fx.pairs.reviewFalse}`;
  expect(pair.status).toBe("not_a_match");
  const [audit] = await sql`select action from audit_log where pair_id = ${fx.pairs.reviewFalse}`;
  expect(audit.action).toBe("not_a_match");
});

// @spec API-005
it("dashboard returns index totals and the chart aggregates", async () => {
  const d = await (await get("/api/dashboard")).json();
  expect(d.records).toBe(5);
  expect(d.persons).toBe(3);
  expect(d.pending).toBe(3);
  expect(typeof d.duplicateRate).toBe("number");
  expect(Array.isArray(d.byBand)).toBe(true);
  expect(Array.isArray(d.bySource)).toBe(true);
  expect(Array.isArray(d.histogram)).toBe(true);
});

// @spec API-006
it("audit returns decisions newest first", async () => {
  await post(`/api/pairs/${fx.pairs.match}/decision`, { action: "merge", reviewerId: fx.reviewerId });
  await post(`/api/pairs/${fx.pairs.reviewFalse}/decision`, { action: "not_a_match", reviewerId: fx.reviewerId });
  const rows = await (await get("/api/audit")).json();
  expect(rows.length).toBeGreaterThanOrEqual(2);
  const times = rows.map((r: any) => new Date(r.ts).getTime());
  expect(times[0]).toBeGreaterThanOrEqual(times[1]);
});

// @spec API-007
it("search returns source records whose name or MRN matches", async () => {
  const byName = await (await get("/api/search?q=Smith")).json();
  expect(byName).toHaveLength(2);
  const byMrn = await (await get("/api/search?q=LAB-1001")).json();
  expect(byMrn).toHaveLength(1);
});

// @spec API-008
it("a thrown handler error returns a readable message, not an empty 500", async () => {
  const res = await app.request(`/api/pairs/${fx.pairs.match}/decision`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{ not valid json",
  });
  expect(res.status).toBe(500);
  const body = await res.json();
  expect(typeof body.error).toBe("string");
  expect(body.error.length).toBeGreaterThan(0);
});

const personKey = async (id: number) =>
  (await sql`select person_key from source_records where id = ${id}`)[0].person_key;

// @spec API-010
it("unmerge restores prior person_keys, removes the golden record, and reopens the pair", async () => {
  const before = await personKey(fx.ids.c1); // Alan Turing, a different person from a1
  await post(`/api/pairs/${fx.pairs.reviewFalse}/decision`, { action: "merge", reviewerId: fx.reviewerId });
  expect(await personKey(fx.ids.c1)).not.toBe(before); // relinked to a1's person on merge

  const res = await post(`/api/pairs/${fx.pairs.reviewFalse}/unmerge`, { reviewerId: fx.reviewerId });
  expect(res.status).toBe(200);
  expect(await personKey(fx.ids.c1)).toBe(before); // restored
  expect(await sql`select 1 from golden_records where pair_id = ${fx.pairs.reviewFalse}`).toHaveLength(0);
  const [pair] = await sql`select status from candidate_pairs where id = ${fx.pairs.reviewFalse}`;
  expect(pair.status).toBe("pending");
  const [audit] = await sql`select action from audit_log where pair_id = ${fx.pairs.reviewFalse} and action = 'unmerge'`;
  expect(audit).toBeTruthy();
});

// @spec API-010
it("rejects an unmerge with no reviewer (no anonymous unmerges)", async () => {
  await post(`/api/pairs/${fx.pairs.match}/decision`, { action: "merge", reviewerId: fx.reviewerId });
  const res = await post(`/api/pairs/${fx.pairs.match}/unmerge`, {});
  expect(res.status).toBe(400);
  const [pair] = await sql`select status from candidate_pairs where id = ${fx.pairs.match}`;
  expect(pair.status).toBe("merged");
});

// @spec API-011
it("bulk auto-merge merges every pending match-band pair", async () => {
  const res = await post(`/api/auto-merge`, { reviewerId: fx.reviewerId });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.merged).toBe(1); // the fixture has one match-band pair
  const [pair] = await sql`select status from candidate_pairs where id = ${fx.pairs.match}`;
  expect(pair.status).toBe("merged");
  expect(await sql`select 1 from golden_records where pair_id = ${fx.pairs.match}`).toHaveLength(1);
});
