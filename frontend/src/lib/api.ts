// Typed client for the PatientDedupe API. In dev, Vite proxies /api to the Node
// server; in production the same server serves both, so requests stay same-origin.

export type Band = "match" | "review" | "no-match";

export interface SourceRecord {
  id: number;
  source_system: string;
  mrn: string;
  first_name: string;
  last_name: string;
  dob: string;
  gender: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  person_key: number | null;
  created_at: string;
}

export interface FieldScore {
  field: string;
  similarity: number;
  weight: number;
  detail: string;
}

export interface Pair {
  id: number;
  score: number;
  band: Band;
  status: "pending" | "merged" | "not_a_match" | "need_info";
  is_true_duplicate: boolean | null;
  created_at: string;
  reasons: FieldScore[];
  record_a: SourceRecord;
  record_b: SourceRecord;
}

export interface Reviewer {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface BlockingStats {
  all_pairs: number;
  candidate_pairs: number;
  reduction: number;
  true_duplicates: number;
  captured: number;
  recall: number;
  generated_at: string;
}

export interface DashboardData {
  blocking: BlockingStats | null;
  records: number;
  persons: number;
  duplicateRate: number;
  pending: number;
  merged: number;
  autoMergeEligible: number;
  totalPairs: number;
  byStatus: { status: string; n: number }[];
  byBand: { band: Band; n: number }[];
  bySource: { source_system: string; n: number }[];
  histogram: { bucket: number; n: number }[];
}

export interface AuditEntry {
  id: number;
  ts: string;
  actor: string;
  action: string;
  pair_id: number | null;
  record_a_id: number | null;
  record_b_id: number | null;
  score: number | null;
  reason_code: string | null;
  note: string | null;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((msg as { error?: string }).error ?? "request failed");
  }
  return res.json() as Promise<T>;
}

export const api = {
  dashboard: () => get<DashboardData>("/dashboard"),
  reviewers: () => get<Reviewer[]>("/reviewers"),
  audit: () => get<AuditEntry[]>("/audit?limit=300"),
  search: (q: string) => get<SourceRecord[]>(`/search?q=${encodeURIComponent(q)}`),
  pair: (id: number) => get<Pair>(`/pairs/${id}`),
  queue: (params: { status?: string; minScore?: number; band?: string; q?: string }) => {
    const sp = new URLSearchParams();
    if (params.status) sp.set("status", params.status);
    if (params.minScore != null) sp.set("minScore", String(params.minScore));
    if (params.band) sp.set("band", params.band);
    if (params.q) sp.set("q", params.q);
    return get<Pair[]>(`/queue?${sp.toString()}`);
  },
  decide: async (
    id: number,
    body: { action: "merge" | "not_a_match" | "need_info"; reviewerId: number; reasonCode?: string; note?: string },
  ) => {
    const res = await fetch(`/api/pairs/${id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const msg = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((msg as { error?: string }).error ?? "decision failed");
    }
    return res.json() as Promise<{ ok: boolean; status: string; golden?: { enterprise_id: string } }>;
  },
  unmerge: (pairId: number, reviewerId: number, note?: string) =>
    post<{ ok: boolean; status: string }>(`/pairs/${pairId}/unmerge`, { reviewerId, note }),
  autoMerge: (reviewerId: number) =>
    post<{ ok: boolean; merged: number }>("/auto-merge", { reviewerId }),
};

export const bandLabel: Record<Band, string> = {
  match: "Likely match",
  review: "Needs review",
  "no-match": "Unlikely match",
};
