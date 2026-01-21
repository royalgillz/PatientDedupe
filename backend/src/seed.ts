import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "./db.js";
import { scorePair } from "./engine.js";
import type { PatientRecord } from "./types.js";

// Builds a realistic stewardship workload from the Synthea population:
//  1. load real patients as "source records" spread across several source systems,
//  2. inject duplicates (messy copies under a different system and MRN) so there is
//     something to deduplicate, keeping a person_key as ground truth,
//  3. add hard negatives (different people who look similar),
//  4. score every pair with the real engine and store it as a pending review task.
// Deterministic: a fixed seed makes the demo reproducible.

const here = dirname(fileURLToPath(import.meta.url));
const PATIENTS = resolve(here, "../../tools/synthea/output/csv/patients.csv");

const N_BASE = 820;
const N_DUPES = 240;
const N_NEGATIVES = 160;

const SOURCE_SYSTEMS = ["Epic ADT", "Cerner", "Lab Feed", "Registration", "Radiology"];
const NICKNAMES: Record<string, string> = {
  robert: "Bob", william: "Bill", richard: "Rick", james: "Jim", john: "Jack",
  joseph: "Joe", charles: "Charlie", thomas: "Tom", michael: "Mike",
  elizabeth: "Liz", margaret: "Maggie", katherine: "Kate", jennifer: "Jen",
  patricia: "Pat", susan: "Sue", deborah: "Debbie", christopher: "Chris",
};
const STREET_ABBR: Record<string, string> = {
  Street: "St", Avenue: "Ave", Road: "Rd", Drive: "Dr", Lane: "Ln",
  Court: "Ct", Boulevard: "Blvd", Place: "Pl",
};
// Pools for the bigger, harder edits that push a duplicate into the review band.
const SURNAMES = ["Walsh", "Nguyen", "Okafor", "Romero", "Bauer", "Khan", "Costa",
  "Reyes", "Fischer", "Mensah", "Doyle", "Park", "Silva", "Abbott"];
const STREETS = ["Maple Court", "Birch Lane", "Harbor Road", "Sunset Avenue",
  "Cedar Way", "Lincoln Street", "Pearl Drive", "Winter Street"];
const CITY_ZIPS: [string, string][] = [
  ["Worcester", "01608"], ["Springfield", "01103"], ["Cambridge", "02139"],
  ["Lowell", "01852"], ["Brockton", "02301"], ["Quincy", "02169"]];

// Small deterministic PRNG so the seed is reproducible without a dependency.
let state = 1234567;
function rand() {
  state = (state * 1103515245 + 12345) & 0x7fffffff;
  return state / 0x7fffffff;
}
const randInt = (n: number) => Math.floor(rand() * n);
const pick = <T,>(arr: T[]) => arr[randInt(arr.length)];
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  const header = rows.shift()!;
  return rows
    .filter((r) => r.length === header.length)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

const stripDigits = (s: string) => s.replace(/\d+/g, "").trim();

function typo(word: string): string {
  if (word.length < 2) return word;
  const i = randInt(word.length - 1);
  const a = word.split("");
  [a[i], a[i + 1]] = [a[i + 1], a[i]];
  return a.join("");
}

function transposeDob(dob: string): string {
  const idx = [...dob].map((c, i) => (/\d/.test(c) ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 2) return dob;
  const i = idx[randInt(idx.length - 1)];
  const a = dob.split("");
  let j = i + 1;
  while (j < dob.length && !/\d/.test(dob[j])) j++;
  if (j < dob.length) [a[i], a[j]] = [a[j], a[i]];
  return a.join("");
}

interface Rec extends PatientRecord {
  source_system: string;
  mrn: string;
  state: string;
  person_key: number;
}

function mrnFor(system: string): string {
  const prefix = system.split(" ")[0].slice(0, 3).toUpperCase();
  return `${prefix}-${100000 + randInt(900000)}`;
}

// Small edits keep a duplicate clearly the same person (match band).
function smallEdit(out: Rec, e: string) {
  if (e === "nickname") {
    const key = out.first_name.toLowerCase();
    out.first_name = NICKNAMES[key] ?? typo(out.first_name);
  } else if (e === "lastname") out.last_name = typo(out.last_name);
  else if (e === "dob") out.dob = transposeDob(out.dob);
  else if (e === "address") {
    for (const [long, short] of Object.entries(STREET_ABBR)) {
      if (out.address.includes(long)) { out.address = out.address.replace(long, short); break; }
    }
  } else if (e === "zip" && out.zip) {
    const z = out.zip.split("");
    z[z.length - 1] = String((Number(z[z.length - 1]) + 1) % 10);
    out.zip = z.join("");
  } else if (e === "city") out.city = typo(out.city);
}

// Big edits model real life: marriage, a move, a wrong birth year. These knock a
// genuine duplicate down into the review band, which is where stewards earn their keep.
function bigEdit(out: Rec, e: string) {
  if (e === "surname") out.last_name = pick(SURNAMES.filter((s) => s !== out.last_name));
  else if (e === "move") {
    const [city, zip] = pick(CITY_ZIPS);
    out.address = `${10 + randInt(980)} ${pick(STREETS)}`;
    out.city = city; out.zip = zip;
  } else if (e === "dobyear") {
    const y = Number(out.dob.slice(0, 4)) + (randInt(2) ? 1 : -1) * (2 + randInt(8));
    out.dob = `${y}${out.dob.slice(4)}`;
  }
}

// intensity: "light" -> match band, "moderate" -> review band, "heavy" -> borderline.
function perturb(rec: Rec, personKey: number, intensity: "light" | "moderate" | "heavy"): Rec {
  const out: Rec = { ...rec, person_key: personKey };
  out.source_system = pick(SOURCE_SYSTEMS.filter((s) => s !== rec.source_system));
  out.mrn = mrnFor(out.source_system);
  const smalls = ["nickname", "lastname", "dob", "address", "zip", "city"];
  const bigs = ["surname", "move", "dobyear"];
  if (intensity === "light") {
    smallEdit(out, pick(["nickname", "address", "zip"]));
  } else if (intensity === "moderate") {
    bigEdit(out, pick(bigs));
    smallEdit(out, pick(smalls));
  } else {
    const a = pick(bigs);
    bigEdit(out, a);
    bigEdit(out, pick(bigs.filter((b) => b !== a)));
  }
  return out;
}

const asPatient = (r: Rec): PatientRecord => ({
  first_name: r.first_name, last_name: r.last_name, dob: r.dob,
  gender: r.gender, address: r.address, city: r.city, zip: r.zip,
});

async function main() {
  console.log("loading Synthea patients...");
  const patients = parseCsv(readFileSync(PATIENTS, "utf8")).filter((p) => !p.DEATHDATE);

  const records: Rec[] = [];
  // base records, one per real person
  for (let i = 0; i < Math.min(N_BASE, patients.length); i++) {
    const p = patients[i];
    const system = pick(SOURCE_SYSTEMS);
    records.push({
      source_system: system,
      mrn: mrnFor(system),
      first_name: stripDigits(p.FIRST),
      last_name: stripDigits(p.LAST),
      dob: p.BIRTHDATE,
      gender: p.GENDER,
      address: stripDigits(p.ADDRESS),
      city: stripDigits(p.CITY),
      state: p.STATE || "Massachusetts",
      zip: (p.ZIP || "").slice(0, 5),
      person_key: i,
    });
  }

  // pairs to score, expressed as indices into `records`
  const pairs: { a: number; b: number; truth: boolean }[] = [];

  const baseCount = records.length;

  // inject duplicates across a realistic spread of difficulty
  for (let d = 0; d < N_DUPES; d++) {
    const orig = randInt(baseCount);
    const roll = rand();
    const intensity = roll < 0.45 ? "light" : roll < 0.85 ? "moderate" : "heavy";
    const dup = perturb(records[orig], records[orig].person_key, intensity);
    records.push(dup);
    pairs.push({ a: orig, b: records.length - 1, truth: true });
  }

  // confusable negatives: different people who share a surname or a birth year, the
  // cases a naive matcher trips on. Over-generate, then keep the ambiguous ones.
  const byYear = new Map<string, number[]>();
  const bySurname = new Map<string, number[]>();
  for (let i = 0; i < baseCount; i++) {
    const y = records[i].dob.slice(0, 4);
    const s = records[i].last_name.toLowerCase();
    (byYear.get(y) ?? byYear.set(y, []).get(y)!).push(i);
    (bySurname.get(s) ?? bySurname.set(s, []).get(s)!).push(i);
  }
  const negSeen = new Set<string>();
  for (let attempt = 0; attempt < 1600; attempt++) {
    const bucket = pick([...(attempt % 2 ? bySurname : byYear).values()]);
    if (bucket.length < 2) continue;
    const a = pick(bucket), b = pick(bucket);
    if (a === b || records[a].person_key === records[b].person_key) continue;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (negSeen.has(key)) continue;
    negSeen.add(key);
    pairs.push({ a, b, truth: false });
  }

  console.log("resetting tables...");
  await sql`truncate audit_log, golden_records, candidate_pairs, source_records, reviewers restart identity cascade`;

  console.log(`inserting ${records.length} source records...`);
  const ids: number[] = [];
  const chunk = 200;
  for (let i = 0; i < records.length; i += chunk) {
    const slice = records.slice(i, i + chunk).map((r) => ({
      source_system: r.source_system, mrn: r.mrn, first_name: r.first_name,
      last_name: r.last_name, dob: r.dob, gender: r.gender, address: r.address,
      city: r.city, state: r.state, zip: r.zip, person_key: r.person_key,
    }));
    const inserted = await sql`insert into source_records ${sql(slice)} returning id`;
    for (const row of inserted) ids.push(row.id as number);
  }

  console.log("seeding reviewers...");
  await sql`insert into reviewers ${sql([
    { name: "Priya Nair", email: "priya.nair@example-health.org", role: "steward" },
    { name: "Marcus Bell", email: "marcus.bell@example-health.org", role: "steward" },
    { name: "Dr. Chen", email: "chen@example-health.org", role: "lead" },
  ])}`;

  console.log(`scoring ${pairs.length} candidate pairs with the engine...`);
  const pairRows = [];
  for (const p of pairs) {
    const result = await scorePair(asPatient(records[p.a]), asPatient(records[p.b]));
    pairRows.push({
      record_a_id: ids[p.a],
      record_b_id: ids[p.b],
      score: result.score,
      band: result.label,
      reasons: sql.json(result.fields),
      is_true_duplicate: p.truth,
    });
  }
  // keep pairs worth a steward's attention: real duplicates the engine surfaced, plus
  // confusable non-duplicates that land in the same score range. A real system gets
  // these from the SQL blocking layer in Phase 2.
  const dupKept = pairRows.filter((r) => r.is_true_duplicate && r.score >= 0.6);
  const negKept = pairRows
    .filter((r) => !r.is_true_duplicate && r.score >= 0.62 && r.score <= 0.93)
    .slice(0, N_NEGATIVES);
  const worth = [...dupKept, ...negKept];
  const pairIds: number[] = [];
  for (let i = 0; i < worth.length; i += chunk) {
    const ins = await sql`insert into candidate_pairs ${sql(worth.slice(i, i + chunk))} returning id`;
    for (const r of ins) pairIds.push(r.id as number);
  }

  // Backfill a realistic decision history so the audit log and dashboard reflect a
  // queue that has been worked, rather than looking like an empty fixture.
  console.log("backfilling decision history...");
  const revs = await sql`select id, name from reviewers order by id`;
  const REASONS: Record<string, string[]> = {
    merged: ["Same person, confident", "Matched on identifiers", "Reconciled conflicts"],
    not_a_match: ["Different people", "Same name, different person", "Insufficient similarity"],
    need_info: ["Awaiting identifier", "Conflicting critical field", "Escalated to lead"],
  };
  const NOTES = ["", "", "", "Confirmed against prior visit.", "Address verified with patient.",
    "Flagged to registration desk.", "DOB mismatch unresolved.", "Matches insurance record."];
  const history = shuffle(pairIds.map((_, i) => i)).slice(0, Math.min(34, worth.length));
  for (const k of history) {
    const w = worth[k];
    const action = w.score >= 0.92 ? "merged" : w.score < 0.82 ? "not_a_match"
      : pick(["merged", "not_a_match", "need_info"]);
    const reviewer = pick(revs);
    const ts = new Date(Date.now() - (8 + randInt(13000)) * 60000).toISOString();
    const reason = pick(REASONS[action]);
    const note = action === "merged" ? pick(["", "", "Confirmed against prior visit."]) : pick(NOTES);
    await sql`update candidate_pairs set status = ${action}, decided_at = ${ts},
      decided_by = ${reviewer.id}, reason_code = ${reason}, note = ${note} where id = ${pairIds[k]}`;
    await sql`insert into audit_log (ts, actor, action, pair_id, record_a_id, record_b_id, score, reason_code, note, details)
      values (${ts}, ${reviewer.name}, ${action === "merged" ? "merge" : action}, ${pairIds[k]},
              ${w.record_a_id}, ${w.record_b_id}, ${w.score}, ${reason}, ${note || null}, ${sql.json({ band: w.band })})`;
  }

  const bands = worth.reduce<Record<string, number>>((m, r) => {
    m[r.band] = (m[r.band] ?? 0) + 1; return m;
  }, {});
  console.log(`seeded ${records.length} records, ${worth.length} pairs, ${history.length} historical decisions`, bands);
  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
