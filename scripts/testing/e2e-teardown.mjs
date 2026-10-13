import { execFileSync } from "node:child_process";

export default function teardownDatabase() {
  execFileSync("node", ["scripts/testing/e2e-database.mjs", "teardown"], { stdio: "inherit" });
}
