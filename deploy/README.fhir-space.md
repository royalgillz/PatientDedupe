---
title: PatientDedupe FHIR
emoji: 🧬
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# PatientDedupe FHIR API

A standards FHIR `Patient/$match` endpoint over the PatientDedupe matching engine. It
lets any system that speaks FHIR ask "who in the index looks like this person?" and get
back scored, graded candidates.

- Capability statement: `GET /fhir/metadata`
- Match: `POST /fhir/Patient/$match` with a `Parameters` body carrying a `Patient` in the
  `resource` parameter (plus optional `onlyCertainMatches` and `count`).

The same C++ matching engine that runs in the browser and the Node API runs here too,
loaded into the JVM as WebAssembly. Candidates come from the same SQL blocking layer.
Data is synthetic (Synthea); responses never expose the synthetic ground-truth identity.

Example:

```
curl -s -X POST "$SPACE_URL/fhir/Patient/\$match" \
  -H "Content-Type: application/fhir+json" \
  -d '{"resourceType":"Parameters","parameter":[{"name":"resource","resource":{
        "resourceType":"Patient","name":[{"family":"Schoen","given":["Abdoul"]}],
        "birthDate":"2000-05-31","gender":"male",
        "address":[{"line":["Fay Jct"],"city":"Lunenburg","postalCode":"01462"}]}}]}'
```
