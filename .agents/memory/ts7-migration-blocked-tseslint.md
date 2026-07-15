---
name: TS 7 migration path (linter, not compiler, is the blocker)
description: TypeScript 7 (native Go port) is compiler-clean here; the real blocker/unblock path is the linter's dependency on the `typescript` package.
---

# TS 7 upgrades are blocked by the linter, not the compiler

TypeScript 7 is the **native Go port** ("tsgo"), not a normal minor. `tsc
--noEmit`, esbuild, and tsx/vitest runtime are all independent of which
`typescript` package version is installed — they don't break on a TS bump.

The actual blocker is any linter whose parser hard-depends on internals of
the `typescript` package with a narrow supported-version range (e.g.
`@typescript-eslint`, which crashes at *require* time on TS 7's changed
native-port internals — a crash that happens even with zero type-aware
rules configured, since the parser import alone fails). **Unblock path:**
move the lint gate to a linter that doesn't import `typescript` at all
(e.g. oxlint) *before* bumping the compiler, so the compiler bump becomes a
config-only change once the gate is already off that dependency.

## TS 7 config changes required
TS 7 **removes** two options:
- `moduleResolution: "node"` (node10) → for CommonJS output use
  `module: "preserve"` + `moduleResolution: "bundler"` (typecheck-only
  config change, doesn't affect actual CJS bundler output).
- `baseUrl` → drop it; `paths` then resolve relative to the tsconfig's own
  directory, so a tsconfig nested in a subdirectory needs its `paths`
  entries rewritten relative to itself (e.g. `../shared/*` instead of
  `./shared/*` if the tsconfig lives one level down from the alias target).

## Gotcha
The platform's auto-checkpoint can commit an in-progress migration to HEAD
mid-task, so `git checkout -- <files>` restores the *migration* state, not
the pre-migration one. Re-apply an intended revert as a fresh working-tree
edit instead of relying on `git checkout`.

See `oxlint-disable-comment-placement.md` for a related quirk hit while
porting `react-hooks/exhaustive-deps` suppressions to oxlint.
