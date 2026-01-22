-- Candidate generation: the heart of the blocking layer.
--
-- Each SELECT is one blocking strategy (a self-join on a shared key). Different
-- strategies catch different kinds of duplicate, and UNION keeps recall up while
-- de-duplicating the pairs. a.id < b.id avoids self-pairs and double-counting. Every
-- join condition is backed by a functional index from blocking_setup.sql.
--
-- The matcher then scores only these candidates, not the full cross product.

-- same-sounding surname and same birth year (typos, nicknames, abbreviations)
select a.id as a_id, b.id as b_id
from source_records a
join source_records b
  on a.id < b.id
 and dmetaphone(a.last_name) = dmetaphone(b.last_name)
 and left(a.dob, 4) = left(b.dob, 4)

union

-- same-sounding first name and same birth year (surname changed, e.g. after marriage)
select a.id, b.id
from source_records a
join source_records b
  on a.id < b.id
 and dmetaphone(a.first_name) = dmetaphone(b.first_name)
 and left(a.dob, 4) = left(b.dob, 4)

union

-- same-sounding first and last name (a typo or transposition in the birth date)
select a.id, b.id
from source_records a
join source_records b
  on a.id < b.id
 and dmetaphone(a.first_name) = dmetaphone(b.first_name)
 and dmetaphone(a.last_name) = dmetaphone(b.last_name)

union

-- shared surname prefix and an exact birth date
select a.id, b.id
from source_records a
join source_records b
  on a.id < b.id
 and left(lower(a.last_name), 3) = left(lower(b.last_name), 3)
 and a.dob = b.dob;
