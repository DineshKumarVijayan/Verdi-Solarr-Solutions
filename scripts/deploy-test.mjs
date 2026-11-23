// TEST site deploy (dummy data, workers.dev address, its own database "verdi-db-test", no R2).
//   1. safety check of migrations
//   2. apply new migrations to the TEST database only
//   3. build with the "test" Cloudflare environment and deploy it as the "verdi-solarr-test" Worker
// Production (verdi-solarr / verdi-db) is never touched by this script.

import { execSync } from "node:child_process";

const env = { ...process.env, CLOUDFLARE_ENV: "test" };
const run = (cmd) => {
  console.log(`\n$ ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit", env });
  } catch {
    console.error(`\nTest deploy stopped: "${cmd}" failed.`);
    process.exit(1);
  }
};

run("node scripts/check-migrations.mjs");
run("npx wrangler d1 migrations apply verdi-db-test --remote --env test");
run("npx vite build");
run("npx wrangler deploy");
console.log("\nTest site deployed.");
