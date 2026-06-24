---
name: part2/next continuation-file orphans
description: How to triage "orphaned" .partN/.next continuation files before linking them
---

# part2/next continuation-file orphans

When asked to "link orphaned continuation files so truncated screens show full content", do NOT assume an unimported `.partN`/`.next` file is lost functionality. In this codebase most are one of:

- **Intentional empty stubs** — `export {}` or 2-3 lines; overflow placeholders for the 600-line ratchet gate. ~170 of ~175 continuation files are these. No action.
- **Stale duplicates** — real code already superseded by the current live implementation. Linking them creates duplicate UI / conflicting exports.

**Why:** Task #4855 flagged 3 "real-content orphans"; all 3 were non-issues: `server/routes/client-settings.part2.ts` was already linked via `require()` (not `from`/`import()`); `app/admin/_stregatti.part3.tsx` (`StregattaActions`) duplicated the "Controllo Globale" panel already rendered inline by `_stregatti.part4.tsx`'s `StregattaList`; `server/site/pages-home.part2.ts` (`buildHomeBody`) duplicated the inline body in `pages-home.ts` (older "community italiana" vs live "community mondiale"). Correct fix was deletion, not linking.

**How to apply:**
1. Naming: Expo route files are `<name>.tsx`; continuation files use underscore prefix `_<name>.partN.tsx` so Expo Router ignores them. The parent of `_stregatti.part2.tsx` is `stregatti.tsx`, NOT `_stregatti.tsx`.
2. Audit import detection MUST cover `from "..."`, `import("...")`, AND `require("...")`, plus `export * from`. A `from`-only regex yields false orphans.
3. For each real-content orphan, grep the exported symbol globally AND check whether the parent already renders/builds the same thing inline before linking. If superseded → delete (it's dead duplicate), don't force-link.
