-- Phase 2 blocking setup.
--
-- Comparing every record to every other one is N-squared and does not scale. Blocking
-- only compares records that share a "blocking key", so the matcher sees a tiny
-- fraction of all possible pairs. fuzzystrmatch gives us phonetic functions
-- (dmetaphone) so records that sound alike land in the same block even when spelled
-- differently. The functional indexes below let the blocking self-joins use an index
-- instead of scanning, which is what makes this fast at scale.
--
-- @spec BLOCK-003

create extension if not exists fuzzystrmatch;

create index if not exists idx_block_last_dmeta  on source_records (dmetaphone(last_name));
create index if not exists idx_block_first_dmeta on source_records (dmetaphone(first_name));
create index if not exists idx_block_dob_year    on source_records (left(dob, 4));
create index if not exists idx_block_last_prefix on source_records (left(lower(last_name), 3));
create index if not exists idx_block_dob         on source_records (dob);
