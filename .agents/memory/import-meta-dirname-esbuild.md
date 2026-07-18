---
name: import.meta.dirname esbuild CJS crash
description: import.meta.dirname is ESM-only (Node 22+) and esbuild transforms it to undefined in CJS bundles, crashing path.resolve() at boot.
---

# `import.meta.dirname` → Crash in esbuild CJS Bundle

## The Rule
**Never use `import.meta.dirname` or `import.meta.url` in server code** that is bundled by esbuild as CJS. Use `__dirname` instead (always defined in esbuild CJS output).

**Why:** `import.meta.dirname` is an ESM-only feature introduced in Node 22+. When esbuild compiles server TypeScript to CJS format, it replaces the entire `import.meta` object with `{}`. Accessing `.dirname` on `{}` returns `undefined`. If that value is passed to `path.resolve(undefined, "../../..")`, Node throws immediately at module load:

```
TypeError [ERR_INVALID_ARG_TYPE]: The "paths[0]" argument must be of type string. Received undefined
```

This causes a crash-loop at boot — the server never starts.

**How to apply:**
- When writing any `path.resolve(...)` call in server code, always use `__dirname` (CommonJS), not `import.meta.dirname`.
- If you see `import_meta.dirname` or `import.meta.dirname` in server files, replace with `__dirname`.
- After fixing, rebuild with `npm run server:build` and verify the new bundle contains `__dirname` at the relevant line.

## Files that had this bug (fixed)
- `server/routes/admin/horus-scan.ts` — used `path.resolve(import.meta.dirname, "../../..")`
- `server/jobs/horus-patch-scan-job.ts` — same pattern

Both fixed to `path.resolve(__dirname, "../../..")`.

## Detection
Grep for `import.meta.dirname` in `server/` to catch future occurrences before build.
