package com.patientdedupe.fhir;

import java.util.List;

// Finds the index records worth scoring against a probe. The production implementation
// runs the single-probe blocking query against Postgres; a failure to reach the index
// is signalled with CandidateLookupException so the service can tell "no matches" apart
// from "the index is down".
public interface CandidateProvider {

  List<SourceRecord> candidatesFor(PatientRecord probe);
}
