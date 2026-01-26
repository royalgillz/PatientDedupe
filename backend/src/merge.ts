import type postgres from "postgres";
import { computeSurvivorship } from "./survivorship.js";

// One place that turns a candidate pair into a golden record, reused by the single
// decision, the bulk auto-merge, and the seed's backfilled history, so every merge in
// the system is built the same way and is reversible the same way.
//
// It takes the sql executor as an argument so callers can run it inside a transaction
// (sql.begin), keeping the golden-record insert, the relink, the status flip, and the
// audit row atomic. An optional `at` timestamp lets the seed place a merge in the past;
// live merges leave it null and fall back to now().

// Accept either the pool handle or a transaction handle, so callers can wrap the merge
// in sql.begin for atomicity.
type SqlExec = postgres.Sql<Record<string, unknown>> | postgres.TransactionSql<Record<string, unknown>>;

export interface Reviewer {
  id: number;
  name: string;
  role?: string;
}

export interface MergeablePair {
  id: number;
  record_a_id: number;
  record_b_id: number;
  score: number | null;
  band: string;
  record_a: Record<string, unknown> & { id: number; source_system: string; person_key?: number | null };
  record_b: Record<string, unknown> & { id: number; source_system: string; person_key?: number | null };
}

interface MergeOpts {
  reasonCode?: string | null;
  note?: string | null;
  at?: string | null;
}

// @spec API-003
export async function mergePair(sqlx: SqlExec, pair: MergeablePair, reviewer: Reviewer, opts: MergeOpts = {}) {
  const a = pair.record_a;
  const b = pair.record_b;
  const survivorship = computeSurvivorship(a, b);
  const eid = `EID-${String(pair.id).padStart(6, "0")}`;
  const at = opts.at ?? null;

  const [golden] = await sqlx`
    insert into golden_records (enterprise_id, pair_id, fields, member_record_ids, created_by, created_at)
    values (${eid}, ${pair.id}, ${sqlx.json(survivorship as unknown as Parameters<typeof sqlx.json>[0])}, ${[a.id, b.id]}, ${reviewer.id},
            coalesce(${at}::timestamptz, now()))
    returning *`;

  // Keep each member's pre-merge person_key so an unmerge can restore it exactly.
  const prior: Record<string, number | null> = {
    [a.id]: a.person_key ?? null,
    [b.id]: b.person_key ?? null,
  };
  await sqlx`update source_records set person_key = ${a.person_key ?? a.id} where id = any(${[a.id, b.id]})`;
  await sqlx`update candidate_pairs set status = 'merged',
      decided_at = coalesce(${at}::timestamptz, now()), decided_by = ${reviewer.id},
      reason_code = ${opts.reasonCode ?? null}, note = ${opts.note ?? null}
    where id = ${pair.id}`;
  await sqlx`
    insert into audit_log (ts, actor, action, pair_id, record_a_id, record_b_id, score, reason_code, note, details)
    values (coalesce(${at}::timestamptz, now()), ${reviewer.name}, 'merge', ${pair.id},
            ${pair.record_a_id}, ${pair.record_b_id}, ${pair.score}, ${opts.reasonCode ?? null},
            ${opts.note ?? null}, ${sqlx.json({ band: pair.band, prior })})`;
  return golden;
}
