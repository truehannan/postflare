/**
 * Postflare — one-time Cloudflare resource bootstrap.
 *
 * Creates the D1 database, writes its id into wrangler.jsonc, creates the R2
 * bucket, and applies migrations. Idempotent: safe to re-run.
 *
 *   node scripts/bootstrap.mjs
 *
 * Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (or an existing
 * `wrangler login`) for remote resources.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wranglerJsonc = join(root, "wrangler.jsonc");
const PLACEHOLDER = "REPLACE_ME_D1_DATABASE_ID";

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  try {
    return execSync(cmd, { cwd: root, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" }).trim();
  } catch (e) {
    console.error(`\nCommand failed: ${cmd}`);
    console.error(e.stdout ?? "");
    process.exit(1);
  }
}

function wrangler(args) {
  return run(`npx wrangler ${args}`);
}

// 1. D1 database
let config = readFileSync(wranglerJsonc, "utf8");
if (config.includes(PLACEHOLDER)) {
  console.log("Creating D1 database `postflare-db`…");
  const raw = wrangler("d1 create postflare-db --json");
  let databaseId = null;
  try {
    const parsed = JSON.parse(raw);
    databaseId = parsed.database_id ?? parsed[0]?.database_id;
  } catch {
    const match = raw.match(/"database_id"\s*:\s*"([a-f0-9-]+)"/i) ?? raw.match(/([a-f0-9]{32,})/i);
    databaseId = match?.[1];
  }
  if (!databaseId) {
    console.error("Could not parse database_id from output:\n", raw);
    process.exit(1);
  }
  config = config.replace(PLACEHOLDER, databaseId);
  writeFileSync(wranglerJsonc, config);
  console.log(`Wrote D1 database_id into wrangler.jsonc: ${databaseId}`);
} else {
  console.log("D1 database_id already configured.");
}

// 2. R2 bucket (idempotent — ignore "already exists")
console.log("\nCreating R2 bucket `postflare-media`…");
try {
  wrangler("r2 bucket create postflare-media");
} catch {
  console.log("R2 bucket may already exist — continuing.");
}

// 3. Migrations
console.log("\nApplying D1 migrations…");
wrangler("d1 migrations apply postflare-db --remote");

console.log("\n✅ Cloudflare resources are ready. Next: set ENCRYPTION_KEY then `npm run deploy`.");
console.log('   Generate a key:  openssl rand -base64 32');
console.log('   Set it:          npx wrangler secret put ENCRYPTION_KEY');