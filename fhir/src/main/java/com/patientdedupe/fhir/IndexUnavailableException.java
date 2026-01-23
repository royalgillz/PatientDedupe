package com.patientdedupe.fhir;

import ca.uhn.fhir.rest.server.exceptions.BaseServerResponseException;

// A 503 surfaced to the FHIR caller when the patient index is unreachable. Distinct from
// an empty result, which is a normal 200 with an empty Bundle.
public class IndexUnavailableException extends BaseServerResponseException {

  public IndexUnavailableException(String message, Throwable cause) {
    super(503, message, cause);
  }
}
