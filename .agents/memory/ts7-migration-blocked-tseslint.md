---
name: TS 7 migration blocked by typescript-eslint
description: Why the TypeScript 6→7 (native port) migration is on hold — the linter, not the compiler, is the blocker — and the intended unblock path.
---

# TS 7 migration is blocked by @typescript-eslint, not by TypeScript itself

TypeScript 7 is the **native Go port** ("tsgo"), not a normal minor. On this
project everything downstream of the compiler works on TS 7:

- `tsc --noEmit` passes for server, client, and root configs.
- esbuild server build and tsx/vitest runtime are **independent of the
  `typescript` package** — they never break on a TS bump.

The **only** blocker is the linter:

- No published `@typescript-eslint` release supports TS 7. Every channel
  (`latest`, `canary`, all `rc-*`) declares `typescript: ">=4.8.4 <6.1.0"`.
- `@typescript-eslint` 8.64.0 **hard-crashes at load** on TS 7:
  `Cannot read properties of undefined (reading 'Cjs')` in
  `typescript-estree/create-program/shared.js`. The TS 7 native-port internal
  API changed. This is a require-time crash, so it happens even with **no
  type-aware rules** (our `eslint.config.js` sets no `project`) — the parser
  import alone crashes the whole `lint` gate.

## TS 7 config changes required (already worked out, currently reverted)

TS 7 **removes** two options that this repo used:
- `moduleResolution: "node"` (node10) → for the server (CommonJS) use
  `module: "preserve"` + `moduleResolution: "bundler"` (typecheck-only config,
  so it doesn't affect the esbuild CJS output).
- `baseUrl` → drop it; `paths` then resolve relative to the tsconfig's own
  directory, so `server/tsconfig.json` needs `@shared/*: ["../shared/*"]`, while
  root/client `@/*: ["./*"]` and `@shared/*: ["./shared/*"]` stay as-is.

## Decision (user, 2026-07-14): HOLD

Value of TS 7 today is marginal (typecheck already passes on 6.0.3). Cost of
proceeding = breaking the blocking `lint` CI gate — including
`react-hooks/exhaustive-deps`, the main net against this project's recurring
"Maximum update depth" boot loops — for an indefinite window.

**Unblock path:** swap the linter to **oxlint** first (as its own task, on TS 6).
oxlint 1.74.0's rule set already includes `rules-of-hooks`, `exhaustive-deps`,
and `no-unused-vars`, and it does not depend on the `typescript` package.
Caveats: the custom `local-rules/no-part-nav` rule can't run on oxlint (no mature
custom-JS-plugin support — the static `.partN` grep gate in `post-merge.sh`
still covers most of it), and oxlint's `exhaustive-deps` is a reimplementation
that should get a comparison run. Once lint is off `@typescript-eslint`, TS 7
lands trivially.

**Gotcha during revert:** the Replit auto-checkpoint can commit your in-progress
migration to HEAD mid-task, so `git checkout -- <files>` will *restore the TS 7
state* instead of the pre-migration one. Re-apply reverts as working-tree edits;
don't `git checkout` them away.
