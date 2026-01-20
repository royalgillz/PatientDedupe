import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "./db.js";

// Applies schema.sql. Safe to run repeatedly (everything is "create ... if not exists").
const here = dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(resolve(here, "../schema.sql"), "utf8");

await sql.unsafe(schema);
console.log("schema applied");
await sql.end();
