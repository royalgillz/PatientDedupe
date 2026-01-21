import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { simTone } from "@/components/confidence";
import {
  matchRecords,
  preloadMatcher,
  FIELD_LABELS,
  LABEL_TEXT,
  type MatchResult,
  type PatientRecord,
} from "@/lib/matcher";
import { PRESETS } from "@/presets";
import { cn } from "@/lib/utils";

const TONE_FILL = { match: "bg-match", review: "bg-review", miss: "bg-miss" } as const;
const TONE_TEXT = { match: "text-match", review: "text-review", miss: "text-miss" } as const;
const FIELDS: (keyof PatientRecord)[] = ["first_name", "last_name", "dob", "gender", "address", "city", "zip"];

function RecordCard({ title, record, onChange }: { title: string; record: PatientRecord; onChange: (r: PatientRecord) => void }) {
  return (
    <Card className="p-4">
      <div className="mb-3 text-[13px] font-semibold text-ink">{title}</div>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <div key={f} className={cn("flex flex-col gap-1", f === "address" && "col-span-2")}>
            <label className="text-[11px] font-medium uppercase tracking-wide text-ink-3">{FIELD_LABELS[f]}</label>
            <Input value={record[f]} onChange={(e) => onChange({ ...record, [f]: e.target.value })} />
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Sandbox() {
  const [a, setA] = useState<PatientRecord>(PRESETS[0].a);
  const [b, setB] = useState<PatientRecord>(PRESETS[0].b);
  const [active, setActive] = useState<string | null>(PRESETS[0].id);
  const [result, setResult] = useState<MatchResult | null>(null);

  useEffect(() => { preloadMatcher(); }, []);
  useEffect(() => {
    let cancelled = false;
    matchRecords(a, b).then((r) => !cancelled && setResult(r));
    return () => { cancelled = true; };
  }, [a, b]);

  const load = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setA(p.a); setB(p.b); setActive(id);
  };

  const tone = result ? (result.label === "match" ? "match" : result.label === "review" ? "review" : "miss") : "review";

  return (
    <div className="mx-auto max-w-[1000px] space-y-5 p-4 md:p-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Matching sandbox</h1>
        <p className="mt-1 text-sm text-ink-2">
          Score any two records live. This runs the same C++ engine, compiled to WebAssembly, right in your browser.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => load(p.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
              active === p.id ? "border-transparent bg-brand-subtle text-brand-ink" : "bg-surface text-ink-2 hover:bg-subtle",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <RecordCard title="Record A" record={a} onChange={(r) => { setA(r); setActive(null); }} />
        <RecordCard title="Record B" record={b} onChange={(r) => { setB(r); setActive(null); }} />
      </div>

      {result && (
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <div className={cn("tnum text-4xl font-semibold", TONE_TEXT[tone])}>{result.score.toFixed(2)}</div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-ink-3">Weighted match score</div>
              <div className={cn("text-[14px] font-semibold", TONE_TEXT[tone])}>{LABEL_TEXT[result.label]}</div>
            </div>
          </div>
          <div className="mt-4 space-y-1.5">
            {result.fields.map((f) => {
              const t = simTone(f.similarity);
              return (
                <div key={f.field} className="grid grid-cols-[110px_1fr_44px] items-center gap-3 border-b py-2 last:border-0 md:grid-cols-[140px_1fr_120px_44px]">
                  <span className="text-[13px] text-ink">{FIELD_LABELS[f.field] ?? f.field}</span>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div className={cn("h-full rounded-full", TONE_FILL[t])} style={{ width: `${Math.round(f.similarity * 100)}%` }} />
                  </div>
                  <span className="hidden text-[12px] text-ink-3 md:block">{f.detail}</span>
                  <span className={cn("tnum text-right text-[13px] font-medium", TONE_TEXT[t])}>{f.similarity.toFixed(2)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
