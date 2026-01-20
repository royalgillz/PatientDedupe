import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon, User } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";

export default function Search() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";

  const { data = [], isLoading } = useQuery({
    queryKey: ["search", q],
    queryFn: () => api.search(q),
    enabled: q.length > 0,
  });

  return (
    <div className="mx-auto max-w-[920px] space-y-5 p-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Search patients</h1>
        <p className="mt-1 text-sm text-ink-2">Find a record across every source system by name or medical record number.</p>
      </div>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
        <input
          autoFocus
          defaultValue={q}
          onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {})}
          placeholder="Try a last name, for example Smith, or an MRN"
          className="h-11 w-full rounded-lg border bg-surface pl-10 pr-4 text-[15px] text-ink placeholder:text-ink-3 focus-ring"
        />
      </div>

      {q && (
        <div className="text-[12px] text-ink-3">
          {isLoading ? "Searching..." : `${data.length} record${data.length === 1 ? "" : "s"} for "${q}"`}
        </div>
      )}

      <div className="space-y-2">
        {data.map((r) => (
          <Card key={r.id} className="flex items-center gap-4 p-3.5">
            <div className="grid size-9 place-items-center rounded-full bg-brand-subtle text-brand-ink">
              <User className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium text-ink">{r.first_name} {r.last_name}</div>
              <div className="tnum text-[12px] text-ink-3">
                DOB {formatDate(r.dob)} · {r.gender} · {r.address}, {r.city} {r.zip}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge tone="neutral">{r.source_system}</Badge>
              <span className="tnum text-[11px] text-ink-3">{r.mrn}</span>
            </div>
          </Card>
        ))}
        {q && !isLoading && data.length === 0 && (
          <div className="rounded-card border border-dashed bg-surface p-10 text-center text-[13px] text-ink-3">
            No records match "{q}".
          </div>
        )}
      </div>
    </div>
  );
}
