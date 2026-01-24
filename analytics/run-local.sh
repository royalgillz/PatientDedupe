#!/usr/bin/env bash
# Runs the duplicate-rate-by-site job in Hadoop local mode (LocalJobRunner) against a
# snapshot CSV, with no cluster. This is the light fallback path; run-cluster.sh runs the
# same job on real HDFS + YARN. Usage: ./run-local.sh <scale>   (e.g. 1k, 100k, 1m)
# @spec ANALYTICS-009
set -euo pipefail
cd "$(dirname "$0")"
SCALE="${1:-1k}"
rm -rf "data/out_${SCALE}"
docker run --rm -v "$(pwd):/work" -w /work apache/hadoop:3.4.1 \
  hadoop jar target/patientdedupe-analytics-0.1.0.jar com.patientdedupe.analytics.AnalyticsDriver \
  -D mapreduce.framework.name=local -D fs.defaultFS=file:/// \
  "/work/data/source_records_${SCALE}.csv" "/work/data/out_${SCALE}"
echo "=== duplicate rate by site (${SCALE}, local mode) ==="
cat "data/out_${SCALE}/part-r-00000"
