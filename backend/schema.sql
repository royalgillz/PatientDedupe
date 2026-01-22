-- PatientDedupe schema. The matching engine writes candidate pairs here; stewards
-- act on them; every action is recorded in the audit log. Designed to run on plain
-- Postgres (local Docker) and on Supabase without changes.

create table if not exists reviewers (
  id    serial primary key,
  name  text not null,
  email text not null unique,
  role  text not null default 'steward'
);

-- Raw patient records as they arrive from each source system. person_key is the
-- ground-truth identity: two records with the same person_key are really the same
-- human. It exists only because the data is synthetic, and it lets us measure
-- precision and recall honestly. A real feed would not have it.
create table if not exists source_records (
  id            serial primary key,
  source_system text not null,
  mrn           text not null,
  first_name    text not null,
  last_name     text not null,
  dob           text not null,
  gender        text not null,
  address       text not null,
  city          text not null,
  state         text not null default 'MA',
  zip           text not null,
  person_key    integer,
  created_at    timestamptz not null default now()
);

-- One scored candidate pair awaiting or having received a steward decision.
create table if not exists candidate_pairs (
  id                serial primary key,
  record_a_id       integer not null references source_records(id),
  record_b_id       integer not null references source_records(id),
  score             double precision not null,
  band              text not null,                      -- match | review | no-match
  reasons           jsonb not null,                     -- per-field breakdown from the engine
  status            text not null default 'pending',    -- pending | merged | not_a_match | need_info
  is_true_duplicate boolean,                            -- ground truth, for honest metrics
  created_at        timestamptz not null default now(),
  decided_at        timestamptz,
  decided_by        integer references reviewers(id),
  reason_code       text,
  note              text
);

-- The surviving "golden" record produced when a pair is merged.
create table if not exists golden_records (
  id                serial primary key,
  enterprise_id     text not null unique,
  pair_id           integer references candidate_pairs(id),
  fields            jsonb not null,                     -- surviving value + which source won, per field
  member_record_ids integer[] not null,
  created_at        timestamptz not null default now(),
  created_by        integer references reviewers(id)
);

-- Immutable record of every steward action. This is the trust surface.
create table if not exists audit_log (
  id          serial primary key,
  ts          timestamptz not null default now(),
  actor       text not null,
  action      text not null,                            -- merge | not_a_match | need_info | unmerge
  pair_id     integer references candidate_pairs(id),
  record_a_id integer,
  record_b_id integer,
  score       double precision,
  reason_code text,
  note        text,
  details     jsonb
);

-- A single-row summary of the last blocking run: how much it cut the comparison
-- count, and how many true duplicates it still captured.
create table if not exists blocking_stats (
  id              integer primary key default 1,
  all_pairs       bigint not null,
  candidate_pairs bigint not null,
  reduction       double precision not null,
  true_duplicates integer not null,
  captured        integer not null,
  recall          double precision not null,
  generated_at    timestamptz not null default now()
);

create index if not exists idx_pairs_status on candidate_pairs(status);
create index if not exists idx_pairs_score  on candidate_pairs(score desc);
create index if not exists idx_source_person on source_records(person_key);
create index if not exists idx_audit_ts on audit_log(ts desc);
