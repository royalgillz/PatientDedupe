import type { Band } from "@/lib/api";
import { bandLabel } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const bandTone = (band: Band): "match" | "review" | "miss" =>
  band === "match" ? "match" : band === "review" ? "review" : "miss";

// per-field similarity tone: strong agreement, partial, or conflict
export const simTone = (sim: number): "match" | "review" | "miss" =>
  sim >= 0.85 ? "match" : sim >= 0.6 ? "review" : "miss";

const FILL: Record<"match" | "review" | "miss", string> = {
  match: "bg-match",
  review: "bg-review",
  miss: "bg-miss",
};

// A small score with a colored micro-bar; the queue's default sort signal.
export function ScoreBar({ value, band, width = 56 }: { value: number; band: Band; width?: number }) {
  const tone = bandTone(band);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 rounded-full bg-muted" style={{ width }}>
        <div className={cn("h-full rounded-full", FILL[tone])} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className="tnum text-[13px] font-medium text-ink">{value.toFixed(2)}</span>
    </div>
  );
}

export function ConfidenceBadge({ score, band }: { score: number; band: Band }) {
  const tone = bandTone(band);
  return (
    <Badge tone={tone} className="gap-2">
      <span className={cn("size-1.5 rounded-full", FILL[tone])} />
      {bandLabel[band]} <span className="tnum opacity-80">· {score.toFixed(2)}</span>
    </Badge>
  );
}
