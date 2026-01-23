package com.patientdedupe.fhir;

// Maps the engine's label to a FHIR match grade. The thresholds that produce the label
// live only in the engine; this layer never re-derives a grade from the score, so the
// bands stay single-sourced.
//
// @spec FHIR-003
public final class MatchGrades {

  public static final String CERTAIN = "certain";
  public static final String PROBABLE = "probable";
  public static final String CERTAINLY_NOT = "certainly-not";

  private MatchGrades() {
  }

  public static String forLabel(String label) {
    if (label == null) {
      return CERTAINLY_NOT;
    }
    return switch (label) {
      case "match" -> CERTAIN;
      case "review" -> PROBABLE;
      default -> CERTAINLY_NOT;
    };
  }
}
