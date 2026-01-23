package com.patientdedupe.fhir.support;

import com.patientdedupe.fhir.MatchEngine;
import com.patientdedupe.fhir.MatchResult;
import com.patientdedupe.fhir.PatientRecord;
import java.util.List;
import java.util.Map;

// A stand-in engine for service tests: it returns a preset result keyed by the
// candidate's last name, so a test can drive scoring, filtering, and sorting without the
// real wasm. Anything not in the map scores as a no-match.
public class FakeMatchEngine implements MatchEngine {

  private final Map<String, MatchResult> byLastName;

  public FakeMatchEngine(Map<String, MatchResult> byLastName) {
    this.byLastName = byLastName;
  }

  @Override
  public MatchResult score(PatientRecord a, PatientRecord b) {
    return byLastName.getOrDefault(b.lastName(), new MatchResult(0.0, "no-match", List.of()));
  }
}
