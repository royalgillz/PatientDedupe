import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { sql } from "./db.js";

const app = new Hono();
app.use("/api/*", cors());

// Surface the real error to the client and the logs instead of a bare 500. The data
// is synthetic, so a readable message is more helpful than hiding it.
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

  return c.json({
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

// Record a steward decision. No anonymous merges: a valid reviewer is required.
app.post("/api/pairs/:id/decision", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{
    action: "merge" | "not_a_match" | "need_info";
    reviewerId?: number;
    reasonCode?: string;
    note?: string;
  }>();

  if (!body.reviewerId) return c.json({ error: "a logged-in reviewer is required" }, 400);
  const [reviewer] = await sql`select id, name from reviewers where id = ${body.reviewerId}`;
  if (!reviewer) return c.json({ error: "unknown reviewer" }, 400);

  const [pair] = await sql`
    select p.*, row_to_json(a.*) as record_a, row_to_json(b.*) as record_b
    from candidate_pairs p
    join source_records a on a.id = p.record_a_id
    join source_records b on b.id = p.record_b_id
    where p.id = ${id}`;
  if (!pair) return c.json({ error: "not found" }, 404);

  const statusMap = { merge: "merged", not_a_match: "not_a_match", need_info: "need_info" } as const;
  const status = statusMap[body.action];

  await sql`
    update candidate_pairs set status = ${status}, decided_at = now(),
      decided_by = ${body.reviewerId}, reason_code = ${body.reasonCode ?? null},
      note = ${body.note ?? null}
    where id = ${id}`;

  let golden = null;
  if (body.action === "merge") {
    const a = pair.record_a, b = pair.record_b;
    const fields: Record<string, { value: string; source: string }> = {};
    for (const f of FIELDS) {
      // simple survivorship: keep the more complete value, preferring record A on ties
      const av = (a[f] ?? "").toString(), bv = (b[f] ?? "").toString();
      const useA = av.length >= bv.length;
      fields[f] = { value: useA ? av : bv, source: useA ? a.source_system : b.source_system };
    }
    const eid = `EID-${String(id).padStart(6, "0")}`;
    const [g] = await sql`
      insert into golden_records (enterprise_id, pair_id, fields, member_record_ids, created_by)
      values (${eid}, ${id}, ${sql.json(fields)}, ${[a.id, b.id]}, ${body.reviewerId})
      returning *`;
    golden = g;
    // link the two source records to the same person going forward
    await sql`update source_records set person_key = ${a.person_key ?? a.id} where id = any(${[a.id, b.id]})`;
  }

  await sql`
    insert into audit_log (actor, action, pair_id, record_a_id, record_b_id, score, reason_code, note, details)
    values (${reviewer.name}, ${body.action}, ${id}, ${pair.record_a_id}, ${pair.record_b_id},
            ${pair.score}, ${body.reasonCode ?? null}, ${body.note ?? null},
            ${sql.json({ band: pair.band })})`;

  return c.json({ ok: true, status, golden });
});

app.get("/api/audit", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? "200"), 500);
  const rows = await sql`select * from audit_log order by ts desc limit ${limit}`;
  return c.json(rows);
});

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

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });
console.log(`PatientDedupe API listening on :${port}`);
