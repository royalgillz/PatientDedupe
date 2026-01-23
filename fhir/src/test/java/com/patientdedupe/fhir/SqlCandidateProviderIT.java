package com.patientdedupe.fhir;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.Statement;
import java.util.List;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.testcontainers.containers.PostgreSQLContainer;

// Exercises the single-probe blocking query against a real Postgres with the
// fuzzystrmatch extension and the same functional indexes the batch blocking layer uses.
// Needs Docker, so it is tagged "integration" and excluded from the default run.
@Tag("integration")
class SqlCandidateProviderIT {

  private static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:17");
  private static PGSimpleDataSource dataSource;

  @BeforeAll
  static void start() throws Exception {
    PG.start();
    dataSource = new PGSimpleDataSource();
    dataSource.setUrl(PG.getJdbcUrl());
    dataSource.setUser(PG.getUsername());
    dataSource.setPassword(PG.getPassword());

    try (Connection c = dataSource.getConnection(); Statement s = c.createStatement()) {
      s.execute("create extension if not exists fuzzystrmatch");
      s.execute("""
          create table source_records (
            id serial primary key, source_system text, mrn text,
            first_name text, last_name text, dob text, gender text,
            address text, city text, state text default 'MA', zip text, person_key integer)
          """);
      // the same functional index the batch blocking layer relies on
      s.execute("create index on source_records (dmetaphone(last_name), left(dob,4))");
      // Smith and Smyth share a dmetaphone code and a birth year, so a Smyth probe should
      // surface this Smith via the same-sounding-surname strategy.
      s.execute("""
          insert into source_records (source_system, mrn, first_name, last_name, dob, gender, address, city, zip, person_key)
          values ('EPIC','MRN1','Robert','Smith','1984-05-12','M','1 Main St','Boston','02118',1)
          """);
    }
  }

  @AfterAll
  static void stop() {
    PG.stop();
  }

  // @spec FHIR-005
  @Test
  void findsAPhoneticallyMatchingRecordThroughTheBlockingKeys() {
    SqlCandidateProvider provider = new SqlCandidateProvider(dataSource);
    PatientRecord probe = new PatientRecord(
        "Robert", "Smyth", "1984-05-12", "M", "1 Main St", "Boston", "02118");

    List<SourceRecord> candidates = provider.candidatesFor(probe);

    boolean foundSmith = candidates.stream().anyMatch(r -> "Smith".equals(r.lastName()));
    assertTrue(foundSmith, "the same-sounding surname and birth year should block Smith as a candidate");
  }
}
