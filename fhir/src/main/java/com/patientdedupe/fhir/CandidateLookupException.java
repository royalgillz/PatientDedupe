package com.patientdedupe.fhir;

// Thrown by a CandidateProvider when the patient index cannot be reached, as opposed to
// being reachable but holding no candidates. The service turns this into a 503.
public class CandidateLookupException extends RuntimeException {

  public CandidateLookupException(String message, Throwable cause) {
    super(message, cause);
  }
}
