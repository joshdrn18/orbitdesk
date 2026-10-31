# OrbitDesk roadmap

## Product direction
OrbitDesk is a global freemium workspace for creators, freelancers, online sellers, and small businesses.

## Phase 1 — Core platform
- [x] Repository foundation and Vite/React frontend
- [x] Responsive workspace shell and authentication UI
- [x] Worker API: register, login, current session, logout
- [x] D1 schema for users, sessions, plans, workspaces, usage, and audit logs
- [ ] Provision D1 and apply migrations
- [ ] Configure deployment and smoke tests
- [ ] Add email verification and password reset after transactional email provider is selected
- [ ] Add admin bootstrap process and protected admin APIs

## Phase 2 — Main tools
- Link page builder and public profile routes
- QR generator and downloadable assets
- Product catalog and public shop pages
- R2 media uploads

## Phase 3 — Business tools
- Form builder and submissions
- Invoice/quotation builder and PDF export
- Customer database
- Privacy-conscious analytics

## Phase 4 — Monetization
- Subscription lifecycle and billing portal
- Payment provider integration after launch validation
- Plan enforcement and billing history

## Security notes
- Passwords are PBKDF2-SHA-256 derived with per-user random salts.
- Session tokens are random, stored only as SHA-256 hashes, and sent in Secure, HttpOnly, SameSite=Lax cookies.
- All user-owned records must be authorized server-side by user/workspace ownership.
- Do not expose service secrets in frontend code.
- Configure a real site origin and D1 database before deployment.
