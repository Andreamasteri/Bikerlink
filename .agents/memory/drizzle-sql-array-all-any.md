---
name: drizzle sql template array expansion (IN vs ALL/ANY)
description: Why interpolating a JS array into a drizzle `sql` template breaks ALL/ANY (but works for IN), and what to use instead.
---

# drizzle `sql` template expands JS arrays into comma param lists

Interpolating a JS array into a drizzle `sql` template expands it into a
comma-separated list of bind params (`${arr}` → `$1, $2, $3`). That is what
`IN (...)` wants, so `col IN (${arr})` works — but `ALL(...)`/`ANY(...)` need a
real Postgres array, so `col <> ALL(${arr})` compiles to `col <> ALL(($1,$2,$3))`
and fails at **runtime**, not typecheck.

**Why:** the failure is silent to the type system and easy to misread as DB
slowness — the surrounding operation just throws mid-run.

**How to apply:** for "not in this set" use the query builder `notInArray(col, arr)`
/ `inArray(col, arr)` from `drizzle-orm`, not hand-written `ALL`/`ANY`. If raw
`sql` is unavoidable, pass a genuine array param, not a JS array via template
interpolation.
