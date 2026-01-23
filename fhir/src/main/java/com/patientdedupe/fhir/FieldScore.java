package com.patientdedupe.fhir;

// One field's contribution to the score, as the engine returns it.
public record FieldScore(String field, double similarity, double weight, String detail) {
}
