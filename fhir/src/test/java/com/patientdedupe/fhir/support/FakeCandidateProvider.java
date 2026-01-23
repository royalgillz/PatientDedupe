package com.patientdedupe.fhir.support;

import com.patientdedupe.fhir.CandidateLookupException;
import com.patientdedupe.fhir.CandidateProvider;
import com.patientdedupe.fhir.PatientRecord;
import com.patientdedupe.fhir.SourceRecord;
import java.util.List;

// A candidate provider a test can preload with rows, or set to fail as if the index were
// unreachable, so the service's "no matches" and "index down" paths can both be exercised.
public class FakeCandidateProvider implements CandidateProvider {

  private final List<SourceRecord> rows;
  private final boolean fail;

  private FakeCandidateProvider(List<SourceRecord> rows, boolean fail) {
    this.rows = rows;
    this.fail = fail;
  }

  public static FakeCandidateProvider returning(List<SourceRecord> rows) {
    return new FakeCandidateProvider(rows, false);
  }

  public static FakeCandidateProvider failing() {
    return new FakeCandidateProvider(List.of(), true);
  }

  @Override
  public List<SourceRecord> candidatesFor(PatientRecord probe) {
    if (fail) {
      throw new CandidateLookupException("index unreachable", new RuntimeException("boom"));
    }
    return rows;
  }
}
