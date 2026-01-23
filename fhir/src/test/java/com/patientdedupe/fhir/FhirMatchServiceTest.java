package com.patientdedupe.fhir;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import ca.uhn.fhir.rest.server.exceptions.InvalidRequestException;
import com.patientdedupe.fhir.support.FakeCandidateProvider;
import com.patientdedupe.fhir.support.FakeMatchEngine;
import java.util.List;
import java.util.Map;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.Bundle.BundleEntryComponent;
import org.hl7.fhir.r4.model.Bundle.BundleType;
import org.hl7.fhir.r4.model.CodeType;
import org.hl7.fhir.r4.model.HumanName;
import org.hl7.fhir.r4.model.Patient;
import org.junit.jupiter.api.Test;

class FhirMatchServiceTest {

  // Three candidates spanning the bands: a confident match, a review-band probable, and a
  // non-match that must never be returned. The fake engine keys its verdict off last name.
  private static final SourceRecord SMITH = row(1, "Smith");
  private static final SourceRecord SMYTH = row(2, "Smyth");
  private static final SourceRecord JONES = row(3, "Jones");

  private static SourceRecord row(long id, String last) {
    return new SourceRecord(id, "EPIC", "MRN" + id, "Robert", last, "1984-05-12", "M",
        "1 Main St", "Boston", "MA", "02118", 1000 + (int) id);
  }

  private static MatchEngine engine() {
    return new FakeMatchEngine(Map.of(
        "Smith", new MatchResult(0.97, "match", List.of()),
        "Smyth", new MatchResult(0.85, "review", List.of()),
        "Jones", new MatchResult(0.60, "no-match", List.of())));
  }

  private static Patient probe() {
    Patient p = new Patient();
    p.addName(new HumanName().addGiven("Robert").setFamily("Smith"));
    return p;
  }

  private static String grade(BundleEntryComponent e) {
    return ((CodeType) e.getSearch().getExtensionByUrl(FhirMatchService.MATCH_GRADE_URL).getValue()).getCode();
  }

  // @spec FHIR-001, FHIR-002
  @Test
  void returnsSearchsetBundleWithScoreAndGradePerEntry() {
    FhirMatchService svc = new FhirMatchService(
        FakeCandidateProvider.returning(List.of(SMITH, SMYTH, JONES)), engine());

    Bundle b = svc.match(probe(), null, null);

    assertEquals(BundleType.SEARCHSET, b.getType());
    for (BundleEntryComponent e : b.getEntry()) {
      assertTrue(e.getResource() instanceof Patient, "each entry carries a matched Patient");
      assertTrue(e.getSearch().hasScore(), "each entry carries a search score");
      assertTrue(e.getSearch().getExtensionByUrl(FhirMatchService.MATCH_GRADE_URL) != null,
          "each entry carries a match-grade extension");
    }
  }

  // @spec FHIR-007
  @Test
  void defaultReturnsMatchAndReviewButExcludesNonMatches() {
    FhirMatchService svc = new FhirMatchService(
        FakeCandidateProvider.returning(List.of(SMITH, SMYTH, JONES)), engine());

    Bundle b = svc.match(probe(), null, null);

    assertEquals(2, b.getEntry().size(), "the no-match candidate is excluded");
    assertEquals(MatchGrades.CERTAIN, grade(b.getEntry().get(0)));
    assertEquals(MatchGrades.PROBABLE, grade(b.getEntry().get(1)));
  }

  // @spec FHIR-006
  @Test
  void sortsByScoreDescending() {
    FhirMatchService svc = new FhirMatchService(
        FakeCandidateProvider.returning(List.of(SMYTH, SMITH, JONES)), engine());

    Bundle b = svc.match(probe(), null, null);

    assertEquals(0.97, b.getEntry().get(0).getSearch().getScore().doubleValue(), 1e-9);
    assertEquals(0.85, b.getEntry().get(1).getSearch().getScore().doubleValue(), 1e-9);
  }

  // @spec FHIR-007
  @Test
  void onlyCertainMatchesReturnsCertainGradeOnly() {
    FhirMatchService svc = new FhirMatchService(
        FakeCandidateProvider.returning(List.of(SMITH, SMYTH, JONES)), engine());

    Bundle b = svc.match(probe(), true, null);

    assertEquals(1, b.getEntry().size());
    assertEquals(MatchGrades.CERTAIN, grade(b.getEntry().get(0)));
  }

  // @spec FHIR-006
  @Test
  void positiveCountKeepsOnlyTheTopMatches() {
    FhirMatchService svc = new FhirMatchService(
        FakeCandidateProvider.returning(List.of(SMITH, SMYTH, JONES)), engine());

    Bundle b = svc.match(probe(), null, 1);

    assertEquals(1, b.getEntry().size());
    assertEquals(0.97, b.getEntry().get(0).getSearch().getScore().doubleValue(), 1e-9);
  }

  // @spec FHIR-013
  @Test
  void nonPositiveCountImposesNoCap() {
    FhirMatchService svc = new FhirMatchService(
        FakeCandidateProvider.returning(List.of(SMITH, SMYTH, JONES)), engine());

    Bundle b = svc.match(probe(), null, 0);

    assertEquals(2, b.getEntry().size(), "count of zero is treated as no cap, not zero results");
  }

  // @spec FHIR-011
  @Test
  void noCandidatesReturnsAnEmptySearchsetBundle() {
    FhirMatchService svc = new FhirMatchService(
        FakeCandidateProvider.returning(List.of()), engine());

    Bundle b = svc.match(probe(), null, null);

    assertEquals(BundleType.SEARCHSET, b.getType());
    assertTrue(b.getEntry().isEmpty());
  }

  // @spec FHIR-010
  @Test
  void missingProbeIsABadRequest() {
    FhirMatchService svc = new FhirMatchService(
        FakeCandidateProvider.returning(List.of(SMITH)), engine());

    assertThrows(InvalidRequestException.class, () -> svc.match(null, null, null));
  }

  // @spec FHIR-014
  @Test
  void unreachableIndexIsServiceUnavailableNotEmpty() {
    FhirMatchService svc = new FhirMatchService(FakeCandidateProvider.failing(), engine());

    IndexUnavailableException ex =
        assertThrows(IndexUnavailableException.class, () -> svc.match(probe(), null, null));
    assertEquals(503, ex.getStatusCode());
  }

  // @spec FHIR-016
  @Test
  void returnsAnIndexRecordThatResemblesTheProbe() {
    // The probe looks exactly like SMITH; a self-resembling record is a valid match.
    FhirMatchService svc = new FhirMatchService(
        FakeCandidateProvider.returning(List.of(SMITH)), engine());

    Bundle b = svc.match(probe(), null, null);

    assertEquals(1, b.getEntry().size());
    assertEquals(MatchGrades.CERTAIN, grade(b.getEntry().get(0)));
  }
}
