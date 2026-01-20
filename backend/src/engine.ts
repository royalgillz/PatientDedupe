import createMatcherModule from "./wasm/matcher.js";
import type { MatchResult, PatientRecord } from "./types.js";

// The C++ matching engine, compiled to WebAssembly, loaded once and reused. This is
// the same module the browser runs, so the API and the UI score pairs identically.
let modulePromise: ReturnType<typeof createMatcherModule> | null = null;

function load() {
  if (!modulePromise) modulePromise = createMatcherModule();
  return modulePromise;
}

export async function scorePair(a: PatientRecord, b: PatientRecord): Promise<MatchResult> {
  const mod = await load();
  return JSON.parse(mod.matchRecordsJson(a, b)) as MatchResult;
}
