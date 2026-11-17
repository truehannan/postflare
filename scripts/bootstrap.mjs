/**
 * Postflare — idempotent Cloudflare resource bootstrap.
 *
 * Creates the D1 database, R2 bucket and applies migrations ONLY when they do
 * not already exist. Re-running is safe: existing resources are detected and
 * reused (their ids are written back into wrangler.jsonc when missing).
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
const DB_NAME = "postflare-db";
const BUCKET_NAME = "postflare-media";

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
 * `wrangler d1 create` prints a binding snippet containing the database id.
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

/** Look up an existing D1 database by name, returning its id (or null). */
function findExistingDatabaseId() {
  const raw = wrangler("d1 list --json");
  let list = null;
  try {
    const parsed = JSON.parse(raw);
    list = Array.isArray(parsed) ? parsed : parsed.result ?? parsed.items ?? [parsed];
  } catch {
    return null;
  }
  for (const db of list) {
    if (db?.name === DB_NAME) {
      return db.uuid ?? db.database_id ?? db.id ?? null;
    }
  }
  return null;
}

/** Check whether an R2 bucket already exists (plain-text `r2 bucket list`). */
function bucketExists() {
  const raw = wrangler("r2 bucket list", { allowFailure: true });
  if (raw === null) return false;
  // Match the bucket name as a whole cell in wrangler's table output, so a
  // bucket like "postflare-media-prod" is not treated as a match.
  const escaped = BUCKET_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[\\s│┌┐└┘├┤┬┴┼])${escaped}([\\s│┌┐└┘├┤┬┴┼]|$)`).test(raw);
}

// ---------------------------------------------------------------------------
// 1. D1 database (reuse if it already exists)
// ---------------------------------------------------------------------------
let config = readFileSync(wranglerJsonc, "utf8");
if (config.includes(PLACEHOLDER)) {
  let databaseId = findExistingDatabaseId();
  if (databaseId) {
    console.log(`D1 database \`${DB_NAME}\` already exists — reusing it.`);
  } else {
    console.log(`Creating D1 database \`${DB_NAME}\`…`);
    databaseId = extractDatabaseId(wrangler(`d1 create ${DB_NAME}`));
    if (!databaseId) {
      console.error("Could not determine the database id from wrangler output.");
      console.error(`Create it manually and paste the database_id into wrangler.jsonc:\n  npx wrangler d1 create ${DB_NAME}`);
      process.exit(1);
    }
  }
  config = config.replace(PLACEHOLDER, databaseId);
  writeFileSync(wranglerJsonc, config);
  console.log(`Wrote D1 database_id into wrangler.jsonc: ${databaseId}`);
} else {
  console.log("D1 database_id already configured — skipping.");
}

// ---------------------------------------------------------------------------
// 2. R2 bucket (create only when missing)
// ---------------------------------------------------------------------------
if (bucketExists()) {
  console.log(`\nR2 bucket \`${BUCKET_NAME}\` already exists — reusing it.`);
} else {
  console.log(`\nCreating R2 bucket \`${BUCKET_NAME}\`…`);
  const result = wrangler(`r2 bucket create ${BUCKET_NAME}`, { allowFailure: true });
  if (result === null) {
    console.log("Bucket creation returned an error (it may have been created concurrently) — continuing.");
  }
}

// ---------------------------------------------------------------------------
// 3. Migrations (idempotent — only pending migrations are applied)
// ---------------------------------------------------------------------------
console.log("\nApplying D1 migrations (only pending ones run)…");
wrangler(`d1 migrations apply ${DB_NAME} --remote`);

console.log("\n✅ Cloudflare resources are ready. Next: set ENCRYPTION_KEY, then deploy.");
console.log("   Generate a key:  openssl rand -base64 32");
console.log("   Set it:          npx wrangler secret put ENCRYPTION_KEY");