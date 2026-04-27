# Threat Model

## Project Overview

BikerLink is a production mobile social platform for adult riders, built with an Expo/React Native client (`app/`) and an Express/TypeScript backend (`server/`) backed by PostgreSQL/Drizzle and Replit Object Storage. Authenticated users can register, log in, maintain profiles, share location, upload profile and contest photos, exchange private chat messages and attachments, join clubs and events, use radio/music features, and access moderation/admin workflows. The backend also exposes a small set of public pages and unauthenticated API endpoints, plus server-side integrations that fetch remote content.

Production assumptions for this scan:
- `NODE_ENV` is `production` in deployed environments.
- Replit handles TLS for client↔server traffic.
- Mockup sandbox and purely local/dev tooling are not production unless reachability is demonstrated.
- Focus only on vulnerabilities that matter in production deployments.

## Assets

- **User accounts and sessions** — user emails, hashed passwords, `connect.sid` sessions, bearer session bridge tokens, password-reset and email-verification tokens. Compromise enables account takeover.
- **Privileged accounts and admin capabilities** — admin/moderator identities, seeded system accounts, moderation queues, settings, uploads, and restart/health views. Compromise gives broad control over users and system behavior.
- **Sensitive user data** — profile data, phone numbers, geo coordinates, club memberships, messages, chat attachments, contest entries, and export bundles. Exposure impacts user privacy and safety.
- **User-generated files** — profile photos, contest photos, chat images, ad creatives, manuals/legal docs, and other uploaded media stored either in object storage or local uploads paths.
- **Application secrets and third-party credentials** — session secret, mail credentials, Last.fm credentials, Apple reviewer password, database access, and any environment-backed API keys.
- **Server-side network access** — backend ability to fetch remote URLs (for example radio streams and external APIs). Abuse can turn the backend into an internal-network proxy.

## Trust Boundaries

- **Mobile client to backend API** — all request bodies, headers, query params, filenames, and bearer session tokens are attacker-controlled until validated server-side.
- **Unauthenticated to authenticated routes** — some pages and APIs are public, while most user data requires a valid session. This boundary must be enforced on every route, not inferred from frontend behavior.
- **Authenticated user to admin/moderator functionality** — admin and moderator routes expose account management, content control, and operational data. Role checks must happen server-side for every privileged action.
- **Authenticated user to other users' private content** — chat media, exact coordinates, club rosters, and pending club proposal data must be treated as scoped private objects, not merely hidden in the UI.
- **Backend to PostgreSQL** — the API server has broad read/write database access; injection or broken authorization at the API layer can become full data compromise.
- **Backend to object storage / local uploads** — file names and object paths cross from untrusted input into durable storage and file-serving routes. Public serving must not expose private content by guessable paths alone.
- **Backend to external services** — radio proxying, music integrations, mail sending, and OTA/update infrastructure cause the server to reach out with trusted network access and secrets.
- **Startup/initialization to live production state** — boot-time migrations and seed routines modify durable production data before user traffic arrives. Unsafe defaults here are production vulnerabilities, not just dev conveniences.

## Scan Anchors

- **Production backend entry points:** `server/index.ts`, `server/routes.ts`, route modules under `server/routes/`.
- **Highest-risk areas:** auth/session handling in `server/routes/auth.ts`; startup seeding in `server/auto-seed.ts`; admin/moderation in `server/routes/admin.ts` and `server/routes/moderator.ts`; uploads and file serving in `server/routes/users.ts`, `server/routes/chat.ts`, `server/routes/contest.ts`, `server/routes/events.ts`; user discovery/privacy logic in `server/routes/users.ts`; club authorization boundaries in `server/routes/motoclubs.ts`; outbound fetch/proxy logic in `server/routes/radio.ts` and music integrations.
- **Public surfaces:** `/apple-review`, public settings endpoints, public media/file routes, unauthenticated error/reporting endpoints, and radio preview/proxy endpoints.
- **Authenticated surfaces:** most `/api/users`, `/api/chat`, `/api/contest`, `/api/events`, `/api/motoclubs`, `/api/routes`, `/api/lastfm` routes.
- **Admin/mod surfaces:** `/api/admin/*`, `/api/moderator/*`, admin-only uploads and system-management paths.
- **Usually dev-only / lower priority unless proven production-reachable:** `scripts/`, documentation files, generated artifacts, mock data helpers, local workflow helpers, Expo frontend-only scaffolding.

## Current validated priorities for future scans

- Treat any production startup seeding or reviewer/demo-account provisioning as a first-class auth risk; default or resettable credentials are in scope even when introduced as operational convenience.
- Treat exact user coordinates, club rosters/proposals, and chat attachments as sensitive data that require server-side audience checks, not just frontend hiding or unguessable URLs.
- Treat any proxy/fetch endpoint that accepts attacker-controlled destinations as SSRF-prone unless it validates resolved IPs, redirect targets, and response-handling boundaries.

## Threat Categories

### Spoofing

Users authenticate with server-side sessions stored in PostgreSQL, with a mobile bearer-to-cookie bridge that accepts the raw signed session cookie value through the `Authorization` header. The system must ensure session tokens remain unpredictable, bound to a valid server-side session, and only granted after legitimate authentication or recovery flows. Boot-time seeded or reviewer/demo accounts must never create a predictable path to impersonate privileged or real users.

### Tampering

Clients can submit profile data, geo coordinates, messages, uploads, club/event actions, and administrative content changes. The backend must validate all user-controlled fields and enforce ownership and role checks server-side. Upload and storage paths must not let users overwrite or manipulate content outside their intended scope.

### Information Disclosure

This project stores sensitive social and location data, plus private chats and uploaded images. API responses, exported data, logs, and public file-serving endpoints must only expose data intended for the requester. Publicly reachable reviewer/demo pages, seeded credentials, exact-coordinate discovery APIs, overly broad file routes, chat/media direct-object access, and club-detail responses that leak internal rosters or proposal fields are especially sensitive here.

### Denial of Service

The backend accepts uploads, auth attempts, background location updates, error reports, and server-side fetch requests. It must rate-limit and bound resource usage on public or low-friction endpoints, cap upload sizes, and apply network timeouts so untrusted clients cannot cheaply consume CPU, memory, mail quota, or outbound connections.

### Elevation of Privilege

The largest risks are broken admin/moderator boundaries, hardcoded or resettable privileged credentials, IDORs over user/chat/media objects, and SSRF or similar issues that let an attacker pivot through backend network trust. All privileged routes must independently verify admin/mod roles, and startup seed code must not grant durable default credentials in production.

### Repudiation

Admin and moderation actions materially affect users and platform safety. The system should preserve auditability for privileged actions, approvals/rejections, role/status changes, and other operational events so abuse can be investigated. Logs must capture the acting identity without exposing unnecessary secrets or private content.
