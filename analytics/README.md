# Analytics: duplicate rate by registration site

A hand-written Java MapReduce job (with a HiveQL twin) that computes, over the synthetic
population, how many of each registration site's records are duplicates. It runs on a
single-node Hadoop and is measured at two scales.

## The metric

Records that share a `person_key` are one person; the minimum-id record is the original
(primary) and the rest are duplicates, each attributed to its own `source_system`. Per
site the job reports records, duplicates, and the rate, ordered worst-first.

## Layout

- `src/main/java/.../DuplicateRate.java` - the canonical logic, in plain Java.
- `src/main/java/.../AnalyticsDriver.java` - the two chained MapReduce jobs (label by
  person, aggregate by site) and the driver.
- `src/main/resources/hive/duplicate_rate_by_site.sql` - the HiveQL twin (null-safe join).
- `src/main/java/.../SnapshotGenerator.java` - reproducible scaled snapshot generator.
- `docker-compose.yml` + `hadoop.env` - single-node HDFS + YARN.
- `run-cluster.sh` / `run-local.sh` - run on the cluster, or in local mode.

## Build and run

```
# build the job jar (Java 8 bytecode, to match the Hadoop runtime) on JDK 11
mvn -DskipTests package

# generate the snapshots (1k is exported from Postgres; larger ones are generated)
java -cp target/classes com.patientdedupe.analytics.SnapshotGenerator 100000 data/source_records_100k.csv

# run on the single-node HDFS + YARN cluster
./run-cluster.sh 1k          # then: docker compose down

# or run in local mode (no cluster)
./run-local.sh 100k
```

## Tests

```
mvn test                                     # logic + SQL parity (H2), on JDK 11
mvn test -Dtest.excludedGroups= "-Dtest=*IT" # + the LocalJobRunner pipeline (POSIX/Linux)
```

The pipeline integration test runs the real job in local mode; it needs a POSIX
environment (Linux, or winutils on Windows). `HiveParityTest` runs the identical null-safe
SQL on H2 and checks it equals the canonical logic, so the Hive twin's parity is guarded
automatically.

## The HiveQL twin

`duplicate_rate_by_site.sql` declares an external table over the snapshot and computes the
same metric. To run it in real Hive, point the table's `LOCATION` at the HDFS input
directory (`/analytics-in`) used by `run-cluster.sh`, and execute it through beeline.
