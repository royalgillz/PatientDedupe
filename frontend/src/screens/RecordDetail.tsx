import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, Link2, User } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, type SourceRecord } from "@/lib/api";
import { FIELD_LABELS, formatDate } from "@/lib/format";

const FIELDS = ["first_name", "last_name", "dob", "gender", "address", "city", "state", "zip", "mrn", "source_system"];

function RecordCard({ record, title }: { record: SourceRecord; title?: string }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b bg-app px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-full bg-brand-subtle text-brand-ink">
            <User className="size-4" />
          </div>
          <span className="text-[13px] font-semibold text-ink">{title ?? `${record.first_name} ${record.last_name}`}</span>
        </div>
        <Badge tone="neutral">{record.source_system}</Badge>
      </div>
      <dl className="divide-y">
        {FIELDS.map((f) => (
          <div key={f} className="grid grid-cols-[120px_1fr] gap-2 px-4 py-1.5">
            <dt className="text-[12px] text-ink-3">{FIELD_LABELS[f] ?? f}</dt>
            <dd className="text-[13px] text-ink">
              {f === "dob"
                ? formatDate((record as unknown as Record<string, string>)[f])
                : (record as unknown as Record<string, string>)[f] || "-"}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

// @spec CONSOLE-014, CONSOLE-015
export default function RecordDetail() {
  const { id } = useParams();
  const recordId = Number(id);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["record", recordId],
    queryFn: () => api.record(recordId),
    enabled: Number.isFinite(recordId),
  });

  return (
    <div className="mx-auto max-w-[920px] space-y-5 p-4 md:p-6">
      <Link to="/search" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink">
        <ChevronLeft className="size-4" /> Back to search
      </Link>

      {isLoading ? (
        <div className="space-y-3">
          <Card className="h-48 animate-pulse" />
        </div>
      ) : isError || !data ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <AlertTriangle className="size-7 text-miss" />
          <div className="text-[14px] font-medium text-ink">Could not load this record.</div>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </Card>
      ) : (
        <>
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight text-ink">
              {data.record.first_name} {data.record.last_name}
            </h1>
            <p className="mt-1 text-sm text-ink-2">
              The selected record and any other records currently resolved to the same patient.
            </p>
          </div>

          <RecordCard record={data.record} title="Selected record" />

          <div>
            <div className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-ink">
              <Link2 className="size-4 text-brand" />
              Linked records
              <span className="tnum text-[12px] font-normal text-ink-3">
                {data.linked.length} other{data.linked.length === 1 ? "" : "s"} on this patient
              </span>
            </div>
            {data.linked.length === 0 ? (
              <div className="rounded-card border border-dashed bg-surface p-8 text-center text-[13px] text-ink-3">
                No other records are linked to this patient yet.
              </div>
            ) : (
              <div className="space-y-3">
                {data.linked.map((r) => (
                  <Link key={r.id} to={`/records/${r.id}`} className="block focus-ring rounded-card">
                    <RecordCard record={r} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
