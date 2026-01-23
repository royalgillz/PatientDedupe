package com.patientdedupe.fhir;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;

// Production CandidateProvider: runs the single-probe blocking query (built by
// ProbeQueryBuilder) against source_records over read-only JDBC, reusing the same
// phonetic keys and functional indexes as the batch blocking layer. A probe that yields
// no strategy returns no candidates without touching the database; a failed query is
// raised as CandidateLookupException.
//
// @spec FHIR-005
public class SqlCandidateProvider implements CandidateProvider {

  private final DataSource dataSource;

  public SqlCandidateProvider(DataSource dataSource) {
    this.dataSource = dataSource;
  }

  @Override
  public List<SourceRecord> candidatesFor(PatientRecord probe) {
    ProbeQuery query = ProbeQueryBuilder.build(probe);
    if (query.isEmpty()) {
      // No usable blocking key: nothing to look up, and we never scan the whole table.
      return List.of();
    }

    try (Connection connection = dataSource.getConnection();
        PreparedStatement statement = connection.prepareStatement(query.sql())) {
      List<Object> params = query.params();
      for (int i = 0; i < params.size(); i++) {
        statement.setObject(i + 1, params.get(i));
      }
      try (ResultSet rs = statement.executeQuery()) {
        List<SourceRecord> rows = new ArrayList<>();
        while (rs.next()) {
          rows.add(mapRow(rs));
        }
        return rows;
      }
    } catch (SQLException e) {
      throw new CandidateLookupException("single-probe blocking query failed", e);
    }
  }

  private static SourceRecord mapRow(ResultSet rs) throws SQLException {
    int personKeyValue = rs.getInt("person_key");
    Integer personKey = rs.wasNull() ? null : personKeyValue;
    return new SourceRecord(
        rs.getLong("id"),
        rs.getString("source_system"),
        rs.getString("mrn"),
        rs.getString("first_name"),
        rs.getString("last_name"),
        rs.getString("dob"),
        rs.getString("gender"),
        rs.getString("address"),
        rs.getString("city"),
        rs.getString("state"),
        rs.getString("zip"),
        personKey);
  }
}
