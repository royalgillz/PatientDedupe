-- Duplicate rate by registration site, the HiveQL twin of the MapReduce job
-- (ANALYTICS-007). It must produce, per source_system, the same integer record and
-- duplicate counts as the MapReduce job, which is the canonical result.
--
-- A person is the set of records sharing a person_key; the primary is the minimum-id
-- record; every other record in the person is a duplicate, attributed to its own site.

CREATE EXTERNAL TABLE IF NOT EXISTS source_records (
  id INT, source_system STRING, person_key INT
) ROW FORMAT DELIMITED FIELDS TERMINATED BY ','
STORED AS TEXTFILE LOCATION '/data/analytics/source_records';

-- Primaries are computed only over real (non-null) person ids. A record with a null
-- person_key has no primary here, so the LEFT JOIN keeps it (counted in the total) and it
-- is never a duplicate, matching the canonical rule that a null/unique key is a singleton.
WITH primary_record AS (
  SELECT person_key, MIN(id) AS primary_id
  FROM source_records
  WHERE person_key IS NOT NULL
  GROUP BY person_key
)
SELECT s.source_system,
       COUNT(*)                                                              AS records,
       SUM(CASE WHEN p.primary_id IS NOT NULL AND s.id <> p.primary_id
                THEN 1 ELSE 0 END)                                           AS duplicates,
       ROUND(SUM(CASE WHEN p.primary_id IS NOT NULL AND s.id <> p.primary_id
                THEN 1 ELSE 0 END) / COUNT(*), 4)                            AS duplicate_rate
FROM source_records s
LEFT JOIN primary_record p ON s.person_key = p.person_key
GROUP BY s.source_system
ORDER BY duplicate_rate DESC, s.source_system ASC;
