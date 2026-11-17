# Security & encryption

## The one secret

Postflare has exactly one manually configured application secret:

```
ENCRYPTION_KEY
```

It is a **base64-encoded 32-byte key** used to AES-256-GCM encrypt every
third-party platform credential stored in the application. It lives in a
Cloudflare Worker secret — never in D1, R2, source code, a committed env file,
or the frontend bundle.

Generate it:

```bash
openssl rand -base64 32
```

Set it:

```bash
# production
npx wrangler secret put ENCRYPTION_KEY

# local development (written to .dev.vars, which is gitignored)
echo "ENCRYPTION_KEY=$(openssl rand -base64 32)" >> .dev.vars
```

For CI deploys, add the same value as a repository secret named
`ENCRYPTION_KEY`.

## Encryption format

Every credential is stored in `integration_credentials.ciphertext` as a
versioned, authenticated envelope:

```json
{
  "version": 1,
  "algorithm": "AES-GCM",
  "keyVersion": 1,
  "iv": "<base64 12-byte IV>",
  "ciphertext": "<base64>"
}
```

- **AES-256-GCM** via the Web Crypto API only (no Node crypto).
- A **unique 96-bit IV** is generated for every encryption operation and is
  never reused with the same key.
- The GCM authentication tag is verified before any plaintext is returned.
- `version` and `algorithm` are checked on read; unknown values are rejected.

The only code allowed to decrypt is `worker/services/credentials.ts`
(`getCredentials`). API responses return masked values (`••••••••••••••••`) and
a list of which fields exist — never the plaintext.

## Password hashing

Local passwords are hashed with **PBKDF2-SHA256** (Web Crypto, 100,000
iterations, 16-byte random salt) and compared in constant time. The hash format
is versioned so the KDF can be strengthened later.

> **Why 100,000?** Cloudflare Workers caps Web Crypto PBKDF2 at 100,000
> iterations — requesting more throws `Pbkdf2 failed: iteration counts above
> 100000 are not supported`. `hashPassword` clamps to this limit so behaviour is
> identical in the Worker and in Node. This limit concerns **password hashing
> only** and is unrelated to `ENCRYPTION_KEY`.

## Key rotation

`CipherEnvelope.keyVersion` supports multiple keys. To rotate:

1. Create a new `ENCRYPTION_KEY` (never reuse the old one).
2. Migrate existing rows with the server-side `rotateEncryptionKey`
   (re-encrypts every credential from the old key to the new key, preserving
   `keyVersion` metadata).
3. Only after every row is re-encrypted, replace the `ENCRYPTION_KEY` secret
   with the new value and delete the old key material.

Never silently replace the key — that makes existing credentials unreadable.

## OAuth callback security

- Cryptographically random, **single-use**, 10-minute-expiring state.
- **PKCE (S256)** where the provider supports it.
- The redirect URI recorded at `beginOAuth` is the one used for token
  exchange — the callback's claim is ignored.
- Tokens are stored encrypted; refresh tokens are refreshed before expiry with
  a single-writer guard to avoid refresh races.

## Other controls

- **Workspace isolation** — every query is scoped by `workspace_id` and the
  membership check in `requireWorkspace`; the frontend-supplied
  `X-Workspace-Id` header is never trusted without verification.
- **RBAC** — backend authorization (`roleAtLeast`) gates approval review and
  team management; hiding buttons is not authorization.
- **Rate limiting** — fixed-window limiter on auth, API, and webhook routes.
- **Audit logging** — credential, account, post, team, and settings changes are
  recorded with actor + action.
- **Secret redaction** — provider error messages are redacted before being
  persisted or returned.

## Known trade-offs

- PBKDF2-SHA256 is used instead of Argon2id because it is available natively in
  the Workers runtime. The hash format is versioned; swap in Argon2id (via WASM)
  without a schema change if desired.
- The in-memory rate limiter is per-isolate (approximate under scale-out). A
  Durable-Object-backed limiter can replace it in `middleware/rate-limit.ts`
  without touching call sites.