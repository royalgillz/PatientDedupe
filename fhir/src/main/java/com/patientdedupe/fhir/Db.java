package com.patientdedupe.fhir;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import javax.sql.DataSource;
import org.postgresql.ds.PGSimpleDataSource;

// Builds a read-only DataSource for the patient index from a postgres connection URL.
// The live database is Supabase, reached through its IPv4 transaction pooler, which
// requires TLS and does not support server-side prepared statements (so prepareThreshold
// is zero, matching the Node backend's prepare:false).
public final class Db {

  private Db() {
  }

  public static DataSource fromEnv() {
    String url = System.getenv("DATABASE_URL");
    if (url == null || url.isBlank()) {
      throw new IllegalStateException("DATABASE_URL is not set");
    }
    return fromUrl(url);
  }

  public static DataSource fromUrl(String databaseUrl) {
    URI uri = URI.create(databaseUrl.replaceFirst("^postgres(ql)?://", "postgresql://"));

    PGSimpleDataSource ds = new PGSimpleDataSource();
    ds.setServerNames(new String[] {uri.getHost()});
    ds.setPortNumbers(new int[] {uri.getPort() == -1 ? 5432 : uri.getPort()});

    String path = uri.getPath() == null ? "" : uri.getPath();
    ds.setDatabaseName(path.startsWith("/") ? path.substring(1) : path);

    String userInfo = uri.getUserInfo();
    if (userInfo != null) {
      String[] credentials = userInfo.split(":", 2);
      ds.setUser(URLDecoder.decode(credentials[0], StandardCharsets.UTF_8));
      if (credentials.length > 1) {
        ds.setPassword(URLDecoder.decode(credentials[1], StandardCharsets.UTF_8));
      }
    }

    // The hosted demo reaches Supabase over TLS; a local Postgres does not speak TLS, so
    // only require it for remote hosts.
    String host = uri.getHost();
    boolean local = "localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host);
    if (!local) {
      ds.setSsl(true);
      ds.setSslMode("require");
    }
    ds.setPrepareThreshold(0);
    return ds;
  }
}
