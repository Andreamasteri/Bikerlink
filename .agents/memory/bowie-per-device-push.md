---
name: Bowie per-device push delivery
description: How Bowie Terminal notification-reply push targeting works end-to-end (server + client wiring).
---

`sendBowieReplyPush(userId, opts)` in `server/push-notifications.ts` supports an optional `opts.deviceId`. When present it delivers ONLY to that device's token (looked up in `bowie_terminal_tokens` via `getBowieDeviceToken`, which excludes revoked rows). Without `deviceId` it falls back to broadcasting to every token registered under `app_id="bowie"` in the shared `pushTokens` table (old/legacy behavior, still used when the caller doesn't know the originating device).

**Why:** a user can have Bowie Terminal installed on multiple phones; broadcasting to all of them means notification replies leak to the wrong device, and a device revoked via the admin monitor (`bowie_terminal_tokens.revoked_at`) must not keep receiving pushes — since delivery actually reads from `pushTokens`, revoking only `bowie_terminal_tokens` wasn't enough; the admin revoke endpoint (`server/routes/admin/bowie-standalone.ts`) now also deletes the matching `pushTokens` row (matched by the shared Expo push token value, since both tables store the identical token from one registration call).

**How to apply:** any new caller of `sendBowieReplyPush` should pass `deviceId` whenever it's known, to get per-device targeting instead of the broadcast fallback.

**Client wiring (closed 2026-07-01):** `bowie-terminal/app/index.tsx`'s quick-reply path (both the live-app listener and the cold-start `consumePendingReply` recovery) now calls `notificationReply()` with the device's stable id (`getOrCreateDeviceId()`), and a separate push listener (`addBowieReplyPushListener`, filters `data.type === "bowie_reply"`) fills in the AI reply line when the targeted push arrives, with a courtesy timeout if it never does. Manually typed terminal input is unaffected — it still uses the original SSE streaming path. Don't reintroduce the old "reopen app + reuse streaming endpoint" shortcut for notification replies; it bypasses per-device targeting entirely.
