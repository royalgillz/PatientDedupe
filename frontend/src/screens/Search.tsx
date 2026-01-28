import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Copy, Search as SearchIcon, User } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api, type SourceRecord } from "@/lib/api";
import { formatDate } from "@/lib/format";

// Records that share a name and birth date inside one result set are very likely the
// same person across systems - exactly the duplicate this product exists to catch - so
// we surface that hint right in the search results.
const dupKey = (r: SourceRecord) => `${r.first_name} ${r.last_name} ${r.dob}`.toLowerCase().trim();

// @spec CONSOLE-014, CONSOLE-015
export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";

  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["search", q],
    queryFn: () => api.search(q),
    enabled: q.length > 0,
  });

  const dupKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of data) counts.set(dupKey(r), (counts.get(dupKey(r)) ?? 0) + 1);
    return new Set([...counts].filter(([, n]) => n > 1).map(([k]) => k));
  }, [data]);

  return (
    <div className="mx-auto max-w-[920px] space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Search patients</h1>
        <p className="mt-1 text-sm text-ink-2">Find a record across every source system by name or medical record number.</p>
      </div>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <input
          autoFocus
          defaultValue={q}
          aria-label="Search patients by name or MRN"
          onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {})}
          placeholder="Try a last name, for example Smith, or an MRN"
          className="h-11 w-full rounded-lg border bg-surface pl-10 pr-4 text-[15px] text-ink placeholder:text-ink-3 focus-ring"
        />
      </div>

      {q && !isError && (
        <div className="text-[12px] text-ink-3">
          {isLoading ? "Searching..." : `${data.length} record${data.length === 1 ? "" : "s"} for "${q}"`}
        </div>
      )}

      {q && isError ? (
        <div className="rounded-card border bg-surface p-10 text-center">
          <AlertTriangle className="mx-auto mb-2 size-6 text-miss" />
          <div className="mb-3 text-[13px] text-ink-2">Search failed. Check the connection and try again.</div>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      ) : data.length ? (
        <Card className="divide-y overflow-hidden p-0">
          {data.map((r) => {
            const dup = dupKeys.has(dupKey(r));
            return (
              <Link
                key={r.id}
                to={`/records/${r.id}`}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-subtle focus-ring"
              >
                <div className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-subtle text-brand-ink">
                  <User className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-medium text-ink">{r.first_name} {r.last_name}</span>
                    {dup && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-review-subtle px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-review" title="Another result shares this name and birth date">
                        <Copy className="size-2.5" /> possible duplicate
                      </span>
                    )}
                  </div>
                  <div className="truncate text-[12px] text-ink-3">
                    DOB {formatDate(r.dob)} · {r.gender} · {r.address}, {r.city} {r.zip}
                  </div>
                </div>
                <div className="hidden shrink-0 text-right sm:block">
                  <Badge tone="neutral">{r.source_system}</Badge>
                </div>
                <span className="tnum hidden w-24 shrink-0 text-right text-[11px] text-ink-3 md:block">{r.mrn}</span>
                <ChevronRight className="size-4 shrink-0 text-ink-3" />
              </Link>
            );
          })}
        </Card>
      ) : (
        q && !isLoading && (
          <div className="rounded-card border border-dashed bg-surface p-10 text-center text-[13px] text-ink-3">
            No records match "{q}".
          </div>
        )
      )}
    </div>
  );
}
