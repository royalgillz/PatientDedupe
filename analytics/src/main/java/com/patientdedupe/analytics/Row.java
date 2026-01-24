package com.patientdedupe.analytics;

// One input row of the analytics snapshot: a record id, the registration site, and the
// synthetic ground-truth person id. personKey may be null (a record with no known person).
// A plain class rather than a record, because the module targets Java 11 to match Hadoop.
public final class Row {

  private final long id;
  private final String site;
  private final Integer personKey;

  public Row(long id, String site, Integer personKey) {
    this.id = id;
    this.site = site;
    this.personKey = personKey;
  }

  public long id() {
    return id;
  }

  public String site() {
    return site;
  }

  public Integer personKey() {
    return personKey;
  }

  // Parse a snapshot CSV line "id,source_system,person_key"; an empty person_key is null.
  public static Row parse(String line) {
    String[] f = line.split(",", -1);
    Integer key = f[2].trim().isEmpty() ? null : Integer.valueOf(f[2].trim());
    return new Row(Long.parseLong(f[0].trim()), f[1].trim(), key);
  }
}
