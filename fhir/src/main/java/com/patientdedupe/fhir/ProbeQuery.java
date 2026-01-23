package com.patientdedupe.fhir;

import java.util.List;

// The single-probe blocking lookup: the SQL to run, its ordered parameters, and the
// names of the strategies that were included. The strategy list is exposed so the
// strategy-selection logic (which strategies a given probe enables) can be reasoned
// about and tested without a database.
public record ProbeQuery(String sql, List<Object> params, List<String> strategies) {

  // Strategy identifiers, mirroring the four strategies in sql/blocking_candidates.sql.
  public static final String SURNAME_YEAR = "surname_year";
  public static final String FIRSTNAME_YEAR = "firstname_year";
  public static final String FIRST_LAST = "first_last";
  public static final String PREFIX_EXACT_DATE = "prefix_exact_date";

  public boolean isEmpty() {
    return strategies.isEmpty();
  }
}
