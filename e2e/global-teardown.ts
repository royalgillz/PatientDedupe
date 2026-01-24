import { execSync } from "node:child_process";

export default async function globalTeardown() {
  try {
    execSync("docker rm -f pdd-e2e-pg", { stdio: "ignore" });
  } catch {
    // already gone
  }
}
