---
name: eslint single-file false unused-imports
description: Why linting one TS file in isolation falsely flags used type imports as unused.
---

Running `npx eslint server/storage/index.ts` (or any single TS file) in isolation
can report `unused-imports/no-unused-imports` errors for type imports that ARE
actually used as method return types in the file (e.g. BikerZavorrinaMatch,
BikerBikerMatch, EmailVerificationToken in storage/index.ts — used 4–12x each).

It ALSO misfires `react-hooks/exhaustive-deps` warnings on hooks that the
full-project lint passes cleanly (seen splitting lib/auth-context.tsx — single
file flagged 2 useEffect/useCallback deps that the project lint did not). Same
root cause: the isolated invocation doesn't load the project flat config / type
info correctly, so don't trust single-file lint output for any rule.

**Why:** the rule needs full TypeScript project type info to see type-only usages
in interface/method signatures; a single-file invocation lacks it and misfires.

**How to apply:** to validate lint after editing such a file, run the project's
`lint` workflow (`npm run lint -- --max-warnings=0`) which lints the whole
project and resolves the usages correctly. Don't "fix" these by deleting the
imports — that breaks the build.
