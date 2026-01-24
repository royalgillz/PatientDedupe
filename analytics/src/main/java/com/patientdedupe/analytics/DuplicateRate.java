package com.patientdedupe.analytics;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

// The canonical duplicate-rate-by-site logic, in plain Java. The MapReduce job computes
// the same thing distributed; this is the single reference both the job and the Hive twin
// must agree with, and it is what the unit tests pin.
//
// A person is the set of records sharing a person_key; a record with a null or unique
// person_key is its own one-record person. The primary is the minimum-id record; every
// other record in the person is a duplicate, attributed to its own site. Per site the
// result carries the record count and duplicate count; sites are ordered by rate
// descending, then by site name ascending.
//
// @spec ANALYTICS-002, ANALYTICS-003, ANALYTICS-004, ANALYTICS-005
public final class DuplicateRate {

  private DuplicateRate() {
  }

  public static List<SiteMetric> aggregate(Collection<Row> rows) {
    // Primary id per real person; null-key records have no entry here, so they are never
    // anyone's duplicate.
    Map<Integer, Long> primaryByPerson = new HashMap<>();
    for (Row r : rows) {
      if (r.personKey() != null) {
        primaryByPerson.merge(r.personKey(), r.id(), Math::min);
      }
    }

    // Per site: [records, duplicates].
    Map<String, long[]> bySite = new HashMap<>();
    for (Row r : rows) {
      long[] counts = bySite.computeIfAbsent(r.site(), k -> new long[2]);
      counts[0]++;
      boolean duplicate = r.personKey() != null && r.id() != primaryByPerson.get(r.personKey());
      if (duplicate) {
        counts[1]++;
      }
    }

    List<SiteMetric> metrics = new ArrayList<>();
    for (Map.Entry<String, long[]> e : bySite.entrySet()) {
      metrics.add(new SiteMetric(e.getKey(), e.getValue()[0], e.getValue()[1]));
    }
    // Worst offenders first, ties broken by site name.
    metrics.sort(Comparator.comparingDouble(SiteMetric::rate).reversed().thenComparing(SiteMetric::site));
    return metrics;
  }
}
