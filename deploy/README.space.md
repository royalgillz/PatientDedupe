---
title: PatientDedupe
emoji: 🧬
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
short_description: Patient identity-resolution stewardship console (EMPI)
---

# PatientDedupe

A data-steward's workspace for resolving duplicate patient records: a ranked review
queue, side-by-side adjudication with field-by-field match reasons, golden-record
survivorship, and a full audit trail. The matching is a hand-written C++ engine
compiled to WebAssembly and run by the Node API.

No real patient data is used. All records come from the open-source Synthea
generator. Built from https://github.com/royalgillz/PatientDedupe and deployed on
every push.
