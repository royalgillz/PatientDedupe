import { defineConfig } from "vitest/config";

// One Testcontainers Postgres is shared across the suite (started in globalSetup), so the
// files run sequentially in a single process rather than racing for the same database.
export default defineConfig({
  test: {
    globalSetup: ["./tests/globalSetup.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 180000,
  },
});
