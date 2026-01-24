import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { sql } from "./db.js";

// Exported so tests can drive the routes through app.fetch without binding a port.
export const app = new Hono();
app.use("/api/*", cors());

// Surface the real error to the client and the logs instead of a bare 500. The data
// is synthetic, so a readable message is more helpful than hiding it.
// @spec API-008
app.onError((err, c) => {
  console.error("API error:", err);
  return c.json({ error: err.message }, 500);
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/reviewers", async (c) => {
  const rows = await sql`select id, name, email, role from reviewers order by id`;
  return c.json(rows);
});

// Dashboard: a few trusted numbers plus the data the charts need.
// @spec API-005
app.get("/api/dashboard", async (c) => {
  const [totals] = await sql`
    select count(*)::int as records,
           count(distinct person_key)::int as persons
    from source_records`;
  const byStatus = await sql`select status, count(*)::int as n from candidate_pairs group by status`;
  const byBand = await sql`select band, count(*)::int as n from candidate_pairs group by band`;
  const bySource = await sql`
    select source_system, count(*)::int as n from source_records group by source_system order by n desc`;
  const histogram = await sql`
    select (floor(score * 20) / 20.0) as bucket, count(*)::int as n
    from candidate_pairs group by bucket order by bucket`;
  const [pending] = await sql`select count(*)::int as n from candidate_pairs where status = 'pending'`;
  const [merged] = await sql`select count(*)::int as n from candidate_pairs where status = 'merged'`;
  const [autoMerge] = await sql`select count(*)::int as n from candidate_pairs where band = 'match'`;
  const [totalPairs] = await sql`select count(*)::int as n from candidate_pairs`;
  const [blocking] = await sql`
    select all_pairs::float8 as all_pairs, candidate_pairs::float8 as candidate_pairs,
           reduction, true_duplicates, captured, recall, generated_at
    from blocking_stats where id = 1`;

  return c.json({
    blocking: blocking ?? null,
    records: totals.records,
    persons: totals.persons,
    duplicateRate: totals.records ? 1 - totals.persons / totals.records : 0,
    pending: pending.n,
    merged: merged.n,
    autoMergeEligible: autoMerge.n,
    totalPairs: totalPairs.n,
    byStatus, byBand, bySource, histogram,
  });
});

// Review queue with filters: status, minimum score, band, free-text name/MRN.
// @spec API-001
app.get("/api/queue", async (c) => {
  const status = c.req.query("status") ?? "pending";
  const minScore = Number(c.req.query("minScore") ?? "0");
  const band = c.req.query("band");
  const q = c.req.query("q")?.trim();
  const limit = Math.min(Number(c.req.query("limit") ?? "200"), 500);

  const conds = [sql`p.status = ${status}`, sql`p.score >= ${minScore}`];
  if (band) conds.push(sql`p.band = ${band}`);
  if (q) {
    const like = `%${q}%`;
    conds.push(sql`(a.first_name ilike ${like} or a.last_name ilike ${like}
      or b.first_name ilike ${like} or b.last_name ilike ${like}
      or a.mrn ilike ${like} or b.mrn ilike ${like})`);
  }
  let where = conds[0];
  for (let i = 1; i < conds.length; i++) where = sql`${where} and ${conds[i]}`;

  const rows = await sql`
    select p.id, p.score, p.band, p.status, p.is_true_duplicate, p.created_at,
           p.reasons,
           row_to_json(a.*) as record_a, row_to_json(b.*) as record_b
    from candidate_pairs p
    join source_records a on a.id = p.record_a_id
    join source_records b on b.id = p.record_b_id
    where ${where}
    order by p.score desc
    limit ${limit}`;
  return c.json(rows);
});

app.get("/api/pairs/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [pair] = await sql`
    select p.*, row_to_json(a.*) as record_a, row_to_json(b.*) as record_b
    from candidate_pairs p
    join source_records a on a.id = p.record_a_id
    join source_records b on b.id = p.record_b_id
    where p.id = ${id}`;
  if (!pair) return c.json({ error: "not found" }, 404);
  return c.json(pair);
});

const FIELDS = ["first_name", "last_name", "dob", "gender", "address", "city", "state", "zip", "mrn"];

type Reviewer = { id: number; name: string };

// Merge one pair into a golden record. Captures each member's pre-merge person_key in the
// audit details so the merge can be reversed exactly, then links the records and writes
// the merge audit row. Used by the single decision and by bulk auto-merge.
// @spec API-003
async function mergePair(pair: any, reviewer: Reviewer, reasonCode: string | null, note: string | null) {
  const a = pair.record_a, b = pair.record_b;
  const fields: Record<string, { value: string; source: string }> = {};
  for (const f of FIELDS) {
    // simple survivorship: keep the more complete value, preferring record A on ties
    const av = (a[f] ?? "").toString(), bv = (b[f] ?? "").toString();
    const useA = av.length >= bv.length;
    fields[f] = { value: useA ? av : bv, source: useA ? a.source_system : b.source_system };
  }
  const eid = `EID-${String(pair.id).padStart(6, "0")}`;
  const [golden] = await sql`
    insert into golden_records (enterprise_id, pair_id, fields, member_record_ids, created_by)
    values (${eid}, ${pair.id}, ${sql.json(fields)}, ${[a.id, b.id]}, ${reviewer.id})
    returning *`;

  const prior: Record<string, number | null> = { [a.id]: a.person_key ?? null, [b.id]: b.person_key ?? null };
  await sql`update source_records set person_key = ${a.person_key ?? a.id} where id = any(${[a.id, b.id]})`;
  await sql`update candidate_pairs set status = 'merged', decided_at = now(),
    decided_by = ${reviewer.id}, reason_code = ${reasonCode}, note = ${note} where id = ${pair.id}`;
  await sql`
    insert into audit_log (actor, action, pair_id, record_a_id, record_b_id, score, reason_code, note, details)
    values (${reviewer.name}, 'merge', ${pair.id}, ${pair.record_a_id}, ${pair.record_b_id},
            ${pair.score}, ${reasonCode}, ${note}, ${sql.json({ band: pair.band, prior })})`;
  return golden;
}

async function findReviewer(reviewerId?: number): Promise<Reviewer | null> {
  if (!reviewerId) return null;
  const [reviewer] = await sql`select id, name from reviewers where id = ${reviewerId}`;
  return reviewer ?? null;
}

// Record a steward decision. No anonymous merges: a valid reviewer is required.
// @spec API-002, API-003, API-004
app.post("/api/pairs/:id/decision", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ action: "merge" | "not_a_match" | "need_info"; reviewerId?: number; reasonCode?: string; note?: string }>();
  const reviewer = await findReviewer(body.reviewerId);
  if (!reviewer) return c.json({ error: "a logged-in reviewer is required" }, 400);

  const [pair] = await sql`
    select p.*, row_to_json(a.*) as record_a, row_to_json(b.*) as record_b
    from candidate_pairs p
    join source_records a on a.id = p.record_a_id
    join source_records b on b.id = p.record_b_id
    where p.id = ${id}`;
  if (!pair) return c.json({ error: "not found" }, 404);

  if (body.action === "merge") {
    const golden = await mergePair(pair, reviewer, body.reasonCode ?? null, body.note ?? null);
    return c.json({ ok: true, status: "merged", golden });
  }

  const status = body.action === "not_a_match" ? "not_a_match" : "need_info";
  await sql`update candidate_pairs set status = ${status}, decided_at = now(),
    decided_by = ${reviewer.id}, reason_code = ${body.reasonCode ?? null}, note = ${body.note ?? null}
    where id = ${id}`;
  await sql`
    insert into audit_log (actor, action, pair_id, record_a_id, record_b_id, score, reason_code, note, details)
    values (${reviewer.name}, ${body.action}, ${id}, ${pair.record_a_id}, ${pair.record_b_id},
            ${pair.score}, ${body.reasonCode ?? null}, ${body.note ?? null}, ${sql.json({ band: pair.band })})`;
  return c.json({ ok: true, status });
});

// Reverse a merge: restore the prior person_keys, drop the golden record, reopen the pair.
// @spec API-010
app.post("/api/pairs/:id/unmerge", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ reviewerId?: number; note?: string }>();
  const reviewer = await findReviewer(body.reviewerId);
  if (!reviewer) return c.json({ error: "a logged-in reviewer is required" }, 400);

  const [pair] = await sql`select * from candidate_pairs where id = ${id}`;
  if (!pair) return c.json({ error: "not found" }, 404);
  if (pair.status !== "merged") return c.json({ error: "pair is not merged" }, 400);

  const [mergeAudit] = await sql`
    select details from audit_log where pair_id = ${id} and action = 'merge' order by ts desc limit 1`;
  const prior = (mergeAudit?.details?.prior ?? {}) as Record<string, number | null>;
  for (const [recId, pk] of Object.entries(prior)) {
    await sql`update source_records set person_key = ${pk} where id = ${Number(recId)}`;
  }
  await sql`delete from golden_records where pair_id = ${id}`;
  await sql`update candidate_pairs set status = 'pending', decided_at = null, decided_by = null,
    reason_code = null, note = null where id = ${id}`;
  await sql`
    insert into audit_log (actor, action, pair_id, record_a_id, record_b_id, score, note, details)
    values (${reviewer.name}, 'unmerge', ${id}, ${pair.record_a_id}, ${pair.record_b_id},
            ${pair.score}, ${body.note ?? null}, ${sql.json({ restored: prior })})`;
  return c.json({ ok: true, status: "pending" });
});

// Merge every pending match-band pair in one identified action.
// @spec API-011
app.post("/api/auto-merge", async (c) => {
  const body = await c.req.json<{ reviewerId?: number }>().catch(() => ({}) as { reviewerId?: number });
  const reviewer = await findReviewer(body.reviewerId);
  if (!reviewer) return c.json({ error: "a logged-in reviewer is required" }, 400);

  const pairs = await sql`
    select p.*, row_to_json(a.*) as record_a, row_to_json(b.*) as record_b
    from candidate_pairs p
    join source_records a on a.id = p.record_a_id
    join source_records b on b.id = p.record_b_id
    where p.status = 'pending' and p.band = 'match'`;
  for (const pair of pairs) {
    await mergePair(pair, reviewer, "Auto-merge (>= 0.95)", null);
  }
  return c.json({ ok: true, merged: pairs.length });
});

// @spec API-006
app.get("/api/audit", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? "200"), 500);
  const rows = await sql`select * from audit_log order by ts desc limit ${limit}`;
  return c.json(rows);
});

// @spec API-007
app.get("/api/search", async (c) => {
  const q = c.req.query("q")?.trim();
  if (!q) return c.json([]);
  const like = `%${q}%`;
  const rows = await sql`
    select * from source_records
    where first_name ilike ${like} or last_name ilike ${like} or mrn ilike ${like}
    order by last_name, first_name limit 50`;
  return c.json(rows);
});

app.get("/api/records/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [record] = await sql`select * from source_records where id = ${id}`;
  if (!record) return c.json({ error: "not found" }, 404);
  const linked = await sql`
    select * from source_records where person_key = ${record.person_key} and id <> ${id}`;
  return c.json({ record, linked });
});

// In production the built frontend is copied to ./public and served from here.
app.use("/*", serveStatic({ root: "./public" }));
app.get("/*", serveStatic({ path: "./public/index.html" }));

// Only bind a port when run as the server; tests import `app` and skip this.
if (process.env.NODE_ENV !== "test") {
  const port = Number(process.env.PORT ?? 8787);
  serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });
  console.log(`PatientDedupe API listening on :${port}`);
}
