package com.patientdedupe.fhir;

import com.dylibso.chicory.runtime.ExportFunction;
import com.dylibso.chicory.runtime.HostFunction;
import com.dylibso.chicory.runtime.ImportValues;
import com.dylibso.chicory.runtime.Instance;
import com.dylibso.chicory.runtime.Memory;
import com.dylibso.chicory.wasm.Parser;
import com.dylibso.chicory.wasm.WasmModule;
import com.dylibso.chicory.wasm.types.ValueType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

// The real engine: the Emscripten-built pdd_engine.wasm loaded into the JVM with Chicory
// and called through its C-ABI exports (pdd_alloc, pdd_match, pdd_free). One wasm instance
// has a single linear memory and is not safe to call concurrently, so scoring is
// serialized; this guards memory without bounding throughput, since a call is microseconds.
//
// @spec FHIR-004, FHIR-015
public class WasmMatchEngine implements MatchEngine, AutoCloseable {

  private static final ObjectMapper JSON = new ObjectMapper();

  private final Instance instance;
  private final ExportFunction alloc;
  private final ExportFunction free;
  private final ExportFunction match;
  private final Memory memory;
  private final Object lock = new Object();

  public WasmMatchEngine(Path wasmFile) {
    this(Parser.parse(wasmFile));
  }

  // Loads the module from a stream, for the packaged jar where the wasm is a classpath
  // resource rather than a file on disk.
  public WasmMatchEngine(InputStream wasmStream) {
    this(Parser.parse(wasmStream));
  }

  private WasmMatchEngine(WasmModule module) {
    // The module's only import: a memory-growth notification we can safely ignore.
    HostFunction notifyGrowth = new HostFunction(
        "env", "emscripten_notify_memory_growth",
        List.of(ValueType.I32), List.of(),
        (Instance inst, long... args) -> null);

    this.instance = Instance.builder(module)
        .withImportValues(ImportValues.builder().addFunction(notifyGrowth).build())
        .build();
    this.alloc = instance.export("pdd_alloc");
    this.free = instance.export("pdd_free");
    this.match = instance.export("pdd_match");
    this.memory = instance.memory();
  }

  @Override
  public MatchResult score(PatientRecord a, PatientRecord b) {
    String[] fields = {
        a.firstName(), a.lastName(), a.dob(), a.gender(), a.address(), a.city(), a.zip(),
        b.firstName(), b.lastName(), b.dob(), b.gender(), b.address(), b.city(), b.zip()
    };

    synchronized (lock) {
      int[] ptrs = new int[fields.length];
      try {
        long[] argv = new long[fields.length];
        for (int i = 0; i < fields.length; i++) {
          ptrs[i] = writeCString(fields[i] == null ? "" : fields[i]);
          argv[i] = ptrs[i];
        }
        long resultPtr = match.apply(argv)[0];
        String json = memory.readCString((int) resultPtr);
        free.apply(resultPtr);
        return parse(json);
      } finally {
        for (int p : ptrs) {
          if (p != 0) {
            free.apply(p);
          }
        }
      }
    }
  }

  private int writeCString(String s) {
    byte[] bytes = s.getBytes(StandardCharsets.UTF_8);
    int ptr = (int) alloc.apply(bytes.length + 1)[0];
    memory.write(ptr, bytes);
    memory.writeByte(ptr + bytes.length, (byte) 0);
    return ptr;
  }

  private static MatchResult parse(String json) {
    try {
      JsonNode root = JSON.readTree(json);
      List<FieldScore> fields = new ArrayList<>();
      for (JsonNode f : root.get("fields")) {
        fields.add(new FieldScore(
            f.get("field").asText(),
            f.get("similarity").asDouble(),
            f.get("weight").asDouble(),
            f.get("detail").asText()));
      }
      return new MatchResult(root.get("score").asDouble(), root.get("label").asText(), fields);
    } catch (Exception e) {
      throw new IllegalStateException("could not parse engine result: " + json, e);
    }
  }

  @Override
  public void close() {
    // The Chicory instance holds no OS resources to release.
  }
}
