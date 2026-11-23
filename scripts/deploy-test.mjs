// TEST site deploy (dummy data, workers.dev address, its own database "verdi-db-test", no R2).
//   1. safety check of migrations
//   2. apply new migrations to the TEST database only
//   3. build with the "test" Cloudflare environment and deploy it as the "verdi-solarr-test" Worker
// Production (verdi-solarr / verdi-db) is never touched by this script.

import { execSync } from "node:child_process";

const env = {
  ...process.env,
  CLOUDFLARE_ENV: "test",
  // website error alerts (Sentry project verdi-web); a DSN is public by design
  VITE_SENTRY_DSN: "https://286bdd24638c14b0a0c7a9de2e7dd14a@o4512481735475201.ingest.us.sentry.io/4512481772175360",
  VITE_SENTRY_ENV: "test",
};
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
