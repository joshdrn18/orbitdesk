# OrbitDesk

**One workspace. Everything your business needs.**

OrbitDesk is a global freemium workspace for creators, freelancers, online sellers, and small businesses.

## Stack

- Vite + React + TypeScript
- Cloudflare Pages + Pages Functions
- Cloudflare D1 for relational data
- Cloudflare R2 for media storage (planned)
- Cloudflare KV for cache and rate-limit support (planned)

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run typecheck
npm run build
```

## Cloudflare Pages deployment

1. Create a D1 database named `orbitdesk-db`.
2. Copy its database ID into `wrangler.toml` in place of `REPLACE_WITH_D1_DATABASE_ID`.
3. Apply the database migration: `npx wrangler d1 migrations apply orbitdesk-db --remote`.
4. Connect this GitHub repository to Cloudflare Pages.
5. Set the build command to `npm install && npm run build` and output directory to `dist`.
6. Ensure the Pages project uses the D1 binding named `DB` from `wrangler.toml`.
7. Set `SITE_ORIGIN` to the exact production origin in the Pages environment.
8. Deploy and test `/api/health`, registration, login, and logout.

The Pages Functions API lives in `functions/api/[[path]].js` and delegates to `worker/index.js`.

## First administrator

After creating your own account, promote it manually in the D1 console. Replace the email with your own:

```sql
UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
```

Do not expose an admin bootstrap endpoint publicly.

## Current scope

Phase 1 foundation includes the responsive workspace UI, account registration/login/logout, secure cookie sessions, and initial D1 schema. Email verification, password reset, admin APIs, and the actual tool modules are subsequent milestones.

## Security

- Passwords use PBKDF2-SHA-256 with per-user random salts.
- Session tokens are random; only SHA-256 token hashes are stored in D1.
- Session cookies are Secure, HttpOnly, and SameSite=Lax.
- All user-owned data must be authorized server-side by user/workspace ownership.
- Never put Cloudflare secrets or API tokens in frontend code.
