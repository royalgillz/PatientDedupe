package com.patientdedupe.analytics;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

// Guards the SQL formulation of the metric against the canonical Java logic the MapReduce
// job implements. It runs the same null-safe query the Hive twin uses, here on H2 (a
// pure-Java SQL engine), and checks it produces the same per-site record and duplicate
// counts as DuplicateRate.aggregate. The real Hive run is verified against the same
// canonical result in the analytics run itself.
class HiveParityTest {

  private static final List<Row> ROWS = List.of(
      new Row(1, "Cerner", 100),
      new Row(50, "Lab Feed", 100),
      new Row(2, "Cerner", 200),
      new Row(3, "Epic ADT", 300),
      new Row(60, "Cerner", 300),
      new Row(70, "Lab Feed", 300),
      new Row(80, "Radiology", null));

  // The null-safe formulation shared with hive/duplicate_rate_by_site.sql, in ANSI SQL.
  private static final String QUERY =
      "select s.source_system, count(*) as records, "
          + "sum(case when p.primary_id is not null and s.id <> p.primary_id then 1 else 0 end) as duplicates "
          + "from source_records s "
          + "left join (select person_key, min(id) as primary_id from source_records "
          + "           where person_key is not null group by person_key) p "
          + "  on s.person_key = p.person_key "
          + "group by s.source_system";

  // @spec ANALYTICS-007
  @Test
  void sqlMatchesTheCanonicalPerSiteCounts() throws Exception {
    Map<String, long[]> fromSql = new HashMap<>();
    try (Connection c = DriverManager.getConnection("jdbc:h2:mem:parity;DB_CLOSE_DELAY=-1")) {
      try (Statement s = c.createStatement()) {
        s.execute("create table source_records (id int, source_system varchar(64), person_key int)");
      }
      try (var ps = c.prepareStatement("insert into source_records values (?,?,?)")) {
        for (Row r : ROWS) {
          ps.setLong(1, r.id());
          ps.setString(2, r.site());
          if (r.personKey() == null) {
            ps.setNull(3, java.sql.Types.INTEGER);
          } else {
            ps.setInt(3, r.personKey());
          }
          ps.addBatch();
        }
        ps.executeBatch();
      }
      try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery(QUERY)) {
        while (rs.next()) {
          fromSql.put(rs.getString("source_system"),
              new long[] {rs.getLong("records"), rs.getLong("duplicates")});
        }
      }
    }

    Map<String, long[]> canonical = new HashMap<>();
    for (SiteMetric m : DuplicateRate.aggregate(ROWS)) {
      canonical.put(m.site(), new long[] {m.records(), m.duplicates()});
    }

    assertEquals(canonical.keySet(), fromSql.keySet(), "same set of sites");
    for (String site : canonical.keySet()) {
      assertEquals(canonical.get(site)[0], fromSql.get(site)[0], "records for " + site);
      assertEquals(canonical.get(site)[1], fromSql.get(site)[1], "duplicates for " + site);
    }
  }
}
