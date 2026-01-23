package com.patientdedupe.fhir;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

// Exercises the real engine: the C++ matcher compiled to wasm, loaded in the JVM. Needs
// the built pdd_engine.wasm, so it is tagged "integration" and excluded from the default
// run. Point it at the artifact with -Dpdd.engine.wasm=/path/to/pdd_engine.wasm.
@Tag("integration")
class WasmMatchEngineIT {

  private static Path wasm() {
    return Path.of(System.getProperty("pdd.engine.wasm", "../engine/build/pdd_engine.wasm"));
  }

  private static PatientRecord bob() {
    return new PatientRecord("Robert", "Smith", "1984-05-12", "M", "1 Main St", "Boston", "02118");
  }

  // @spec FHIR-004
  @Test
  void scoresAnIdenticalPairAsAConfidentMatch() throws Exception {
    assertTrue(Files.exists(wasm()), "build pdd_engine.wasm first: " + wasm().toAbsolutePath());
    try (WasmMatchEngine engine = new WasmMatchEngine(wasm())) {
      MatchResult r = engine.score(bob(), bob());
      assertEquals("match", r.label());
      assertTrue(r.score() > 0.95, "identical records should score near 1.0, was " + r.score());
    }
  }

  // @spec FHIR-015
  @Test
  void concurrentScoringStaysConsistent() throws Exception {
    assertTrue(Files.exists(wasm()), "build pdd_engine.wasm first: " + wasm().toAbsolutePath());
    try (WasmMatchEngine engine = new WasmMatchEngine(wasm())) {
      double expected = engine.score(bob(), bob()).score();

      int threads = 16;
      ExecutorService pool = Executors.newFixedThreadPool(threads);
      List<Callable<Double>> tasks = new ArrayList<>();
      for (int i = 0; i < 200; i++) {
        tasks.add(() -> engine.score(bob(), bob()).score());
      }
      List<Future<Double>> results = pool.invokeAll(tasks);
      pool.shutdown();

      for (Future<Double> f : results) {
        assertEquals(expected, f.get(), 1e-9, "concurrent calls must not corrupt engine memory");
      }
    }
  }
}
