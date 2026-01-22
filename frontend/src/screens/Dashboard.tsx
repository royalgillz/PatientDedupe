import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { api, type Band } from "@/lib/api";
import { pct } from "@/lib/format";

const BAND_COLOR: Record<Band, string> = {
  match: "#15803d",
  review: "#b45309",
  "no-match": "#b42318",
};
const BAND_NAME: Record<Band, string> = {
  match: "Likely match",
  review: "Needs review",
  "no-match": "Unlikely",
};

function bucketColor(bucket: number) {
  if (bucket >= 0.9) return BAND_COLOR.match;
  if (bucket >= 0.7) return BAND_COLOR.review;
  return BAND_COLOR["no-match"];
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{label}</div>
      <div className="tnum mt-2 text-2xl font-semibold tracking-tight text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-ink-3">{sub}</div>}
    </Card>
  );
}

// @spec CONSOLE-006
export default function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard });

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">Patient index overview</h1>
        <p className="mt-1 text-sm text-ink-2">
          The health of the master patient index, and where a steward should look next.
        </p>
      </div>

      {isLoading || !data ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Card key={i} className="h-28 animate-pulse" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* the one trusted number */}
            <Card className="flex flex-col p-5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-brand-ink">Pending review</div>
              <div className="tnum mt-2 text-5xl font-semibold tracking-tight text-ink">
                {data.pending.toLocaleString()}
              </div>
              <div className="mt-1 text-[13px] text-ink-2">candidate pairs awaiting a steward</div>
              <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px]">
                <span className="flex items-center gap-1.5 text-ink-2">
                  <span className="size-2 rounded-full" style={{ background: BAND_COLOR.review }} />
                  <span className="tnum font-medium text-ink">
                    {(data.byBand.find((b) => b.band === "review")?.n ?? 0).toLocaleString()}
                  </span>{" "}
                  need review
                </span>
                <span className="flex items-center gap-1.5 text-ink-2">
                  <span className="size-2 rounded-full" style={{ background: BAND_COLOR.match }} />
                  <span className="tnum font-medium text-ink">{data.autoMergeEligible.toLocaleString()}</span>{" "}
                  auto-merge ready
                </span>
              </div>
              <Link
                to="/queue"
                className="mt-auto inline-flex items-center gap-1 pt-5 text-[13px] font-medium text-brand hover:text-brand-hover"
              >
                Open the review queue <ArrowUpRight className="size-3.5" />
              </Link>
            </Card>

            <div className="grid grid-cols-2 gap-4 lg:col-span-2">
              <Stat label="Unique patients" value={data.persons.toLocaleString()} sub="distinct people" />
              <Stat label="Source records" value={data.records.toLocaleString()} sub="across all systems" />
              <Stat label="Auto-merge eligible" value={data.autoMergeEligible.toLocaleString()} sub="score at or above 0.95" />
              <Stat label="Est. duplicate rate" value={pct(data.duplicateRate)} sub="records beyond unique people" />
            </div>
          </div>

          {data.blocking && (
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-[13px] font-semibold text-ink">SQL blocking layer</div>
                  <div className="mt-0.5 text-[12px] text-ink-3">
                    Phonetic keys and partitioning cut how many pairs the matcher has to score.
                  </div>
                </div>
                <span className="tnum text-[11px] text-ink-3">
                  {data.blocking.candidate_pairs.toLocaleString()} of {data.blocking.all_pairs.toLocaleString()} possible pairs
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div>
                  <div className="tnum text-3xl font-semibold text-brand-ink">{(data.blocking.reduction * 100).toFixed(1)}%</div>
                  <div className="text-[12px] text-ink-3">fewer comparisons</div>
                </div>
                <div>
                  <div className="tnum text-3xl font-semibold text-ink">{pct(data.blocking.recall)}</div>
                  <div className="text-[12px] text-ink-3">of true duplicates still captured</div>
                </div>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <div className="text-[13px] font-semibold text-ink">Match score distribution</div>
              <div className="mt-0.5 text-[12px] text-ink-3">How confident the engine is across the current queue.</div>
              <div className="mt-4 h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.histogram} margin={{ left: -18, right: 8, top: 4 }}>
                    <XAxis dataKey="bucket" tickFormatter={(b) => Number(b).toFixed(2)} tick={{ fontSize: 11, fill: "#8a8475" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#8a8475" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(0,0,0,0.04)" }}
                      contentStyle={{ borderRadius: 8, border: "1px solid #e8e1d5", fontSize: 12 }}
                      labelFormatter={(b) => `score ${Number(b).toFixed(2)}`}
                    />
                    <Bar dataKey="n" radius={[3, 3, 0, 0]}>
                      {data.histogram.map((h, i) => <Cell key={i} fill={bucketColor(h.bucket)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-5">
              <div className="text-[13px] font-semibold text-ink">Queue by confidence band</div>
              <div className="mt-0.5 text-[12px] text-ink-3">Where human judgement is needed.</div>
              <div className="mt-2 h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.byBand} dataKey="n" nameKey="band" innerRadius={48} outerRadius={70} paddingAngle={2} strokeWidth={0}>
                      {data.byBand.map((b) => <Cell key={b.band} fill={BAND_COLOR[b.band]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e8e1d5", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 space-y-1.5">
                {data.byBand.map((b) => (
                  <div key={b.band} className="flex items-center gap-2 text-[12.5px]">
                    <span className="size-2.5 rounded-full" style={{ background: BAND_COLOR[b.band] }} />
                    <span className="text-ink-2">{BAND_NAME[b.band]}</span>
                    <span className="tnum ml-auto font-medium text-ink">{b.n}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <div className="text-[13px] font-semibold text-ink">Source records by system</div>
            <div className="mt-4 h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.bySource} layout="vertical" margin={{ left: 28, right: 16 }}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#8a8475" }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="source_system" width={90} tick={{ fontSize: 12, fill: "#595348" }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} contentStyle={{ borderRadius: 8, border: "1px solid #e8e1d5", fontSize: 12 }} />
                  <Bar dataKey="n" radius={[0, 4, 4, 0]} fill="#0e7c7b" barSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
