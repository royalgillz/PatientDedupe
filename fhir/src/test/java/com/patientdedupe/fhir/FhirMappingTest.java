package com.patientdedupe.fhir;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import ca.uhn.fhir.context.FhirContext;
import org.hl7.fhir.r4.model.Address;
import org.hl7.fhir.r4.model.Address.AddressUse;
import org.hl7.fhir.r4.model.DateType;
import org.hl7.fhir.r4.model.Enumerations.AdministrativeGender;
import org.hl7.fhir.r4.model.HumanName;
import org.hl7.fhir.r4.model.HumanName.NameUse;
import org.hl7.fhir.r4.model.Patient;
import org.junit.jupiter.api.Test;

class FhirMappingTest {

  private static final FhirContext FHIR = FhirContext.forR4Cached();

  // @spec FHIR-008
  @Test
  void mapsProbePreferringOfficialNameAndHomeAddress() {
    Patient p = new Patient();
    p.addName(new HumanName().setUse(NameUse.NICKNAME).addGiven("Bob").setFamily("Smith"));
    p.addName(new HumanName().setUse(NameUse.OFFICIAL).addGiven("Robert").setFamily("Smith"));
    p.setBirthDateElement(new DateType("1984-05-12"));
    p.setGender(AdministrativeGender.MALE);
    p.addAddress(new Address().setUse(AddressUse.WORK).addLine("9 Office Rd").setCity("Cambridge").setPostalCode("02139"));
    p.addAddress(new Address().setUse(AddressUse.HOME).addLine("1 Main St").setCity("Boston").setPostalCode("02118"));

    PatientRecord r = FhirMapping.toRecord(p);

    assertEquals("Robert", r.firstName());
    assertEquals("Smith", r.lastName());
    assertEquals("1984-05-12", r.dob());
    assertEquals("male", r.gender());
    assertEquals("1 Main St", r.address());
    assertEquals("Boston", r.city());
    assertEquals("02118", r.zip());
  }

  // @spec FHIR-008
  @Test
  void absentProbeFieldsBecomeEmptyStrings() {
    PatientRecord r = FhirMapping.toRecord(new Patient());
    assertEquals("", r.firstName());
    assertEquals("", r.lastName());
    assertEquals("", r.dob());
    assertEquals("", r.gender());
    assertEquals("", r.address());
    assertEquals("", r.city());
    assertEquals("", r.zip());
  }

  // @spec FHIR-009
  @Test
  void mapsSourceRecordBackToPatientWithSourceIdentifier() {
    SourceRecord row = new SourceRecord(
        42, "EPIC", "MRN123", "Robert", "Smith", "1984-05-12", "M",
        "1 Main St", "Boston", "MA", "02118", 99999);

    Patient p = FhirMapping.toPatient(row);

    assertEquals("Smith", p.getNameFirstRep().getFamily());
    assertEquals("Robert", p.getNameFirstRep().getGivenAsSingleString());
    assertEquals("1984-05-12", p.getBirthDateElement().getValueAsString());
    assertEquals(AdministrativeGender.MALE, p.getGender());
    assertEquals("1 Main St", p.getAddressFirstRep().getLine().get(0).getValue());
    assertEquals("Boston", p.getAddressFirstRep().getCity());
    assertEquals("02118", p.getAddressFirstRep().getPostalCode());

    boolean carriesMrn = p.getIdentifier().stream().anyMatch(i -> "MRN123".equals(i.getValue()));
    assertTrue(carriesMrn, "the source MRN should be exposed so the caller can resolve the record");
  }

  // @spec FHIR-017
  @Test
  void neverExposesTheSyntheticPersonKey() {
    SourceRecord row = new SourceRecord(
        42, "EPIC", "MRN123", "Robert", "Smith", "1984-05-12", "M",
        "1 Main St", "Boston", "MA", "02118", 99999);

    Patient p = FhirMapping.toPatient(row);
    String json = FHIR.newJsonParser().encodeResourceToString(p);

    assertFalse(json.contains("99999"), "the synthetic person_key must never appear in a FHIR response");
  }
}
