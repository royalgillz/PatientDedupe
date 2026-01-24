import type postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

// A small, deterministic dataset so assertions are exact: two true-duplicate clusters
// that share blocking keys (Smith/Smith and Doe/Doe), one singleton, and three scored
// candidate pairs across the bands.
export interface Fixture {
  reviewerId: number;
  leadId: number;
  ids: { a1: number; a2: number; b1: number; b2: number; c1: number };
  pairs: { match: number; reviewTrue: number; reviewFalse: number };
}

export async function loadFixture(sql: Sql): Promise<Fixture> {
  await sql`truncate audit_log, golden_records, candidate_pairs, source_records, reviewers restart identity cascade`;

  const reviewers = await sql<{ id: number }[]>`
    insert into reviewers ${sql([
      { name: "Test Steward", email: "steward@example.test", role: "steward" },
      { name: "Test Lead", email: "lead@example.test", role: "lead" },
    ])} returning id`;

  const recs = await sql<{ id: number }[]>`
    insert into source_records ${sql([
      { source_system: "Epic ADT", mrn: "EPI-1001", first_name: "Robert", last_name: "Smith", dob: "1980-01-01", gender: "M", address: "1 Main St", city: "Boston", state: "MA", zip: "02118", person_key: 1 },
      { source_system: "Cerner", mrn: "CER-1001", first_name: "Bob", last_name: "Smith", dob: "1980-01-01", gender: "M", address: "1 Main Street", city: "Boston", state: "MA", zip: "02118", person_key: 1 },
      { source_system: "Lab Feed", mrn: "LAB-1001", first_name: "Jane", last_name: "Doe", dob: "1990-05-05", gender: "F", address: "9 Oak Ave", city: "Lowell", state: "MA", zip: "01852", person_key: 2 },
      { source_system: "Registration", mrn: "REG-1001", first_name: "Jane", last_name: "Doe", dob: "1990-05-05", gender: "F", address: "9 Oak Avenue", city: "Lowell", state: "MA", zip: "01852", person_key: 2 },
      { source_system: "Radiology", mrn: "RAD-1001", first_name: "Alan", last_name: "Turing", dob: "1912-06-23", gender: "M", address: "7 Kings Rd", city: "Cambridge", state: "MA", zip: "02139", person_key: 3 },
    ])} returning id`;
  const [a1, a2, b1, b2, c1] = recs.map((r) => r.id);

  const reasons = [{ field: "last_name", similarity: 1, weight: 0.24, detail: "exact" }];
  const insertPair = (a: number, b: number, score: number, band: string, truth: boolean) =>
    sql<{ id: number }[]>`
      insert into candidate_pairs (record_a_id, record_b_id, score, band, reasons, is_true_duplicate, status)
      values (${a}, ${b}, ${score}, ${band}, ${sql.json(reasons)}, ${truth}, 'pending') returning id`;

  const [match] = await insertPair(a1, a2, 0.97, "match", true);
  const [reviewTrue] = await insertPair(b1, b2, 0.85, "review", true);
  const [reviewFalse] = await insertPair(a1, c1, 0.82, "review", false);

  return {
    reviewerId: reviewers[0].id,
    leadId: reviewers[1].id,
    ids: { a1, a2, b1, b2, c1 },
    pairs: { match: match.id, reviewTrue: reviewTrue.id, reviewFalse: reviewFalse.id },
  };
}
