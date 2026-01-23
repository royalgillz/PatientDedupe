package com.patientdedupe.fhir;

import java.util.List;

// What the engine returns for one pair: the overall score, the label (match / review /
// no-match) the engine itself assigns, and the per-field reasons.
public record MatchResult(double score, String label, List<FieldScore> fields) {
}
