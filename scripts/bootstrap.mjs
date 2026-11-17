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

function run(cmd, { allowFailure = false } = {}) {
  console.log(`\n$ ${cmd}`);
  try {
    return execSync(cmd, { cwd: root, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" }).trim();
  } catch (e) {
    if (allowFailure) return null;
    console.error(`\nCommand failed: ${cmd}`);
    console.error((e.stdout ?? "").toString());
    console.error((e.stderr ?? "").toString());
    process.exit(1);
  }
}

function wrangler(args, opts) {
  return run(`npx wrangler ${args}`, opts);
}

/**
 * `wrangler d1 create` prints the binding block containing the database id.
 * Parse it defensively across output formats (TOML snippet or a bare UUID).
 */
function extractDatabaseId(output) {
  if (!output) return null;
  const patterns = [
    /database_id\s*=\s*"([^"]+)"/i,
    /"database_id"\s*:\s*"([^"]+)"/i,
    /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/,
  ];
  for (const pattern of patterns) {
    const match = output.match(pattern);
    if (match?.[1] ?? match?.[0]) return match[1] ?? match[0];
  }
  return null;
}

// 1. D1 database
let config = readFileSync(wranglerJsonc, "utf8");
if (config.includes(PLACEHOLDER)) {
  console.log("Creating D1 database `postflare-db`…");
  const output = wrangler("d1 create postflare-db");
  const databaseId = extractDatabaseId(output);
  if (!databaseId) {
    console.error("Could not determine the database id from wrangler output:");
    console.error(output);
    console.error("\nCreate it manually and paste the database_id into wrangler.jsonc:");
    console.error("  npx wrangler d1 create postflare-db");
    process.exit(1);
  }
  config = config.replace(PLACEHOLDER, databaseId);
  writeFileSync(wranglerJsonc, config);
  console.log(`Wrote D1 database_id into wrangler.jsonc: ${databaseId}`);
} else {
  console.log("D1 database_id already configured — skipping creation.");
}

// 2. R2 bucket (idempotent — "already exists" is fine)
console.log("\nCreating R2 bucket `postflare-media`…");
const r2Result = wrangler("r2 bucket create postflare-media", { allowFailure: true });
if (r2Result === null) {
  console.log("R2 bucket may already exist — continuing.");
}

// 3. Migrations
console.log("\nApplying D1 migrations…");
wrangler("d1 migrations apply postflare-db --remote");

console.log("\n✅ Cloudflare resources are ready. Next: set ENCRYPTION_KEY, then deploy.");
console.log("   Generate a key:  openssl rand -base64 32");
console.log("   Set it:          npx wrangler secret put ENCRYPTION_KEY");