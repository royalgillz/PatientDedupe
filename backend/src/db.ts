import "dotenv/config";
import postgres from "postgres";

// One Postgres pool for the whole API. Local development points at the Docker
// instance; the hosted demo sets DATABASE_URL to a Supabase connection string.
// For anything that is not localhost we require SSL and turn off prepared
// statements, since Supabase's connection pooler does not support them.
const url =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:5433/patientdedupe";

const isLocal = url.includes("localhost") || url.includes("127.0.0.1");

export const sql = postgres(url, {
  ssl: isLocal ? false : { rejectUnauthorized: false },
  prepare: isLocal,
  max: 10,
});
