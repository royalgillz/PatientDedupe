package com.patientdedupe.fhir;

import ca.uhn.fhir.context.FhirContext;
import ca.uhn.fhir.rest.server.RestfulServer;
import java.io.InputStream;
import java.util.List;
import javax.sql.DataSource;
import org.eclipse.jetty.ee10.servlet.ServletContextHandler;
import org.eclipse.jetty.ee10.servlet.ServletHolder;
import org.eclipse.jetty.server.Server;

// The HAPI FHIR plain server. It registers the PatientMatchProvider on an embedded Jetty
// and serves the FHIR base at /fhir, so $match is POST /fhir/Patient/$match. Server
// construction is separate from main so tests can stand the real server up with stubbed
// dependencies and exercise it over HTTP.
//
// @spec FHIR-001
public final class FhirServer {

  private static final String WASM_RESOURCE = "/pdd_engine.wasm";

  private FhirServer() {
  }

  public static Server create(int port, FhirMatchService service) {
    RestfulServer restful = new RestfulServer(FhirContext.forR4());
    restful.setResourceProviders(List.of(new PatientMatchProvider(service)));

    ServletContextHandler context = new ServletContextHandler();
    context.setContextPath("/");
    context.addServlet(new ServletHolder(restful), "/fhir/*");

    Server server = new Server(port);
    server.setHandler(context);
    return server;
  }

  public static void main(String[] args) throws Exception {
    int port = Integer.parseInt(System.getenv().getOrDefault("PORT", "8080"));

    DataSource dataSource = Db.fromEnv();
    MatchEngine engine = loadEngine();
    FhirMatchService service = new FhirMatchService(new SqlCandidateProvider(dataSource), engine);

    Server server = create(port, service);
    server.start();
    System.out.println("PatientDedupe FHIR API listening on :" + port
        + " (POST /fhir/Patient/$match)");
    server.join();
  }

  private static MatchEngine loadEngine() {
    InputStream wasm = FhirServer.class.getResourceAsStream(WASM_RESOURCE);
    if (wasm == null) {
      throw new IllegalStateException(
          "engine wasm not found on classpath at " + WASM_RESOURCE
              + "; build it with the Emscripten step before packaging");
    }
    return new WasmMatchEngine(wasm);
  }
}
