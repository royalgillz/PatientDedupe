package com.patientdedupe.fhir;

import java.util.ArrayList;
import java.util.List;

// Builds the single-probe blocking lookup for a probe record, deciding which of the four
// blocking strategies apply. A strategy whose key the probe cannot supply is dropped: a
// partial birth date (year only, or year and month) enables the year-based strategies but
// not the exact-birth-date strategy, and a probe with no usable key produces an empty
// query that the caller treats as "no candidates".
//
// The clauses mirror the four strategies in sql/blocking_candidates.sql, one-sided against
// a probe instead of a self-join, and rely on the same functional indexes.
//
// @spec FHIR-005, FHIR-012, FHIR-011
public final class ProbeQueryBuilder {

  private static final String SELECT =
      "select id, source_system, mrn, first_name, last_name, dob, gender, "
          + "address, city, state, zip, person_key from source_records s where ";

  private ProbeQueryBuilder() {
  }

  public static ProbeQuery build(PatientRecord probe) {
    String first = trimmed(probe.firstName());
    String last = trimmed(probe.lastName());
    String dob = trimmed(probe.dob());
    String year = year(dob);
    boolean fullDate = isFullDate(dob);

    List<String> strategies = new ArrayList<>();
    List<String> clauses = new ArrayList<>();
    List<Object> params = new ArrayList<>();

    if (!last.isEmpty() && year != null) {
      strategies.add(ProbeQuery.SURNAME_YEAR);
      clauses.add("(dmetaphone(s.last_name) = dmetaphone(?) and left(s.dob, 4) = ?)");
      params.add(last);
      params.add(year);
    }
    if (!first.isEmpty() && year != null) {
      strategies.add(ProbeQuery.FIRSTNAME_YEAR);
      clauses.add("(dmetaphone(s.first_name) = dmetaphone(?) and left(s.dob, 4) = ?)");
      params.add(first);
      params.add(year);
    }
    if (!first.isEmpty() && !last.isEmpty()) {
      strategies.add(ProbeQuery.FIRST_LAST);
      clauses.add("(dmetaphone(s.first_name) = dmetaphone(?) and dmetaphone(s.last_name) = dmetaphone(?))");
      params.add(first);
      params.add(last);
    }
    if (!last.isEmpty() && fullDate) {
      strategies.add(ProbeQuery.PREFIX_EXACT_DATE);
      clauses.add("(left(lower(s.last_name), 3) = left(lower(?), 3) and s.dob = ?)");
      params.add(last);
      params.add(dob);
    }

    if (strategies.isEmpty()) {
      // No usable key: an empty query the caller reads as "no candidates", never a scan.
      return new ProbeQuery("", List.of(), List.of());
    }
    String sql = SELECT + String.join(" or ", clauses);
    return new ProbeQuery(sql, List.copyOf(params), List.copyOf(strategies));
  }

  private static String trimmed(String s) {
    return s == null ? "" : s.trim();
  }

  // The first four characters when they are a plausible year, else null.
  private static String year(String dob) {
    if (dob.length() >= 4 && dob.substring(0, 4).chars().allMatch(Character::isDigit)) {
      return dob.substring(0, 4);
    }
    return null;
  }

  private static boolean isFullDate(String dob) {
    return dob.length() == 10 && dob.charAt(4) == '-' && dob.charAt(7) == '-';
  }
}
