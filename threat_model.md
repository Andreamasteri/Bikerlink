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
- **Sensitive user data** — profile data, phone numbers, geo coordinates, club memberships, messages, chat attachments, profile photos, garage photos, and export bundles. Exposure impacts user privacy and safety.
- **User-generated files** — profile photos, motorcycle photos, contest photos, chat images, ad creatives, manuals/legal docs, and other uploaded media stored either in object storage or local uploads paths.
- **Application secrets and third-party credentials** — session secret, mail credentials, Last.fm credentials, Apple reviewer password, database access, and any environment-backed API keys.
- **Server-side network access** — backend ability to fetch remote URLs (for example radio streams and external APIs). Abuse can turn the backend into an internal-network proxy.
- **Operational telemetry surfaces** — public or pre-auth startup/error reporting endpoints and their retained in-memory or persistent diagnostic data. Abuse can impact availability and pollute incident-response signals.

## Trust Boundaries

- **Mobile client to backend API** — all request bodies, headers, query params, filenames, and bearer session tokens are attacker-controlled until validated server-side.
- **Unauthenticated to authenticated routes** — some pages and APIs are public, while most user data requires a valid session. This boundary must be enforced on every route, not inferred from frontend behavior.
- **Authenticated user to admin/moderator functionality** — admin and moderator routes expose account management, content control, and operational data. Role checks must happen server-side for every privileged action.
- **Authenticated user to other users' private content** — chat media, profile photos, garage photos, exact coordinates, club memberships, and pending club proposal data must be treated as scoped private objects, not merely hidden in the UI.
- **Authenticated user to other users' private preference objects** — wishlist motorcycles, wishlist photos, and other match-linked records are private user-scoped data and must enforce owner checks on read and write paths, even when a related match or notification exists.
- **Authenticated member to moderator-only club data** — club members may legitimately access club content, but pending location proposals and moderation-only metadata still require narrower server-side filtering than the raw club row.
- **Backend to PostgreSQL** — the API server has broad read/write database access; injection or broken authorization at the API layer can become full data compromise.
- **Backend to object storage / local uploads** — file names and object paths cross from untrusted input into durable storage and file-serving routes. Public serving must not expose private content by guessable paths alone.
- **Backend to external services** — radio proxying, music integrations, mail sending, and OTA/update infrastructure cause the server to reach out with trusted network access and secrets.
- **Startup/initialization to live production state** — boot-time migrations and seed routines modify durable production data before user traffic arrives. Unsafe defaults here are production vulnerabilities, not just dev conveniences.
- **Public diagnostics to operator-only telemetry** — admin-adjacent reporting endpoints exposed before authentication must not allow untrusted callers to inject large payloads or forge operational state.

## Scan Anchors

- **Production backend entry points:** `server/index.ts`, `server/routes.ts`, route modules under `server/routes/`.
- **Highest-risk areas:** auth/session handling in `server/routes/auth.ts`; startup seeding in `server/auto-seed.ts`; admin/moderation in `server/routes/admin.ts` and `server/routes/moderator.ts`; uploads and file serving in `server/routes/users.ts`, `server/routes/chat.ts`, `server/routes/contest.ts`, `server/routes/events.ts`, `server/routes/motorcycles.ts`; wishlist and match-linked preference objects in `server/routes/wishlist.ts` and `server/routes/proposals.ts`; user discovery/privacy logic in `server/routes/users.ts`; club authorization boundaries in `server/routes/motoclubs.ts`; outbound fetch/proxy logic in `server/routes/radio.ts` and music integrations.
- **Public surfaces:** `/apple-review`, public settings endpoints, public media/file routes, unauthenticated or pre-auth telemetry/reporting endpoints, and radio preview/proxy endpoints.
- **Authenticated surfaces:** most `/api/users`, `/api/chat`, `/api/contest`, `/api/events`, `/api/motoclubs`, `/api/routes`, `/api/lastfm`, `/api/wishlist`, and `/api/proposals` routes.
- **Admin/mod surfaces:** `/api/admin/*`, `/api/moderator/*`, admin-only uploads and system-management paths.
- **Usually dev-only / lower priority unless proven production-reachable:** `scripts/`, documentation files, generated artifacts, mock data helpers, local workflow helpers, Expo frontend-only scaffolding.

## Current validated priorities for future scans

- Treat any production startup seeding or reviewer/demo-account provisioning as a first-class auth risk; default or resettable credentials are in scope even when introduced as operational convenience.
- Treat platform-created fake or synthetic users as real production principals if they can log in or interact with ordinary users; shared credentials on those accounts are in scope.
- Treat email-verification and password-recovery codes as authentication factors: short codes, missing attempt limits, or flows that automatically create a session on success are in scope as account-takeover risks.
- Treat session-issuing auth endpoints as CSRF candidates even when the app uses `SameSite=Lax`; cross-site navigations can still create or swap a browser session if login/register/recovery POSTs lack origin or token validation.
- Treat exact user coordinates, club rosters/proposals, profile photos, garage photos, chat attachments, and wishlist preference objects as sensitive data that require server-side audience checks, not just frontend hiding or unguessable URLs.
- Treat any proxy/fetch endpoint that accepts attacker-controlled destinations as SSRF-prone unless it validates resolved IPs, redirect targets, and response-handling boundaries.
- Re-check current account status on authenticated requests; blocking or suspension is not an effective control if long-lived sessions remain usable after the status change.
- Treat user safety controls such as blocking as message-delivery boundaries that must be enforced consistently across text, image, attachment, and match-adjacent endpoints, not only on one send path or on later read paths.
- Treat public or pre-auth operational telemetry ingestion as an availability surface that needs payload caps, rate limits, and strict field truncation.
 - Re-check long-lived authenticated channels such as SSE or other streaming responses whenever sessions are revoked or account state changes; deleting server-side session rows alone does not revoke already-open streams.
- Treat `hideFromMap` as protection against derived distance leakage as well as raw coordinate leakage across every discovery and availability endpoint.
 - Treat club-scoped proposals as private club objects whose active-membership checks must be enforced on create, read, update, delete, and join flows, not only on list endpoints.
 - Treat club membership revocation as a cross-table authorization event: removing a member from `motoClubMembers` must also revoke any linked `conversationParticipants` access for the club chat.
- Treat public or low-friction telemetry and reporting endpoints that trigger email or durable storage as abuse surfaces: they should rely on trusted proxy-derived client identity (`req.ip`/Express proxy handling), and authenticated reporting still needs quotas and body caps.
- Treat admin-authored OTA metadata and moderator-authored client-rendered URLs as untrusted inputs that cross into public endpoints or end-user devices; privileged content pipelines still need server-side source restrictions.
- Treat match-linked object identifiers as sensitive capability references; if a route leaks another user's object ID, every downstream mutation path must still verify ownership server-side.
- Treat parent/child object relationships as authorization boundaries on every mutation path: checking ownership of a parent route, album, or container is insufficient if the final update/delete is keyed only by an attacker-supplied child ID.
- Treat `const { password, ...safeUser } = user` as unsafe for any cross-user or public-profile response; public account APIs must return an explicit allowlist of fields rather than the raw `users` row minus the password hash.
- Treat every `/api/admin/*` subrouter mount as suspect until it is explicitly wrapped in a server-side admin guard; being nested under the admin prefix alone is not an authorization control.
- Treat moderation approval flags as enforcement controls across every list, detail, vote, and media path that references moderated content, not only on the final file-serving route.
- Treat tokenized operator URLs and SSE endpoints as privileged bearer channels: query-string secrets are likely to leak via browser history, screenshots, shared links, and request logs, so they are not equivalent to a real admin session.
- Treat proposal and match APIs as part of the same privacy boundary as discovery/profile routes: they must honor `hideFromMap`, offline coordinate fuzzing, and club-membership scoping before returning location or proposal details.
- Treat the `/uploads` tree as deny-by-default for private user media: any new subpath is public unless explicitly wrapped in an auth check, and delete flows must remove the underlying object as well as the DB row.
- Treat public map-tile helpers as abuse surfaces: unauthenticated proxying of key-backed providers or unauthenticated provider-status mutation can become quota exhaustion or global service degradation for all users.

## Threat Categories

### Spoofing

Users authenticate with server-side sessions stored in PostgreSQL, with a mobile bearer-to-cookie bridge that accepts the raw signed session cookie value through the `Authorization` header. The system must ensure session tokens remain unpredictable, bound to a valid server-side session, and only granted after legitimate authentication or recovery flows. Boot-time seeded or reviewer/demo accounts must never create a predictable path to impersonate privileged or platform-run users.

### Tampering

Clients can submit profile data, geo coordinates, messages, uploads, club/event actions, wishlist objects, and administrative content changes. The backend must validate all user-controlled fields and enforce ownership and role checks server-side. Upload and storage paths must not let users overwrite or manipulate content outside their intended scope. Conversation-creation paths must not let one user insert themselves into an unrelated private thread.

### Information Disclosure

This project stores sensitive social and location data, plus private chats and uploaded images. API responses, exported data, logs, and public file-serving endpoints must only expose data intended for the requester. Publicly reachable reviewer/demo pages, seeded credentials, exact-coordinate discovery APIs, overly broad file routes, chat/media direct-object access, member endpoints that over-return club proposal fields, and raw media URLs that bypass block-aware profile access are especially sensitive here.

### Denial of Service

The backend accepts uploads, auth attempts, background location updates, error reports, startup beacons, and server-side fetch requests. It must rate-limit and bound resource usage on public or low-friction endpoints, cap upload sizes, cap retained telemetry payloads, and apply network timeouts so untrusted clients cannot cheaply consume CPU, memory, mail quota, or outbound connections.

### Elevation of Privilege

The largest risks are broken admin/moderator boundaries, hardcoded or resettable privileged credentials, long-lived sessions that survive suspension, IDORs over user/chat/media/wishlist objects, and SSRF or similar issues that let an attacker pivot through backend network trust. All privileged routes must independently verify admin/mod roles and current account status, and startup seed code must not grant durable default credentials in production.

### Repudiation

Admin and moderation actions materially affect users and platform safety. The system should preserve auditability for privileged actions, approvals/rejections, role/status changes, and other operational events so abuse can be investigated. Logs must capture the acting identity without exposing unnecessary secrets or attacker-controlled payloads that make operational telemetry untrustworthy.
