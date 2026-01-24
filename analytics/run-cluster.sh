#!/usr/bin/env bash
# Runs the job on the single-node HDFS + YARN cluster from docker-compose.yml: brings the
# cluster up, loads the snapshot into HDFS, submits the job to YARN, and prints the result
# from HDFS. Usage: ./run-cluster.sh <scale>   (e.g. 1k, 100k). Tear down with
# `docker compose down` when finished.
# @spec ANALYTICS-009
set -euo pipefail
cd "$(dirname "$0")"
SCALE="${1:-1k}"
INPUT="source_records_${SCALE}.csv"

docker compose up -d
echo "waiting for HDFS to accept writes..."
until docker compose exec -T resourcemanager hdfs dfs -mkdir -p /analytics-in 2>/dev/null; do sleep 3; done

docker compose exec -T resourcemanager bash -c "
  hdfs dfs -put -f /data/${INPUT} /analytics-in/
  hdfs dfs -rm -r -f /analytics-out >/dev/null 2>&1 || true
  hadoop jar /job/patientdedupe-analytics-0.1.0.jar com.patientdedupe.analytics.AnalyticsDriver \
    /analytics-in/${INPUT} /analytics-out"

echo "=== duplicate rate by site (${SCALE}, on YARN) ==="
docker compose exec -T resourcemanager hdfs dfs -cat /analytics-out/part-r-00000
