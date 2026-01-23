package com.patientdedupe.fhir;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import ca.uhn.fhir.context.FhirContext;
import com.patientdedupe.fhir.support.FakeCandidateProvider;
import com.patientdedupe.fhir.support.FakeMatchEngine;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Map;
import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.server.ServerConnector;
import org.hl7.fhir.r4.model.Bundle;
import org.hl7.fhir.r4.model.Bundle.BundleType;
import org.hl7.fhir.r4.model.HumanName;
import org.hl7.fhir.r4.model.Parameters;
import org.hl7.fhir.r4.model.Patient;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

// Stands the real HAPI server up on an embedded Jetty with stubbed dependencies and drives
// a $match call over HTTP, proving the FHIR transport: the operation routes, the
// Parameters body binds, and a searchset Bundle comes back.
@Tag("integration")
class FhirServerIT {

  private static final FhirContext FHIR = FhirContext.forR4Cached();

  // @spec FHIR-001
  @Test
  void matchOverHttpReturnsASearchsetBundle() throws Exception {
    SourceRecord smith = new SourceRecord(1, "EPIC", "MRN1", "Robert", "Smith",
        "1984-05-12", "M", "1 Main St", "Boston", "MA", "02118", 1);
    MatchEngine engine = new FakeMatchEngine(
        Map.of("Smith", new MatchResult(0.97, "match", List.of())));
    FhirMatchService service = new FhirMatchService(
        FakeCandidateProvider.returning(List.of(smith)), engine);

    Server server = FhirServer.create(0, service);
    server.start();
    try {
      int port = ((ServerConnector) server.getConnectors()[0]).getLocalPort();

      Patient probe = new Patient();
      probe.addName(new HumanName().addGiven("Robert").setFamily("Smith"));
      Parameters in = new Parameters();
      in.addParameter().setName("resource").setResource(probe);
      String body = FHIR.newJsonParser().encodeResourceToString(in);

      HttpResponse<String> response = HttpClient.newHttpClient().send(
          HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/fhir/Patient/$match"))
              .header("Content-Type", "application/fhir+json")
              .POST(HttpRequest.BodyPublishers.ofString(body))
              .build(),
          HttpResponse.BodyHandlers.ofString());

      assertEquals(200, response.statusCode());
      Bundle out = FHIR.newJsonParser().parseResource(Bundle.class, response.body());
      assertEquals(BundleType.SEARCHSET, out.getType());
      assertFalse(out.getEntry().isEmpty(), "the Smith match should come back over HTTP");
    } finally {
      server.stop();
    }
  }
}
