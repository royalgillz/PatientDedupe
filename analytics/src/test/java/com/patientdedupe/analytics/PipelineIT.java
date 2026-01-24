package com.patientdedupe.analytics;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.util.ToolRunner;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

// Runs the real two-job MapReduce pipeline end to end in Hadoop local mode (LocalJobRunner,
// no daemons) over a small CSV fixture, and checks its per-site counts match the canonical
// logic. Tagged integration because it pulls the Hadoop runtime; it needs no Docker.
@Tag("integration")
class PipelineIT {

  private static final List<Row> ROWS = List.of(
      new Row(1, "Cerner", 100),
      new Row(50, "Lab Feed", 100),
      new Row(2, "Cerner", 200),
      new Row(3, "Epic ADT", 300),
      new Row(60, "Cerner", 300),
      new Row(70, "Lab Feed", 300),
      new Row(80, "Radiology", null));

  // @spec ANALYTICS-006, ANALYTICS-008
  @Test
  void localModePipelineMatchesTheCanonicalCounts(@TempDir Path tmp) throws Exception {
    Path input = tmp.resolve("input");
    Files.createDirectories(input);
    String csv = ROWS.stream()
        .map(r -> r.id() + "," + r.site() + "," + (r.personKey() == null ? "" : r.personKey()))
        .collect(Collectors.joining("\n"));
    Files.writeString(input.resolve("source_records.csv"), csv);
    Path output = tmp.resolve("output");

    Configuration conf = new Configuration();
    conf.set("mapreduce.framework.name", "local");
    conf.set("fs.defaultFS", "file:///");

    int rc = ToolRunner.run(conf, new AnalyticsDriver(),
        new String[] {input.toString(), output.toString()});
    assertEquals(0, rc, "the pipeline should succeed");

    Map<String, long[]> actual = readOutput(output);
    Map<String, long[]> canonical = new HashMap<>();
    for (SiteMetric m : DuplicateRate.aggregate(ROWS)) {
      canonical.put(m.site(), new long[] {m.records(), m.duplicates()});
    }

    assertEquals(canonical.keySet(), actual.keySet());
    for (String site : canonical.keySet()) {
      assertEquals(canonical.get(site)[0], actual.get(site)[0], "records for " + site);
      assertEquals(canonical.get(site)[1], actual.get(site)[1], "duplicates for " + site);
    }
  }

  // Reads the job's part files, each line "site,records,duplicates,rate".
  private static Map<String, long[]> readOutput(Path output) throws IOException {
    Map<String, long[]> result = new HashMap<>();
    try (Stream<Path> parts = Files.list(output)) {
      for (Path part : parts.filter(p -> p.getFileName().toString().startsWith("part")).collect(Collectors.toList())) {
        for (String line : Files.readAllLines(part)) {
          if (line.isBlank()) {
            continue;
          }
          String[] f = line.split(",");
          result.put(f[0], new long[] {Long.parseLong(f[1].trim()), Long.parseLong(f[2].trim())});
        }
      }
    }
    return result;
  }
}
