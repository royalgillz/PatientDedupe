package com.patientdedupe.fhir;

import ca.uhn.fhir.rest.annotation.Operation;
import ca.uhn.fhir.rest.annotation.OperationParam;
import ca.uhn.fhir.rest.server.IResourceProvider;
import org.hl7.fhir.instance.model.api.IBaseResource;
import org.hl7.fhir.r4.model.BooleanType;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.IntegerType;
import org.hl7.fhir.r4.model.Patient;

// The HAPI resource provider that exposes POST /Patient/$match. It binds the standard
// operation parameters and hands them to the service. The math, candidate generation, and
// mapping all live in the service and the layers beneath it; this class is only the FHIR
// entry point.
//
// @spec FHIR-001
public class PatientMatchProvider implements IResourceProvider {

  private final FhirMatchService service;

  public PatientMatchProvider(FhirMatchService service) {
    this.service = service;
  }

  @Override
  public Class<Patient> getResourceType() {
    return Patient.class;
  }

  @Operation(name = "$match", idempotent = false)
  public Bundle match(
      @OperationParam(name = "resource", max = 1) Patient resource,
      @OperationParam(name = "onlyCertainMatches", max = 1) BooleanType onlyCertainMatches,
      @OperationParam(name = "count", max = 1) IntegerType count) {
    Boolean onlyCertain = onlyCertainMatches != null ? onlyCertainMatches.getValue() : null;
    Integer cap = count != null ? count.getValue() : null;
    return service.match(resource, onlyCertain, cap);
  }
}
