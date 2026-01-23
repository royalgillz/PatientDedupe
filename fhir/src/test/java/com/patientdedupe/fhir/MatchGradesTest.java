package com.patientdedupe.fhir;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class MatchGradesTest {

  // @spec FHIR-003
  @Test
  void mapsEngineLabelToGradeWithoutThresholds() {
    assertEquals(MatchGrades.CERTAIN, MatchGrades.forLabel("match"));
    assertEquals(MatchGrades.PROBABLE, MatchGrades.forLabel("review"));
    assertEquals(MatchGrades.CERTAINLY_NOT, MatchGrades.forLabel("no-match"));
  }
}
