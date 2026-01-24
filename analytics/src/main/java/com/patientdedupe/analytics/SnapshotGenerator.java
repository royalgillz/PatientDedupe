package com.patientdedupe.analytics;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

// Produces a reproducible analytics snapshot of (id, source_system, person_key) at a given
// scale, following the same injection rules as the seed pipeline so the 100k run is
// comparable to the 1k one: base records one per person across the five sites, then
// duplicates at the same rate as the dev set (240 per 820 base records), each duplicate
// carrying its original's person_key and a different, re-registering site. Base ids are
// lower than duplicate ids, so the minimum-id record of a person is always the original.
//
// The duplicate-rate-by-site metric needs only these three columns, so this generates the
// scaled snapshot directly rather than rerunning Synthea's full demographics. It is
// deterministic: a fixed seed gives the same snapshot every time.
//
// @spec ANALYTICS-010
public final class SnapshotGenerator {

  private static final String[] SITES = {"Epic ADT", "Cerner", "Lab Feed", "Registration", "Radiology"};
  private static final double DUPES_PER_BASE = 240.0 / 820.0;

  // The same small LCG the seed pipeline uses, so the generation is reproducible.
  private long state;

  private SnapshotGenerator(long seed) {
    this.state = seed;
  }

  private int nextInt(int bound) {
    state = (state * 1103515245L + 12345L) & 0x7fffffffL;
    return (int) (state % bound);
  }

  // total ~= base * (1 + DUPES_PER_BASE), so split the requested total accordingly.
  private void generate(int total, BufferedWriter out) throws IOException {
    int base = (int) Math.round(total / (1.0 + DUPES_PER_BASE));
    int dupes = total - base;

    int[] siteOf = new int[base];
    int id = 1;
    for (int person = 0; person < base; person++) {
      int site = nextInt(SITES.length);
      siteOf[person] = site;
      out.write(id + "," + SITES[site] + "," + person);
      out.newLine();
      id++;
    }
    for (int d = 0; d < dupes; d++) {
      int person = nextInt(base);
      int site = (siteOf[person] + 1 + nextInt(SITES.length - 1)) % SITES.length; // different site
      out.write(id + "," + SITES[site] + "," + person);
      out.newLine();
      id++;
    }
  }

  public static void main(String[] args) throws IOException {
    if (args.length < 2) {
      System.err.println("usage: SnapshotGenerator <total-rows> <output-csv> [seed]");
      System.exit(2);
    }
    int total = Integer.parseInt(args[0]);
    long seed = args.length > 2 ? Long.parseLong(args[2]) : 1234567L;
    SnapshotGenerator gen = new SnapshotGenerator(seed);
    try (BufferedWriter out = Files.newBufferedWriter(Paths.get(args[1]), StandardCharsets.UTF_8)) {
      gen.generate(total, out);
    }
    System.out.println("wrote " + total + " rows to " + args[1]);
  }
}
