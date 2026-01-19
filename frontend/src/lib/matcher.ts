// Thin, typed wrapper around the WebAssembly matcher. It instantiates the module
// once (lazily) and exposes a clean async match() that returns parsed results. The
// scoring itself is the exact C++ engine from /engine, compiled to WebAssembly, so
// the browser is running the real matcher rather than a JavaScript re-implementation.
import createMatcherModule from "../wasm/matcher.js";
import type { PatientRecordInput } from "../wasm/matcher";

export type PatientRecord = PatientRecordInput;

export type MatchLabel = "match" | "review" | "no-match";

export interface FieldScore {
  field: string;
  similarity: number;
  weight: number;
  detail: string;
}

export interface MatchResult {
  score: number;
  label: MatchLabel;
  fields: FieldScore[];
}

let modulePromise: ReturnType<typeof createMatcherModule> | null = null;

function load() {
  if (!modulePromise) modulePromise = createMatcherModule();
  return modulePromise;
}

// Kick off loading early so the first comparison feels instant.
export function preloadMatcher() {
  void load();
}

export async function matchRecords(a: PatientRecord, b: PatientRecord): Promise<MatchResult> {
  const mod = await load();
  return JSON.parse(mod.matchRecordsJson(a, b)) as MatchResult;
}

// Friendly labels and the field display order used across the UI.
export const FIELD_LABELS: Record<string, string> = {
  last_name: "Last name",
  first_name: "First name",
  dob: "Date of birth",
  address: "Address",
  city: "City",
  zip: "ZIP",
  gender: "Gender",
};

export const LABEL_TEXT: Record<MatchLabel, string> = {
  match: "Likely match",
  review: "Needs review",
  "no-match": "Not a match",
};
