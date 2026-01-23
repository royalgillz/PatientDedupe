-- Single-probe blocking lookup for the FHIR Patient/$match facade (FHIR-005).
--
-- This is the one-sided mirror of blocking_candidates.sql. That file self-joins
-- source_records to find duplicate PAIRS among the stored records; this one finds the
-- candidates for ONE external probe record that is not in the table. The two share the
-- same four strategy definitions and ride the same functional indexes from
-- blocking_setup.sql.
--
-- KEEP IN SYNC: a change to the strategy set in blocking_candidates.sql must be mirrored
-- here and in ProbeQueryBuilder (the Java class that assembles this query at runtime and
-- drops any strategy whose probe key is absent, for example the exact-date strategy when
-- the probe carries only a birth year).
--
-- Parameters: :first_name, :last_name, :dob (yyyy-mm-dd), :year (= left(dob, 4)).

select id, source_system, mrn, first_name, last_name, dob, gender,
       address, city, state, zip, person_key
from source_records s
where
   -- 1. same-sounding surname and same birth year (typos, nicknames, abbreviations)
   (dmetaphone(s.last_name) = dmetaphone(:last_name) and left(s.dob, 4) = :year)
   -- 2. same-sounding first name and same birth year (surname changed, e.g. after marriage)
or (dmetaphone(s.first_name) = dmetaphone(:first_name) and left(s.dob, 4) = :year)
   -- 3. same-sounding first and last name (a typo or transposition in the birth date)
or (dmetaphone(s.first_name) = dmetaphone(:first_name) and dmetaphone(s.last_name) = dmetaphone(:last_name))
   -- 4. shared surname prefix and an exact birth date
or (left(lower(s.last_name), 3) = left(lower(:last_name), 3) and s.dob = :dob);
