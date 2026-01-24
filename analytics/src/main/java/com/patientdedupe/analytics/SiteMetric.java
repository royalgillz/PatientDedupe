package com.patientdedupe.analytics;

import java.math.BigDecimal;
import java.math.RoundingMode;

// The per-site result: how many records the site holds and how many of them are
// duplicates. The rate is derived from those two integer counts and rounded to four
// decimals, so the MapReduce and Hive results compare exactly. A plain Java 11 class.
public final class SiteMetric {

  private final String site;
  private final long records;
  private final long duplicates;

  public SiteMetric(String site, long records, long duplicates) {
    this.site = site;
    this.records = records;
    this.duplicates = duplicates;
  }

  public String site() {
    return site;
  }

  public long records() {
    return records;
  }

  public long duplicates() {
    return duplicates;
  }

  public double rate() {
    return records == 0 ? 0.0 : (double) duplicates / (double) records;
  }

  public BigDecimal rateRounded() {
    return BigDecimal.valueOf(rate()).setScale(4, RoundingMode.HALF_UP);
  }
}
