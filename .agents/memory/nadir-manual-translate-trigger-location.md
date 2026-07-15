---
name: Manual translation trigger lives with Horus, not Nadir
description: Where to find and reuse the LLM translation call for the Nadir manual, to avoid duplicating the prompt when adding single-language retranslation flows.
---

The function `translateManualToLanguage(manual, lang)` that drives block-by-block LLM translation of the manual lives in `server/ai/assistant/horus-scanner-finalize.ts`, **not** in `server/ai/nadir/manual.ts`.

`server/ai/nadir/manual.ts` only handles storage/retrieval: `getNadirManualTranslations`, `saveNadirManualTranslations`, `saveNadirManualTranslation` (single-language merge-write added in Task #113), `hashManualText`, and `getNadirManualForLanguage`.

**Why:** Translation requires the Horus Ollama endpoint, model ID (`HORUS_OLLAMA_MODEL`), and the `HORUS_THINK_TAG_CONTRACT` system prompt — all infrastructure that lives alongside other Horus finalization logic. Moving the call to nadir/ would drag in Ollama and Horus-specific deps where Nadir shouldn't care how text was produced.

**How to apply:** When adding admin-initiated retranslation (e.g. Task #113's POST `/manual/translations/:lang/retranslate`), import `translateManualToLanguage` from `horus-scanner-finalize.ts` directly. After translating, call `saveNadirManualTranslation(lang, { text, translatedAt, sourceHash })` from `nadir/manual.ts` — this merges only the targeted language into the existing map without overwriting the others.
