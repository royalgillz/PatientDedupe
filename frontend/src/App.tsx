import { useEffect, useMemo, useState } from "react";
import {
  matchRecords,
  preloadMatcher,
  FIELD_LABELS,
  LABEL_TEXT,
  type MatchResult,
  type PatientRecord,
} from "./lib/matcher";
import { PRESETS } from "./presets";

// Colour the per-field bars and values by how strong the similarity is.
function simClass(sim: number): "high" | "mid" | "low" {
  if (sim >= 0.85) return "high";
  if (sim >= 0.6) return "mid";
  return "low";
}

function RecordCard({
  side,
  title,
  record,
  onChange,
}: {
  side: "a" | "b";
  title: string;
  record: PatientRecord;
  onChange: (next: PatientRecord) => void;
}) {
  const set = (k: keyof PatientRecord, v: string) => onChange({ ...record, [k]: v });
  return (
    <div className="card">
      <div className="card-head">
        <span className={`dot ${side}`} />
        <h2>{title}</h2>
      </div>
      <div className="card-body">
        <div className="field-row">
          <div className="field">
            <label>{FIELD_LABELS.first_name}</label>
            <input value={record.first_name} onChange={(e) => set("first_name", e.target.value)} />
          </div>
          <div className="field">
            <label>{FIELD_LABELS.last_name}</label>
            <input value={record.last_name} onChange={(e) => set("last_name", e.target.value)} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label>{FIELD_LABELS.dob}</label>
            <input className="mono" value={record.dob} onChange={(e) => set("dob", e.target.value)} />
          </div>
          <div className="field">
            <label>{FIELD_LABELS.gender}</label>
            <input value={record.gender} onChange={(e) => set("gender", e.target.value)} />
          </div>
        </div>
        <div className="field full">
          <label>{FIELD_LABELS.address}</label>
          <input value={record.address} onChange={(e) => set("address", e.target.value)} />
        </div>
        <div className="field-row">
          <div className="field">
            <label>{FIELD_LABELS.city}</label>
            <input value={record.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="field">
            <label>{FIELD_LABELS.zip}</label>
            <input className="mono" value={record.zip} onChange={(e) => set("zip", e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultPanel({ result }: { result: MatchResult | null }) {
  if (!result) {
    return (
      <div className="result">
        <div className="loading">Loading the matching engine...</div>
      </div>
    );
  }

  const pct = Math.round(result.score * 100);
  const label = result.label;
  const tone = label === "match" ? "high" : label === "review" ? "mid" : "low";

  return (
    <div className="result">
      <div className="result-top">
        <div className="scorebox">
          <div className={`score-num t-${tone}`}>{result.score.toFixed(2)}</div>
          <div className="score-cap">WEIGHTED MATCH SCORE</div>
          <div className={`verdict ${label}`}>
            <span className="dot" />
            {LABEL_TEXT[label]}
          </div>
        </div>

        <div className="meter-wrap">
          <div className="meter-label">
            <span>0.00</span>
            <span>confidence</span>
            <span>1.00</span>
          </div>
          <div className="meter">
            <div className={`meter-fill ${label}`} style={{ width: `${pct}%` }} />
            <div className="tick" style={{ left: "70%" }} />
            <div className="tick" style={{ left: "90%" }} />
          </div>
          <div className="meter-scale">
            <span className="tick-label" style={{ left: "70%" }}>
              0.70 review
            </span>
            <span className="tick-label" style={{ left: "90%" }}>
              0.90 auto-merge
            </span>
          </div>
        </div>
      </div>

      <div className="breakdown">
        <div className="breakdown-title">Why: field-by-field reasons</div>
        {result.fields.map((f) => {
          const cls = simClass(f.similarity);
          return (
            <div className="frow" key={f.field}>
              <div className="fname">
                {FIELD_LABELS[f.field] ?? f.field}
                <span className="fweight">w {f.weight.toFixed(2)}</span>
              </div>
              <div className="fbar-wrap">
                <div className="fbar">
                  <div className={`fbar-fill s-${cls}`} style={{ width: `${Math.round(f.similarity * 100)}%` }} />
                </div>
                <span className="fdetail">{f.detail}</span>
              </div>
              <div className={`fval t-${cls}`}>{f.similarity.toFixed(2)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function App() {
  const [recordA, setRecordA] = useState<PatientRecord>(PRESETS[0].a);
  const [recordB, setRecordB] = useState<PatientRecord>(PRESETS[0].b);
  const [activePreset, setActivePreset] = useState<string | null>(PRESETS[0].id);
  const [result, setResult] = useState<MatchResult | null>(null);

  useEffect(() => {
    preloadMatcher();
  }, []);

  useEffect(() => {
    let cancelled = false;
    matchRecords(recordA, recordB).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [recordA, recordB]);

  const note = useMemo(() => PRESETS.find((p) => p.id === activePreset)?.note, [activePreset]);

  const loadPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setRecordA(p.a);
    setRecordB(p.b);
    setActivePreset(id);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-mark">P</div>
            <div>
              <div className="brand-name">PatientDedupe</div>
              <div className="brand-sub">Matching playground</div>
            </div>
          </div>
          <div className="topbar-right">
            <span className="tag">C++ via WebAssembly</span>
            <a
              className="ghost-link"
              href="https://github.com/royalgillz/PatientDedupe"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </div>
      </header>

      <main className="container">
        <div className="page-head">
          <h1>Compare two patient records</h1>
          <p>
            Edit either record and the score updates live. The same C++ matching engine used by the
            tests and benchmarks is compiled to WebAssembly and runs here in your browser, so nothing
            you type ever leaves the page.
          </p>
        </div>

        <div className="presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className={`chip ${activePreset === p.id ? "active" : ""}`}
              onClick={() => loadPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {note && (
          <p style={{ color: "var(--ink-3)", fontSize: 13, margin: "0 0 16px" }}>{note}</p>
        )}

        <div className="records">
          <RecordCard
            side="a"
            title="Record A"
            record={recordA}
            onChange={(r) => {
              setRecordA(r);
              setActivePreset(null);
            }}
          />
          <RecordCard
            side="b"
            title="Record B"
            record={recordB}
            onChange={(r) => {
              setRecordB(r);
              setActivePreset(null);
            }}
          />
        </div>

        <ResultPanel result={result} />

        <p className="foot">
          The weighted score combines Jaro-Winkler and edit-distance similarities with date-of-birth
          logic and a nickname table, all implemented by hand in C++. Thresholds: at or above 0.90 the
          pair is confident enough to auto-merge, between 0.70 and 0.90 it goes to a human reviewer,
          and below 0.70 it is treated as two different people. No real patient data is used; records
          come from the open-source Synthea generator.
        </p>
      </main>
    </div>
  );
}
