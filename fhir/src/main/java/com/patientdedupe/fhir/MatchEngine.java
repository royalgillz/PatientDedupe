package com.patientdedupe.fhir;

// The matching engine, as the FHIR service sees it. The real implementation runs the
// C++ engine compiled to WebAssembly inside the JVM; tests substitute a fake. Scoring
// two records must be safe to call from many threads at once.
public interface MatchEngine {

  MatchResult score(PatientRecord a, PatientRecord b);
}
