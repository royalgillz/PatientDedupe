package com.patientdedupe.fhir;

// A row from source_records: the seven match fields plus the identifiers a caller needs
// to resolve the record in its origin system. personKey is the synthetic ground-truth
// identity; it is read here only so the mapping layer can be trusted to never expose it.
public record SourceRecord(
    long id,
    String sourceSystem,
    String mrn,
    String firstName,
    String lastName,
    String dob,
    String gender,
    String address,
    String city,
    String state,
    String zip,
    Integer personKey) {

  // The subset the engine scores on.
  public PatientRecord toMatchRecord() {
    return new PatientRecord(firstName, lastName, dob, gender, address, city, zip);
  }
}
