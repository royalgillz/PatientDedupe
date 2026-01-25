import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Check, ChevronLeft, HelpCircle, Inbox, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { toast } from "sonner";
import { ConfidenceBadge, simTone } from "@/components/confidence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Select, Textarea } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type Band, type FieldScore, type Pair, type SourceRecord } from "@/lib/api";
import { FIELD_LABELS, formatDate, formatDateTime, relativeTime } from "@/lib/format";
import { useReviewer } from "@/lib/reviewer";
import { cn } from "@/lib/utils";

const COMPARE_FIELDS = ["first_name", "last_name", "dob", "gender", "address", "city", "zip", "mrn", "source_system"];
const TONE_TEXT = { match: "text-match", review: "text-review", miss: "text-miss" } as const;
const TONE_FILL = { match: "bg-match", review: "bg-review", miss: "bg-miss" } as const;

const REASON_CODES: Record<string, string[]> = {
  merge: ["Same person, confident", "Same person, reconciled conflicts", "Matched on identifiers"],
  not_a_match: ["Different people", "Same name, different person", "Insufficient similarity"],
  need_info: ["Awaiting identifier", "Conflicting critical field", "Escalated to lead"],
};

type Action = "merge" | "not_a_match" | "need_info";

function fullName(r: SourceRecord) {
  return `${r.first_name} ${r.last_name}`.trim();
}

// One selectable row in the queue rail.
function QueueRow({ pair, active, onClick }: { pair: Pair; active: boolean; onClick: () => void }) {
  const tone = pair.band === "match" ? "match" : pair.band === "review" ? "review" : "miss";
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full border-l-2 border-b px-4 py-3 text-left transition-colors",
        active ? "border-l-brand bg-brand-subtle/60" : "border-l-transparent hover:bg-subtle",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-[13.5px] font-medium text-ink">
          {fullName(pair.record_a)} <span className="text-ink-3">/</span> {fullName(pair.record_b)}
        </div>
        <span className={cn("size-2 shrink-0 rounded-full", TONE_FILL[tone])} />
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="truncate text-[12px] text-ink-3">
          {pair.record_a.source_system} · {pair.record_b.source_system}
        </div>
        <div className="tnum text-[12.5px] font-semibold text-ink">{pair.score.toFixed(2)}</div>
      </div>
    </button>
  );
}

function ComparisonRow({ field, a, b, fs }: { field: string; a: SourceRecord; b: SourceRecord; fs?: FieldScore }) {
  const av = (a as unknown as Record<string, string>)[field] ?? "";
  const bv = (b as unknown as Record<string, string>)[field] ?? "";
  const equal = av.toLowerCase() === bv.toLowerCase();
  const tone = fs ? simTone(fs.similarity) : equal ? "match" : "miss";
  const informational = !fs; // mrn / source_system are expected to differ
  const mono = field === "zip" || field === "mrn";
  const show = (v: string) => (!v ? "-" : field === "dob" ? formatDate(v) : v);

  return (
    <div className="grid grid-cols-[130px_1fr_1fr_110px] items-center gap-3 border-b py-2.5 last:border-b-0">
      <div className="flex items-center gap-2 text-[12.5px] text-ink-3">
        <span className="flex w-1.5 shrink-0 justify-center">
          {!informational && <span className={cn("size-1.5 rounded-full", TONE_FILL[tone])} />}
        </span>
        {FIELD_LABELS[field] ?? field}
      </div>
      <div className={cn("text-[13.5px] text-ink", mono && "tnum font-mono text-[12.5px]")}>{show(av)}</div>
      <div
        className={cn(
          "text-[13.5px]",
          mono && "tnum font-mono text-[12.5px]",
          informational ? "text-ink" : equal ? "text-ink" : cn("font-medium", TONE_TEXT[tone]),
        )}
      >
        {show(bv)}
      </div>
      <div className="flex items-center justify-end gap-2">
        {fs ? (
          <>
            <div className="h-1.5 w-12 rounded-full bg-muted">
              <div className={cn("h-full rounded-full", TONE_FILL[tone])} style={{ width: `${Math.round(fs.similarity * 100)}%` }} />
            </div>
            <span className={cn("tnum w-8 text-right text-[12px] font-medium", TONE_TEXT[tone])}>{fs.similarity.toFixed(2)}</span>
          </>
        ) : (
          <span className="text-[12px] text-ink-3">context</span>
        )}
      </div>
    </div>
  );
}

function whySummary(reasons: FieldScore[]) {
  const agree = reasons.filter((r) => r.similarity >= 0.9).map((r) => FIELD_LABELS[r.field] ?? r.field);
  const conflict = reasons.filter((r) => r.similarity < 0.6).map((r) => FIELD_LABELS[r.field] ?? r.field);
  return { agree, conflict };
}

function survivorship(a: SourceRecord, b: SourceRecord) {
  return COMPARE_FIELDS.filter((f) => f !== "source_system" && f !== "mrn").map((f) => {
    const av = (a as unknown as Record<string, string>)[f] ?? "";
    const bv = (b as unknown as Record<string, string>)[f] ?? "";
    const useA = av.length >= bv.length;
    return { field: f, value: useA ? av : bv, source: useA ? a.source_system : b.source_system };
  });
}

function DecisionDialog({
  pair, action, onClose, onDecided,
}: { pair: Pair; action: Action; onClose: () => void; onDecided: () => void }) {
  const { current } = useReviewer();
  const qc = useQueryClient();
  const [reasonCode, setReasonCode] = useState(REASON_CODES[action][0]);
  const [note, setNote] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      api.decide(pair.id, { action, reviewerId: current!.id, reasonCode, note }),
    onSuccess: (res) => {
      onDecided();
      qc.invalidateQueries({ queryKey: ["queue"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["audit"] });
      const verb = action === "merge" ? "Merged" : action === "not_a_match" ? "Marked not a match" : "Flagged for more info";
      toast.success(`${verb}: ${fullName(pair.record_a)} / ${fullName(pair.record_b)}`, {
        description: res.golden ? `Golden record ${res.golden.enterprise_id} created.` : `Recorded by ${current!.name}.`,
      });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const title = action === "merge" ? "Merge into one golden record" : action === "not_a_match" ? "Mark as not a match" : "Flag for more information";
  const surv = action === "merge" ? survivorship(pair.record_a, pair.record_b) : [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {fullName(pair.record_a)} ({pair.record_a.source_system}) and {fullName(pair.record_b)} ({pair.record_b.source_system}), score {pair.score.toFixed(2)}.
        </DialogDescription>

        {action === "merge" && (
          <div className="mt-4 rounded-md border bg-app">
            <div className="border-b px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
              Surviving golden record
            </div>
            <div className="divide-y">
              {surv.map((s) => (
                <div key={s.field} className="grid grid-cols-[120px_1fr_auto] items-center gap-2 px-3 py-1.5">
                  <span className="text-[12px] text-ink-3">{FIELD_LABELS[s.field]}</span>
                  <span className="text-[13px] text-ink">{s.value || "-"}</span>
                  <Badge tone="neutral" className="text-[11px]">from {s.source}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-ink-2">Reason code</label>
            <Select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} aria-label="Reason code" className="w-full">
              {REASON_CODES[action].map((r) => <option key={r}>{r}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-ink-2">Note (recorded in the audit log)</label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note for the audit trail" placeholder="Optional context for the audit trail" />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="brand"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {action === "merge" ? "Confirm merge" : action === "not_a_match" ? "Confirm not a match" : "Flag for info"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDetail({ pair, onDecided, onBack }: { pair: Pair; onDecided: () => void; onBack: () => void }) {
  const { current } = useReviewer();
  const [action, setAction] = useState<Action | null>(null);
  const reasonsByField = useMemo(() => Object.fromEntries(pair.reasons.map((r) => [r.field, r])), [pair.reasons]);
  const { agree, conflict } = whySummary(pair.reasons);

  // Single-key decisions, so a steward never needs the mouse to work the queue.
  useHotkeys("m", () => current && setAction("merge"), [current]);
  useHotkeys("n", () => current && setAction("not_a_match"), [current]);
  useHotkeys("i", () => current && setAction("need_info"), [current]);

  const conflictText = conflict.length
    ? ` ${conflict.join(" and ")} ${conflict.length > 1 ? "differ" : "differs"}.`
    : "";
  const rec: Record<Band, { text: string; tone: "match" | "review" | "miss" }> = {
    match: { text: "Recommended: merge. High confidence these are the same person.", tone: "match" },
    review: { text: `Likely the same person.${conflictText} Confirm before merging.`, tone: "review" },
    "no-match": { text: `Likely not a match.${conflictText} Confirm before any merge.`, tone: "miss" },
  };
  const r = rec[pair.band];

  return (
    <div className="flex h-full flex-col">
      {/* Zone 1: context header */}
      <div className="sticky top-0 z-10 border-b bg-surface/90 px-4 py-4 backdrop-blur md:px-6">
        <button className="mb-2 flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-ink md:hidden" onClick={onBack}>
          <ChevronLeft className="size-4" /> Back to queue
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <ConfidenceBadge score={pair.score} band={pair.band} />
          <span className="tnum text-[12px] text-ink-3">TASK-{String(pair.id).padStart(4, "0")}</span>
          <span className="text-[12px] text-ink-3">·</span>
          <span className="text-[12px] text-ink-3">{pair.record_a.source_system} ↔ {pair.record_b.source_system}</span>
          <span className="tnum ml-auto text-[12px] text-ink-3" title={formatDateTime(pair.created_at)}>
            opened {relativeTime(pair.created_at)}
          </span>
        </div>
        <div className={cn("mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-[13px]",
          r.tone === "match" ? "bg-match-subtle text-match" : r.tone === "review" ? "bg-review-subtle text-review" : "bg-miss-subtle text-miss")}>
          <Sparkles className="size-4" />
          {r.text}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-5 md:px-6">
        <Tabs defaultValue="comparison">
          <TabsList>
            <TabsTrigger value="comparison">Comparison</TabsTrigger>
            <TabsTrigger value="scores">Field scores</TabsTrigger>
            <TabsTrigger value="records">Raw records</TabsTrigger>
          </TabsList>

          <TabsContent value="comparison">
            <div className="overflow-x-auto">
              <div className="min-w-[540px] rounded-md border">
                <div className="grid grid-cols-[130px_1fr_1fr_110px] gap-3 border-b bg-app py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  <div className="pl-3">Field</div>
                  <div>Record A</div>
                  <div>Record B</div>
                  <div className="text-right">Similarity</div>
                </div>
                <div className="px-3">
                  {COMPARE_FIELDS.map((f) => (
                    <ComparisonRow key={f} field={f} a={pair.record_a} b={pair.record_b} fs={reasonsByField[f]} />
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-md border bg-match-subtle/40 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-match">
                  <Check className="size-3.5" /> Agrees on
                </div>
                <div className="text-[13px] text-ink-2">{agree.length ? agree.join(", ") : "no strong agreement"}</div>
              </div>
              <div className="rounded-md border bg-miss-subtle/40 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-miss">
                  <X className="size-3.5" /> Conflicts on
                </div>
                <div className="text-[13px] text-ink-2">{conflict.length ? conflict.join(", ") : "no hard conflicts"}</div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="scores">
            <div className="space-y-1">
              {pair.reasons.map((fs) => {
                const tone = simTone(fs.similarity);
                return (
                  <div key={fs.field} className="grid grid-cols-[150px_1fr_70px] items-center gap-3 border-b py-2 last:border-0">
                    <div className="text-[13px] text-ink">
                      {FIELD_LABELS[fs.field] ?? fs.field}
                      <span className="tnum ml-2 text-[11px] text-ink-3">w {fs.weight.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 flex-1 rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", TONE_FILL[tone])} style={{ width: `${Math.round(fs.similarity * 100)}%` }} />
                      </div>
                      <span className="text-[12px] text-ink-3">{fs.detail}</span>
                    </div>
                    <div className={cn("tnum text-right text-[13px] font-medium", TONE_TEXT[tone])}>{fs.similarity.toFixed(2)}</div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="records">
            <div className="grid grid-cols-2 gap-4">
              {[pair.record_a, pair.record_b].map((rr, i) => (
                <div key={rr.id} className="rounded-md border">
                  <div className="flex items-center justify-between border-b bg-app px-3 py-2">
                    <span className="text-[12px] font-semibold text-ink">Record {i === 0 ? "A" : "B"}</span>
                    <Badge tone="neutral">{rr.source_system}</Badge>
                  </div>
                  <dl className="divide-y">
                    {COMPARE_FIELDS.map((f) => (
                      <div key={f} className="grid grid-cols-[110px_1fr] gap-2 px-3 py-1.5">
                        <dt className="text-[12px] text-ink-3">{FIELD_LABELS[f] ?? f}</dt>
                        <dd className="text-[13px] text-ink">
                          {f === "dob"
                            ? formatDate((rr as unknown as Record<string, string>)[f])
                            : (rr as unknown as Record<string, string>)[f] || "-"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Zone 3: action bar */}
      <div className="flex items-center gap-2 border-t bg-surface px-4 py-3 md:px-6">
        {!current && <span className="text-[12px] text-miss">Select a reviewer to act</span>}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" disabled={!current} onClick={() => setAction("need_info")}>
            <HelpCircle className="size-4" /> Need info
          </Button>
          <Button variant="outline" disabled={!current} onClick={() => setAction("not_a_match")}>
            <X className="size-4" /> Not a match
          </Button>
          <Button variant="brand" disabled={!current} onClick={() => setAction("merge")}>
            <Check className="size-4" /> Merge
          </Button>
        </div>
      </div>

      {action && <DecisionDialog pair={pair} action={action} onClose={() => setAction(null)} onDecided={onDecided} />}
    </div>
  );
}

// @spec CONSOLE-001, CONSOLE-002, CONSOLE-003, CONSOLE-004, CONSOLE-005, CONSOLE-008, CONSOLE-011
export default function Workspace() {
  const [band, setBand] = useState("review");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: queue = [], isLoading } = useQuery({
    queryKey: ["queue", band, q],
    queryFn: () => api.queue({ status: "pending", band: band || undefined, q: q || undefined }),
  });

  useEffect(() => {
    if (!queue.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId != null && queue.some((p) => p.id === selectedId)) return;
    // Auto-open the first pair on desktop (two-pane). On phones, leave the list
    // showing so the steward picks a pair before the detail takes over the screen.
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    setSelectedId(desktop ? queue[0].id : null);
  }, [queue, selectedId]);

  const selected = queue.find((p) => p.id === selectedId) ?? null;

  const advance = () => {
    const idx = queue.findIndex((p) => p.id === selectedId);
    const next = queue[idx + 1] ?? queue[idx - 1] ?? null;
    setSelectedId(next ? next.id : null);
  };

  // j/k move through the queue, like a keyboard-first issue tracker.
  useHotkeys("j", () => {
    const idx = queue.findIndex((p) => p.id === selectedId);
    if (queue[idx + 1]) setSelectedId(queue[idx + 1].id);
  }, [queue, selectedId]);
  useHotkeys("k", () => {
    const idx = queue.findIndex((p) => p.id === selectedId);
    if (queue[idx - 1]) setSelectedId(queue[idx - 1].id);
  }, [queue, selectedId]);

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Left: queue rail */}
      <div className={cn("w-full flex-col border-r bg-surface md:w-[380px] md:shrink-0", selected ? "hidden md:flex" : "flex")}>
        <div className="space-y-2.5 border-b px-4 py-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-ink">Review queue</h2>
            <span className="tnum text-[12px] text-ink-3">
              {queue.length}{" "}
              {band === "review" ? "need review" : band === "match" ? "likely match" : band === "no-match" ? "unlikely" : "pending"}
            </span>
          </div>
          <div className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Filter the queue by name or MRN"
              placeholder="Filter by name or MRN"
              className="h-8 flex-1 rounded-md border bg-app px-2.5 text-[13px] text-ink placeholder:text-ink-3 focus-ring"
            />
            <Select value={band} onChange={(e) => setBand(e.target.value)} aria-label="Filter by confidence band" className="h-8 text-[13px]">
              <option value="">All bands</option>
              <option value="review">Needs review</option>
              <option value="match">Likely match</option>
              <option value="no-match">Unlikely</option>
            </Select>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-14 animate-pulse rounded-md bg-subtle" />)}
            </div>
          ) : queue.length ? (
            queue.map((p) => (
              <QueueRow key={p.id} pair={p} active={p.id === selectedId} onClick={() => setSelectedId(p.id)} />
            ))
          ) : (
            <div className="p-8 text-center text-[13px] text-ink-3">
              <Inbox className="mx-auto mb-2 size-6 text-ink-3" />
              No pending pairs match these filters.
            </div>
          )}
        </div>
      </div>

      {/* Right: detail */}
      <div className={cn("min-w-0 flex-1", selected ? "block" : "hidden md:block")}>
        {selected ? (
          <ReviewDetail key={selected.id} pair={selected} onDecided={advance} onBack={() => setSelectedId(null)} />
        ) : (
          <div className="grid h-full place-items-center text-center">
            <div className="text-ink-3">
              <ArrowLeftRight className="mx-auto mb-3 size-7" />
              <div className="text-[14px] font-medium text-ink-2">Select a candidate pair</div>
              <div className="text-[13px]">Pick a row from the queue to start adjudicating.</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
