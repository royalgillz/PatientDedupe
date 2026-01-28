import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { AlertTriangle, ScrollText, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { api, type AuditEntry } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import { useReviewer } from "@/lib/reviewer";
import { cn } from "@/lib/utils";

const ACTION_TONE = { merge: "match", not_a_match: "miss", need_info: "review", unmerge: "neutral", reopen: "neutral" } as const;
const ACTION_LABEL: Record<string, string> = {
  merge: "Merged",
  not_a_match: "Not a match",
  need_info: "Need info",
  unmerge: "Unmerged",
  reopen: "Reopened",
};

const col = createColumnHelper<AuditEntry>();

// @spec CONSOLE-007, CONSOLE-009, CONSOLE-015
export default function Audit() {
  const { current } = useReviewer();
  const isLead = current?.role === "lead";
  const qc = useQueryClient();
  const { data = [], isLoading, isError, refetch } = useQuery({ queryKey: ["audit"], queryFn: api.audit });
  const [target, setTarget] = useState<AuditEntry | null>(null);

  // Whether a merge can still be reversed comes from the pair's live status, carried on
  // the row by the API, not from scanning the (possibly truncated) audit window.
  const canUnmerge = (e: AuditEntry) =>
    e.action === "merge" && e.pair_id != null && e.pair_status === "merged";

  const unmerge = useMutation({
    mutationFn: (e: AuditEntry) => api.unmerge(e.pair_id!, current!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit"] });
      qc.invalidateQueries({ queryKey: ["queue"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Merge reversed", { description: "The records are separate again and the pair is back in the queue." });
      setTarget(null);
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const columns = useMemo(
    () => [
      col.accessor("ts", {
        header: "When",
        cell: (c) => <span className="tnum text-ink-2" title={formatDateTime(c.getValue())}>{relativeTime(c.getValue())}</span>,
      }),
      col.accessor("actor", { header: "Reviewer", cell: (c) => <span className="font-medium text-ink">{c.getValue()}</span> }),
      col.accessor("action", {
        header: "Action",
        cell: (c) => {
          const a = c.getValue();
          return <Badge tone={ACTION_TONE[a as keyof typeof ACTION_TONE] ?? "neutral"}>{ACTION_LABEL[a] ?? a}</Badge>;
        },
      }),
      col.accessor("pair_id", { header: "Task", cell: (c) => <span className="tnum text-ink-2">TASK-{String(c.getValue()).padStart(4, "0")}</span> }),
      col.accessor("score", {
        header: "Score",
        cell: (c) => <span className="tnum text-ink-2">{c.getValue() != null ? Number(c.getValue()).toFixed(2) : "-"}</span>,
      }),
      col.accessor("reason_code", { header: "Reason", cell: (c) => <span className="text-ink-2">{c.getValue() ?? "-"}</span> }),
      col.accessor("note", {
        header: "Note",
        cell: (c) => {
          const v = c.getValue();
          return v ? (
            <span className="block max-w-[260px] truncate text-ink-3" title={v}>{v}</span>
          ) : (
            <span className="text-ink-3">-</span>
          );
        },
      }),
      col.display({
        id: "actions",
        header: "",
        cell: (c) =>
          canUnmerge(c.row.original) ? (
            <Button
              variant="ghost"
              className="h-7 px-2 text-[12px]"
              disabled={!isLead}
              title={isLead ? undefined : "A lead reviewer is required to reverse a merge"}
              onClick={() => setTarget(c.row.original)}
              aria-label={`Unmerge TASK-${String(c.row.original.pair_id).padStart(4, "0")}`}
            >
              <Undo2 className="size-3.5" /> Unmerge
            </Button>
          ) : null,
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, isLead],
  );

  const table = useReactTable({ data, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Audit log</h1>
        <p className="mt-1 text-sm text-ink-2">Every steward decision, who made it, and why. This is the trust surface. A merge can be reversed here.</p>
      </div>

      <div className="overflow-x-auto rounded-card border bg-surface shadow-[0_1px_2px_rgba(40,33,20,0.05)]">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b bg-app">
                {hg.headers.map((h) => (
                  <th key={h.id} className={cn("px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-3", h.column.id === "score" && "text-right")}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-ink-3">Loading...</td></tr>
            ) : isError ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  <AlertTriangle className="mx-auto mb-2 size-6 text-miss" />
                  <div className="mb-3 text-[13px] text-ink-2">Could not load the audit log.</div>
                  <Button variant="outline" onClick={() => refetch()}>Retry</Button>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  <ScrollText className="mx-auto mb-2 size-6 text-ink-3" />
                  <div className="text-[13px] text-ink-2">No decisions yet. Merge or reject a pair in the queue.</div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b transition-colors last:border-0 hover:bg-subtle">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className={cn("px-4 py-2.5 align-top", cell.column.id === "score" && "text-right")}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {target && (
        <Dialog open onOpenChange={(o) => !o && setTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogTitle>Reverse this merge?</DialogTitle>
            <DialogDescription>
              TASK-{String(target.pair_id).padStart(4, "0")} will be split back into two separate records and returned to
              the review queue. This is recorded in the audit log.
            </DialogDescription>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setTarget(null)}>Cancel</Button>
              <Button variant="brand" disabled={unmerge.isPending} onClick={() => unmerge.mutate(target)}>
                Confirm unmerge
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
