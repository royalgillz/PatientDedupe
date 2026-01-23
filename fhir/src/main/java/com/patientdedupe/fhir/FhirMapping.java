package com.patientdedupe.fhir;

import org.hl7.fhir.r4.model.Address;
import org.hl7.fhir.r4.model.Address.AddressUse;
import org.hl7.fhir.r4.model.DateType;
import org.hl7.fhir.r4.model.Enumerations.AdministrativeGender;
import org.hl7.fhir.r4.model.HumanName;
import org.hl7.fhir.r4.model.HumanName.NameUse;
import org.hl7.fhir.r4.model.Patient;
import org.hl7.fhir.r4.model.StringType;

// Translates between FHIR Patient resources and the engine's flat record. When a probe
// carries several names or addresses, the first official name and home address are used,
// falling back to the first present. Absent fields become empty strings, which the engine
// tolerates. The reverse mapping carries an identifier for the source system and MRN so a
// caller can resolve the record, and deliberately never emits the synthetic person_key.
//
// @spec FHIR-008, FHIR-009, FHIR-017
public final class FhirMapping {

  // The system prefix on the identifier we emit for the originating source system.
  public static final String SOURCE_IDENTIFIER_PREFIX = "urn:patientdedupe:source:";

  private FhirMapping() {
  }

  public static PatientRecord toRecord(Patient probe) {
    HumanName name = pickName(probe);
    Address address = pickAddress(probe);
    return new PatientRecord(
        firstGiven(name),
        family(name),
        probe.hasBirthDate() ? probe.getBirthDateElement().getValueAsString() : "",
        probe.hasGender() ? probe.getGender().toCode() : "",
        firstLine(address),
        address != null ? orEmpty(address.getCity()) : "",
        address != null ? orEmpty(address.getPostalCode()) : "");
  }

  public static Patient toPatient(SourceRecord row) {
    Patient p = new Patient();
    p.setId(String.valueOf(row.id()));
    p.addName(new HumanName().setFamily(row.lastName()).addGiven(row.firstName()));
    if (row.dob() != null && !row.dob().isBlank()) {
      p.setBirthDateElement(new DateType(row.dob()));
    }
    p.setGender(genderFrom(row.gender()));
    p.addAddress(new Address()
        .addLine(row.address())
        .setCity(row.city())
        .setState(row.state())
        .setPostalCode(row.zip()));
    // What lets a caller resolve the match in its origin system. The synthetic person_key
    // is deliberately not carried anywhere on the resource.
    p.addIdentifier()
        .setSystem(SOURCE_IDENTIFIER_PREFIX + row.sourceSystem())
        .setValue(row.mrn());
    return p;
  }

  private static HumanName pickName(Patient probe) {
    if (!probe.hasName()) {
      return null;
    }
    for (HumanName n : probe.getName()) {
      if (n.getUse() == NameUse.OFFICIAL) {
        return n;
      }
    }
    return probe.getNameFirstRep();
  }

  private static Address pickAddress(Patient probe) {
    if (!probe.hasAddress()) {
      return null;
    }
    for (Address a : probe.getAddress()) {
      if (a.getUse() == AddressUse.HOME) {
        return a;
      }
    }
    return probe.getAddressFirstRep();
  }

  private static String firstGiven(HumanName name) {
    if (name == null || name.getGiven().isEmpty()) {
      return "";
    }
    return orEmpty(name.getGiven().get(0).getValue());
  }

  private static String family(HumanName name) {
    return name == null ? "" : orEmpty(name.getFamily());
  }

  private static String firstLine(Address address) {
    if (address == null || address.getLine().isEmpty()) {
      return "";
    }
    StringType line = address.getLine().get(0);
    return line == null ? "" : orEmpty(line.getValue());
  }

  // Source records store a single-letter gender; map it back to the FHIR value set.
  private static AdministrativeGender genderFrom(String gender) {
    if (gender == null || gender.isBlank()) {
      return AdministrativeGender.UNKNOWN;
    }
    return switch (Character.toLowerCase(gender.charAt(0))) {
      case 'm' -> AdministrativeGender.MALE;
      case 'f' -> AdministrativeGender.FEMALE;
      default -> AdministrativeGender.UNKNOWN;
    };
  }

  private static String orEmpty(String s) {
    return s == null ? "" : s;
  }
}
