import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "./db.js";

// Applies schema.sql. Safe to run repeatedly (everything is "create ... if not exists").
const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(resolve(here, "../schema.sql"), "utf8");
const blocking = readFileSync(resolve(here, "../../sql/blocking_setup.sql"), "utf8");

await sql.unsafe(schema);
await sql.unsafe(blocking);
console.log("schema and blocking setup applied");
await sql.end();
