// How a golden record is assembled from two source records when a pair is merged.
//
// This is the single source of truth for survivorship. The merge endpoint uses it to
// build the record it writes, and the queue/pair endpoints attach its output so the
// console previews exactly what will be saved (no separate client-side copy that can
// drift from the server).
//
// The rules are field-aware on purpose. "Keep the longer string" is wrong for a date,
// a sex code, or an identifier:
//   - Names and address parts: keep the more complete value (longer non-empty, record
//     A wins ties), since a fuller value usually carries more signal.
//   - Critical fields (DOB, sex): if the two records disagree we do NOT silently pick
//     one. We keep record A's value and flag the conflict so the steward sees both and
//     decides, rather than a golden record quietly inheriting the wrong birth date.
//   - MRNs are per-source identifiers, not a value to reconcile: a golden record keeps
//     every member MRN, it never chooses one.

export interface SurvivorEntry {
  field: string;
  value: string;
  source: string;
  conflict: boolean;
  alt?: { value: string; source: string };
}

export interface Identifier {
  source: string;
  mrn: string;
}

export interface Survivorship {
  fields: SurvivorEntry[];
  identifiers: Identifier[];
}

type Rec = Record<string, unknown> & { source_system: string };

// Pick by completeness: more complete value wins, record A wins on a tie.
const COMPLETENESS_FIELDS = ["first_name", "last_name", "address", "city", "state", "zip"];
// Disagreement here is surfaced to the steward, never auto-resolved.
const CRITICAL_FIELDS = ["dob", "gender"];
// Display order for the surviving fields.
const FIELD_ORDER = ["first_name", "last_name", "dob", "gender", "address", "city", "state", "zip"];

const str = (r: Rec, f: string) => (r[f] ?? "").toString().trim();

export function computeSurvivorship(a: Rec, b: Rec): Survivorship {
  const fields: SurvivorEntry[] = [];

  for (const f of COMPLETENESS_FIELDS) {
    const av = str(a, f);
    const bv = str(b, f);
    const useA = av.length >= bv.length;
    fields.push({
      field: f,
      value: useA ? av : bv,
      source: useA ? a.source_system : b.source_system,
      conflict: false,
    });
  }

  for (const f of CRITICAL_FIELDS) {
    const av = str(a, f);
    const bv = str(b, f);
    const conflict = av !== "" && bv !== "" && av.toLowerCase() !== bv.toLowerCase();
    const entry: SurvivorEntry = {
      field: f,
      value: av || bv,
      source: av ? a.source_system : b.source_system,
      conflict,
    };
    // On a conflict, carry the other value so the UI can show both sides.
    if (conflict) entry.alt = { value: bv, source: b.source_system };
    fields.push(entry);
  }

  const identifiers: Identifier[] = [];
  for (const r of [a, b]) {
    const mrn = str(r, "mrn");
    if (mrn && !identifiers.some((i) => i.mrn === mrn)) {
      identifiers.push({ source: r.source_system, mrn });
    }
  }

  fields.sort((x, y) => FIELD_ORDER.indexOf(x.field) - FIELD_ORDER.indexOf(y.field));
  return { fields, identifiers };
}
