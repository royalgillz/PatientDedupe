// Types for the Emscripten-generated matcher.js module. The .js file is the real
// compiled artifact; this declaration just gives TypeScript the shape of it.
export interface PatientRecordInput {
  first_name: string;
  last_name: string;
  dob: string;
  gender: string;
  address: string;
  city: string;
  zip: string;
}

export interface MatcherModule {
  matchRecordsJson(a: PatientRecordInput, b: PatientRecordInput): string;
}

declare const createMatcherModule: (opts?: Record<string, unknown>) => Promise<MatcherModule>;
export default createMatcherModule;
