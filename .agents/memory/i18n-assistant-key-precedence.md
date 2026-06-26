---
name: i18n assistant key precedence trap
description: Italian aiAssistant.* strings are duplicated across two files; which wins depends on spread order in it.ts
---

In `lib/i18n/it.ts` the merge spreads `...aiAssistantIt` (from `ai-assistant-it.ts`) BEFORE `...part4` (from `it.part4.ts`). Object spread = last wins, so for any key present in BOTH files, **`it.part4.ts` wins** and the copy in `ai-assistant-it.ts` is dead.

Shared (duplicated) keys → edit `it.part4.ts` (not just `ai-assistant-it.ts`): `aiAssistant.title`, `aiAssistant.emptyHint`, `aiAssistant.inputPlaceholder`, `aiAssistant.prefs.*`, `aiAssistant.confirm.*`, `aiAssistant.tip.*`, `aiAssistant.trigger.ask`.

Keys ONLY in `ai-assistant-it.ts` (active there): `aiAssistant.tour.*`, `aiAssistant.admin.*`, `aiAssistant.subtitle`, `aiAssistant.trigger.home/map/profile`, `common.assistant*`.

English has NO duplication: only `en.part4.ts` holds `aiAssistant.*` (no `ai-assistant-en.ts`), so edits there are always active.

**Why:** renaming the assistant to "Bowie" by editing only `ai-assistant-it.ts` silently did nothing for title/prefs/emptyHint — the part4 duplicates overrode them; the architect caught it.
**How to apply:** before changing any `aiAssistant.*` Italian string, grep BOTH files; if the key exists in `it.part4.ts`, edit it there.
