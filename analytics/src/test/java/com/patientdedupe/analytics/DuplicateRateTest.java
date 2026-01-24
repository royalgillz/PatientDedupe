package com.patientdedupe.analytics;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;

class DuplicateRateTest {

  // person 100: primary id 1 at Cerner, duplicate id 50 at Lab Feed
  // person 200: a single record id 2 at Cerner (a singleton, never a duplicate)
  // person 300: primary id 3 at Epic ADT, duplicates id 60 at Cerner and id 70 at Lab Feed
  // null person_key: id 80 at Radiology (a singleton, never a duplicate)
  private static final List<Row> ROWS = List.of(
      new Row(1, "Cerner", 100),
      new Row(50, "Lab Feed", 100),
      new Row(2, "Cerner", 200),
      new Row(3, "Epic ADT", 300),
      new Row(60, "Cerner", 300),
      new Row(70, "Lab Feed", 300),
      new Row(80, "Radiology", null));

  private static Map<String, SiteMetric> bySite(List<SiteMetric> metrics) {
    return metrics.stream().collect(Collectors.toMap(SiteMetric::site, Function.identity()));
  }

  // @spec ANALYTICS-002, ANALYTICS-003
  @Test
  void countsRecordsAndDuplicatesPerSite() {
    Map<String, SiteMetric> m = bySite(DuplicateRate.aggregate(ROWS));

    assertEquals(3, m.get("Cerner").records());     // ids 1, 2, 60
    assertEquals(1, m.get("Cerner").duplicates());  // id 60 only
    assertEquals(2, m.get("Lab Feed").records());   // ids 50, 70
    assertEquals(2, m.get("Lab Feed").duplicates()); // both are duplicates
    assertEquals(1, m.get("Epic ADT").records());   // id 3, the primary
    assertEquals(0, m.get("Epic ADT").duplicates());
  }

  // @spec ANALYTICS-004
  @Test
  void singletonAndNullKeyRecordsAreNeverDuplicates() {
    Map<String, SiteMetric> m = bySite(DuplicateRate.aggregate(ROWS));

    // Radiology holds only the null-key record; the unique-key id 2 sits in Cerner's count.
    assertEquals(1, m.get("Radiology").records());
    assertEquals(0, m.get("Radiology").duplicates());
  }

  // @spec ANALYTICS-003
  @Test
  void rateIsDuplicatesOverRecordsRoundedToFourDecimals() {
    Map<String, SiteMetric> m = bySite(DuplicateRate.aggregate(ROWS));

    assertEquals("0.3333", m.get("Cerner").rateRounded().toPlainString());  // 1/3
    assertEquals("1.0000", m.get("Lab Feed").rateRounded().toPlainString());
    assertEquals("0.0000", m.get("Epic ADT").rateRounded().toPlainString());
  }

  // @spec ANALYTICS-005
  @Test
  void sitesAreOrderedByRateDescendingThenNameAscending() {
    List<String> order = DuplicateRate.aggregate(ROWS).stream()
        .map(SiteMetric::site).collect(Collectors.toList());

    // Lab Feed 1.0, Cerner 0.333, then the 0.0 sites tie and break by name: Epic ADT, Radiology
    assertEquals(List.of("Lab Feed", "Cerner", "Epic ADT", "Radiology"), order);
  }
}
