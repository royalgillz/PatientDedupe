import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Inbox, Users, Database, GitMerge } from "lucide-react";
import type { ElementType } from "react";
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

function Stat({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: ElementType }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-ink-3">
        <Icon className="size-4" />
        <span className="text-[12px] font-medium">{label}</span>
      </div>
      <div className="tnum mt-2 text-2xl font-semibold tracking-tight text-ink">{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-ink-3">{sub}</div>}
    </Card>
  );
}

export default function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: api.dashboard });

  return (
    <div className="mx-auto max-w-[1120px] space-y-6 p-6">
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
            <Card className="relative overflow-hidden p-5 lg:row-span-1">
              <div className="flex items-center gap-2 text-brand-ink">
                <Inbox className="size-4" />
                <span className="text-[12px] font-semibold uppercase tracking-wide">Pending review</span>
              </div>
              <div className="tnum mt-3 text-5xl font-semibold tracking-tight text-ink">{data.pending}</div>
              <div className="mt-1 text-[13px] text-ink-2">candidate pairs awaiting a steward</div>
              <Link
                to="/queue"
                className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:text-brand-hover"
              >
                Open the review queue <ArrowUpRight className="size-3.5" />
              </Link>
              <div className="pointer-events-none absolute -right-6 -top-6 size-28 rounded-full bg-brand-subtle opacity-60" />
            </Card>

            <div className="grid grid-cols-2 gap-4 lg:col-span-2">
              <Stat label="Unique patients" value={data.persons.toLocaleString()} sub="distinct people" icon={Users} />
              <Stat label="Source records" value={data.records.toLocaleString()} sub="across all systems" icon={Database} />
              <Stat label="Auto-merge eligible" value={data.autoMergeEligible.toLocaleString()} sub="score at or above 0.90" icon={GitMerge} />
              <Stat label="Est. duplicate rate" value={pct(data.duplicateRate)} sub="records beyond unique people" icon={Users} />
            </div>
          </div>

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
