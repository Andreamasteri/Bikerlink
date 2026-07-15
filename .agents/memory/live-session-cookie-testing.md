---
name: Building a live session bearer token for curl testing
description: How to hand-construct a valid Authorization Bearer token for /api/* live testing without a browser, and the exact session-row shape this app expects.
---

`server/routes.ts` bridges an `Authorization: Bearer <token>` header into the
`connect.sid` cookie value before express-session runs, so a raw
express-session cookie value works as a bearer token for curl testing.

To construct one: insert a row into the `session` table with
`sid` = random hex, `sess` = JSON `{ cookie: {...}, userId: "<uuid>" }`, then
sign the sid with `cookie-signature`'s `sign(sid, SESSION_SECRET)` and prefix
with `s:`.

**Why:** this app's auth checks read `req.session.userId` directly — it is
NOT Passport-based despite superficially looking like it (no
`req.session.passport.user`). Building the session row with a
`passport: { user }` shape (the generic Passport pattern) silently produces
"Non autenticato" with no other clue.

**How to apply:** always use the flat `{ cookie, userId }` shape for this
app's `session` table rows when hand-building a test session, never
`passport.user`. Also remember: chat-message endpoints validate
`platform` against a fixed enum (`android`/`ios`/`web`/`admin`) — `mobile` is
not a valid value.

**Confirmed working (Task #67 DR/GPS E2E):** this is the reliable way to drive
the REAL HTTP pipeline as any chosen user (incl. an `is_fake` rider AND a
throwaway `role='admin'` user for admin GETs) from a tsx script — no login/
password needed. Insert the `session` row, mint `"s:" + cookieSignature.sign(sid,
SESSION_SECRET)` as the Bearer. Cleanup must `DELETE FROM session WHERE
sess->>'userId' IN (...)` (session has NO FK to users, so it isn't cascade-
deleted). Pattern lives in `server/scripts/verify-dr-correction-e2e.ts`.
