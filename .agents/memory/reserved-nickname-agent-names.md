---
name: Reserved-name blocking family (admin/mod exact vs AI-agent contains)
description: Two different blacklist shapes coexist for nickname/email reservation — exact-match reserved words vs contains-match AI agent names — and every user-creation path must funnel through the shared helper.
---

## The rule

`shared/validators/auth.ts` exports two conceptually different reserved-word checks, deliberately NOT unified into one array:

- `RESERVED_EXACT_NICKNAMES` (admin/administrator/mod/moderator/...) — matched with `===` after lowercasing. This is the historical behavior; switching it to "contains" would break legitimate nicknames that merely include one of these as a substring (e.g. a name containing "mod").
- `RESERVED_AI_AGENT_NAMES` (ares, nadir, bowie, quebracho, horus) — matched with `.includes()` after lowercasing, on BOTH the nickname and the local part of the email (before `@`). These are the internal AI agent names, recognizable in chat/logs/admin panels, so any occurrence anywhere in the string is a spoofing/social-engineering risk, not just an exact match.

`isReservedNickname()` and `isReservedEmailLocalPart()` wrap both checks so call sites don't need to know the distinction.

**Why:** exact-match is the right tool for reserved role words (predictable, low false-positive risk on substrings), contains-match is the right tool for recognizable proper nouns that could be embedded as a prefix/suffix to impersonate an agent.

**How to apply:** any new path that creates or renames a user-facing identity (signup, admin user creation, profile nickname change, future invite/import flows) must call these shared helpers rather than re-inventing a local array. As of the introduction of this pattern, public signup (`server/routes/auth/register.ts`) and admin user creation (`server/routes/admin/users.next.ts`) both call it; `server/routes/users/profile.ts` still has its own duplicated exact-match-only array for nickname *changes* and was intentionally left out of scope (existing users renaming, not new-account creation) — revisit if that becomes a live bypass concern.
