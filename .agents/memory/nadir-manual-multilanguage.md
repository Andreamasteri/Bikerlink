---
name: Nadir manual multi-language design
description: How Horus's manual is translated and indexed per app language for Bowie's RAG retrieval.
---

Horus's on-demand manual is generated in Italian (source of truth, `NADIR_MANUAL_KEY`), then
translated block-by-block (split on `## ` section headers) into every app language from
`shared/languages.ts` (`APP_LANGUAGES`), stored under `NADIR_MANUAL_TRANSLATIONS_KEY` keyed by
language with a `sourceHash` of the Italian text it was translated from.

Nadir's reindexer embeds ALL available language versions of the manual, not just Italian —
entity IDs are prefixed per language (`${lang}-chunk-${i}`) in the same `NADIR_MANUAL_ENTITY_TYPE`
so they don't collide, and each manifest entry carries a `lang` field.

`searchNadir` takes an optional `language` opt: it over-fetches manual candidates (multiplied by
the number of app languages) then filters manual-origin fragments to the requester's language,
falling back to whatever's indexed (in practice Italian, always present) if that language has no
matches yet. Conversation/comment fragments are untouched by this filter (not per-language content).

**Why:** without over-fetching, top-K similarity search across all languages mixed together would
under-represent non-Italian chunks even when a same-language match exists, and a hard requirement
for a language match would silently return zero manual context for a language whose translation
hasn't been generated yet (e.g. right after adding a new language, or if a translation call failed).

**How to apply:** any new Nadir-indexed content that should also be multi-language-aware must follow
the same pattern (tag with `lang` in the manifest, namespace entity IDs per language, filter+fallback
in search) — don't assume a single global-language index is enough once per-language content exists.
Admins hand-editing the Italian manual via `server/routes/admin/nadir.ts` do NOT currently
regenerate translations (translations only update to when Horus does a full manual scan) — this is
a known gap (see follow-up "Keep manual translations in sync when admins hand-edit the manual").
