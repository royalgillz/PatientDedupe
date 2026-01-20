// Shared shapes for the API. PatientRecord matches what the WASM engine expects.
export interface PatientRecord {
  first_name: string;
  last_name: string;
  dob: string;
  gender: string;
  address: string;
  city: string;
  zip: string;
}

export interface FieldScore {
  field: string;
  similarity: number;
  weight: number;
  detail: string;
}

export interface MatchResult {
  score: number;
  label: "match" | "review" | "no-match";
  fields: FieldScore[];
}
