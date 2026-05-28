# i18n Auto-Translation CLI

AI-powered tool that keeps BikerLink's translation files in sync with the
Italian source of truth (`lib/i18n/it.ts`).

## TL;DR

```bash
# Preview what would change (no API calls, no writes):
npm run i18n:translate:dry-run

# Translate everything that's missing or changed across all target languages:
npm run i18n:translate

# Only one (or a few) languages — pass --lang after `--` so npm forwards it:
npm run i18n:translate:lang -- --lang=en
npm run i18n:translate:lang -- --lang=en,es,fr

# Or call the script directly via tsx:
npx tsx scripts/translate-i18n.ts --lang=en
npx tsx scripts/translate-i18n.ts --lang en,es,fr --dry-run
```

Required environment variable: `OPENAI_API_KEY`. The script aborts loudly if
it is not set — except in `--dry-run`, which works offline (no API calls,
no writes).

## How it works

1. **Source of truth.** `lib/i18n/it.ts` is parsed line by line. Every
   `"key": "value",` pair is extracted, blank-line section separators are
   remembered, and the file structure (key order + blanks) is preserved in
   the output.
2. **Per-key hash snapshots.** After every successful run the script writes
   `lib/i18n/.translations-state.json` containing
   `{ lang: { key: sha256_of_italian_value } }`. On the next run, a key is
   re-translated only when its Italian source hash differs from the stored
   one (i.e. the Italian text actually changed).
3. **First-run grace.** When a key already has a translation but no hash is
   recorded yet, the script trusts the existing translation and just seeds
   the hash. This prevents an enormous accidental re-translation on the
   first invocation.
4. **Missing keys.** Any key present in `it.ts` but missing (or empty) in a
   target file is translated.
5. **Output.** Each target file is regenerated end-to-end from the parsed
   Italian structure: same key order, same blank-line separators, same
   `Record<string, string>` shape, same `export default <lang>;` footer.

## Manual overrides

To freeze a translation so the script never touches it, add a `// @manual`
comment on the same line:

```ts
"home.garage": "Mi Garaje Personal",  // @manual
```

The script reads the marker, leaves the value untouched, and re-emits the
`// @manual` annotation on every subsequent run.

## Glossary

`scripts/i18n-glossary.json` holds moto-specific terms (e.g. `piega →
lean angle`, `tornante → hairpin`, `zavorrina → pillion`). The relevant
mappings are injected into the prompt for each language so the model uses
consistent terminology.

To extend the glossary, add an entry shaped like:

```json
"italianTerm": {
  "en": "english value",
  "es": "...", "fr": "...", "de": "...", "el": "...", "tr": "..."
}
```

## Flags

| Flag               | Meaning                                                                      |
| ------------------ | ---------------------------------------------------------------------------- |
| `--dry-run`        | Report new/changed counts and sample keys. No API calls, no writes.          |
| `--lang=<list>`    | Comma-separated subset of `en,es,fr,de,el,tr`. Defaults to all six.          |
| `-h`, `--help`     | Print usage.                                                                 |

The script always processes the full set of changes for a given language —
there is no partial mode.

## Console output

A typical run looks like:

```
[i18n] Source: /…/lib/i18n/it.ts
[i18n] Targets: en, es, fr, de, el, tr
[i18n] Mode: LIVE

[i18n] Italian source: 1225 keys
[i18n] Glossary: 16 terms

[i18n] [en] keys=1225  new=58  changed=0  manual=0  upToDate=1167
[i18n] [en] batch 1/2 (30 keys)... ok
[i18n] [en] batch 2/2 (28 keys)... ok
[i18n] [en] wrote /…/lib/i18n/en.ts (1225 keys)
…
[i18n] Summary: new=348 changed=0 manual=0 apiCalls=12
```

## Model & cost

- Model: `gpt-4o-mini` (OpenAI chat completions, JSON mode).
- Batch size: 30 keys per request.
- Temperature: 0.2 (favours consistency over creativity).
- The system prompt instructs the model to preserve placeholders
  (`{nickname}`, `{count}`, `%s`, …), newlines, trailing punctuation, and to
  keep the translation length close to the original (mobile UI).

## State file

`lib/i18n/.translations-state.json` is committed alongside the translation
files. Deleting it forces a full re-validation (existing values are kept on
first run thanks to the grace logic, but every missing key will be filled).

## Failure modes

- **`OPENAI_API_KEY` missing** → script exits with status 1 before doing
  anything.
- **OpenAI API error** → the script aborts immediately. The state file is
  only written at the end of a fully successful run, so a mid-run failure
  leaves both target files and `.translations-state.json` untouched; the
  next run will simply re-detect the same missing/changed keys.
- **Parse error in `it.ts` or a target file** → script aborts with the
  offending line number; no files are modified.
- **Missing translation for a requested key in the OpenAI response** →
  script aborts (we do not silently emit empty strings).
