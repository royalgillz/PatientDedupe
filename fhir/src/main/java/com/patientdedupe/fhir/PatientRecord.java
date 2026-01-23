package com.patientdedupe.fhir;

// The slice of a patient the engine matches on, mirroring the C++ PatientRecord. All
// strings because that is how the data arrives from FHIR and from the database, and
// because the metrics work on text. Dates are ISO yyyy-mm-dd.
public record PatientRecord(
    String firstName,
    String lastName,
    String dob,
    String gender,
    String address,
    String city,
    String zip) {
}
