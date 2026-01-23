package com.patientdedupe.fhir;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class ProbeQueryBuilderTest {

  private static PatientRecord probe(String first, String last, String dob) {
    return new PatientRecord(first, last, dob, "M", "1 Main St", "Boston", "02118");
  }

  // @spec FHIR-005
  @Test
  void fullProbeEnablesAllFourStrategies() {
    ProbeQuery q = ProbeQueryBuilder.build(probe("Robert", "Smith", "1984-05-12"));
    assertTrue(q.strategies().contains(ProbeQuery.SURNAME_YEAR));
    assertTrue(q.strategies().contains(ProbeQuery.FIRSTNAME_YEAR));
    assertTrue(q.strategies().contains(ProbeQuery.FIRST_LAST));
    assertTrue(q.strategies().contains(ProbeQuery.PREFIX_EXACT_DATE));
  }

  // @spec FHIR-012
  @Test
  void partialBirthDateUsesYearButDropsExactDateStrategy() {
    ProbeQuery q = ProbeQueryBuilder.build(probe("Robert", "Smith", "1984"));
    assertTrue(q.strategies().contains(ProbeQuery.SURNAME_YEAR), "year-based strategy still applies");
    assertFalse(q.strategies().contains(ProbeQuery.PREFIX_EXACT_DATE), "exact-date strategy needs a full date");
  }

  // @spec FHIR-012
  @Test
  void missingBirthDateDropsAllDateStrategies() {
    ProbeQuery q = ProbeQueryBuilder.build(probe("Robert", "Smith", ""));
    assertTrue(q.strategies().contains(ProbeQuery.FIRST_LAST), "name-only strategy still applies");
    assertFalse(q.strategies().contains(ProbeQuery.SURNAME_YEAR));
    assertFalse(q.strategies().contains(ProbeQuery.PREFIX_EXACT_DATE));
  }

  // @spec FHIR-011
  @Test
  void probeWithNoUsableKeyProducesAnEmptyQuery() {
    ProbeQuery q = ProbeQueryBuilder.build(probe("", "", ""));
    assertTrue(q.isEmpty(), "a keyless probe yields no candidates rather than scanning the table");
  }
}
