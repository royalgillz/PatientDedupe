package com.patientdedupe.fhir;

import ca.uhn.fhir.rest.server.exceptions.InvalidRequestException;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.Bundle.BundleEntryComponent;
import org.hl7.fhir.r4.model.Bundle.BundleEntrySearchComponent;
import org.hl7.fhir.r4.model.Bundle.BundleType;
import org.hl7.fhir.r4.model.Bundle.SearchEntryMode;
import org.hl7.fhir.r4.model.CodeType;
import org.hl7.fhir.r4.model.Extension;
import org.hl7.fhir.r4.model.Patient;

// Orchestrates a Patient/$match call: translate the probe in, find candidates through the
// blocking layer, score each with the engine, keep the matches and probable matches (or
// only the certain ones when asked), translate them back out, sort by score, and cap.
//
// It never re-implements matching or candidate generation; it composes the engine, the
// candidate provider, and the mapping layer. A missing probe is a bad request; an
// unreachable index is a 503, kept distinct from an empty result.
//
// @spec FHIR-001, FHIR-002, FHIR-006, FHIR-007, FHIR-010, FHIR-011, FHIR-013, FHIR-014, FHIR-016
public class FhirMatchService {

  // The standard FHIR match-grade extension carried on each Bundle entry's search element.
  public static final String MATCH_GRADE_URL = "http://hl7.org/fhir/StructureDefinition/match-grade";

  private final CandidateProvider candidates;
  private final MatchEngine engine;

  public FhirMatchService(CandidateProvider candidates, MatchEngine engine) {
    this.candidates = candidates;
    this.engine = engine;
  }

  public Bundle match(Patient probe, Boolean onlyCertainMatches, Integer count) {
    if (probe == null) {
      throw new InvalidRequestException("a Patient resource is required in the 'resource' parameter");
    }

    PatientRecord probeRecord = FhirMapping.toRecord(probe);

    List<SourceRecord> rows;
    try {
      rows = candidates.candidatesFor(probeRecord);
    } catch (CandidateLookupException e) {
      throw new IndexUnavailableException("the patient index is unavailable", e);
    }

    boolean onlyCertain = Boolean.TRUE.equals(onlyCertainMatches);
    List<Scored> scored = new ArrayList<>();
    for (SourceRecord row : rows) {
      MatchResult result = engine.score(probeRecord, row.toMatchRecord());
      if (keep(result.label(), onlyCertain)) {
        scored.add(new Scored(row, result.score(), MatchGrades.forLabel(result.label())));
      }
    }

    // Filter (above) is already applied; sort by score, then cap to the top `count`.
    scored.sort(Comparator.comparingDouble(Scored::score).reversed());
    if (count != null && count > 0 && scored.size() > count) {
      scored = scored.subList(0, count);
    }

    Bundle bundle = new Bundle();
    bundle.setType(BundleType.SEARCHSET);
    for (Scored s : scored) {
      BundleEntryComponent entry = bundle.addEntry();
      entry.setResource(FhirMapping.toPatient(s.row()));
      BundleEntrySearchComponent search = entry.getSearch();
      search.setMode(SearchEntryMode.MATCH);
      search.setScore(BigDecimal.valueOf(s.score()));
      search.addExtension(new Extension(MATCH_GRADE_URL, new CodeType(s.grade())));
    }
    bundle.setTotal(scored.size());
    return bundle;
  }

  // The default response carries matches and probable matches; onlyCertainMatches narrows
  // it to certain matches. A non-match never appears.
  private static boolean keep(String label, boolean onlyCertain) {
    if (onlyCertain) {
      return "match".equals(label);
    }
    return "match".equals(label) || "review".equals(label);
  }

  private record Scored(SourceRecord row, double score, String grade) {
  }
}
