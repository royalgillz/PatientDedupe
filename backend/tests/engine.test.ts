import { expect, it } from "vitest";
import { scorePair } from "../src/engine.ts";

// @spec API-009
it("scores a candidate pair with the same WebAssembly engine the console uses", async () => {
  const a = { first_name: "Robert", last_name: "Smith", dob: "1980-01-01", gender: "M", address: "1 Main St", city: "Boston", zip: "02118" };
  const b = { first_name: "Bob", last_name: "Smith", dob: "1980-01-01", gender: "M", address: "1 Main Street", city: "Boston", zip: "02118" };

  const result = await scorePair(a, b);

  expect(result.score).toBeGreaterThan(0.8);
  expect(["match", "review", "no-match"]).toContain(result.label);
  expect(Array.isArray(result.fields)).toBe(true);
  expect(result.fields.length).toBeGreaterThan(0);
});
