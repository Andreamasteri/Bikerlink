---
name: oxlint disable-comment placement for exhaustive-deps
description: Where an `oxlint-disable-next-line` comment must sit to actually suppress react-hooks/exhaustive-deps — differs from ESLint's convention.
---

# oxlint disable-comment placement (react-hooks/exhaustive-deps)

oxlint attributes an `exhaustive-deps` warning to the hook's **dependency
array line**, not the hook call line or the internal usage site that's
missing from the deps. This differs from typical ESLint disable-comment
intuition (where you'd often place it above the hook call or the flagged
usage) and cost several failed attempts to discover empirically.

**Rule:** put `// oxlint-disable-next-line react-hooks/exhaustive-deps -- <reason>`
on the line **immediately above** the closing `}, [deps]);` — not above
`useEffect(() => {`, not above the line inside the callback that uses the
"missing" value.

Also: it must be a **single-line** comment. A multi-line comment block above
the deps array breaks "next line" targeting — only the comment line directly
adjacent to `}, [deps]);` counts.

**How to apply:** whenever intentionally omitting a dependency (e.g. to avoid
a stale-closure fix that would reintroduce a boot loop — see
`auth-context-react-query-deps.md` / `react-query-batching-tabbarlayout-loop.md`),
verify suppression worked with a full oxlint run before trusting it; a
misplaced comment silently fails to suppress and the gate stays red.
