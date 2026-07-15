---
name: Storage inheritance chain ↔ embeddings circular dependency
description: Why importing a single storage class (e.g. MapStorage) in isolation can crash with "Class extends undefined", and where the real back-edge is.
---

# Storage ↔ embeddings circular dependency

The `server/storage/*` classes form ONE linear inheritance chain split across files
(UsersStorage → AuthStorage → … → PlannedRoutesStorage → MapStorage → ContestStorage →
MatchingStorage → BikerMatchesStorage → … → DatabaseStorage), each file importing its parent.

## The cycle
Base-chain files `users.ts` and `tags.ts` import `../embeddings/music-text`
(`enqueueMusicTasteEmbedding`). `music-text` → `embeddings/store.ts`, which used to
eagerly `import { storage } from "../storage"` (the aggregate singleton = the WHOLE
DatabaseStorage chain, top of the graph). So the BASE of the chain reached back to the
TOP. Importing any high-in-chain class alone (e.g. `import { MapStorage } from "../storage/map"`)
triggers: map → parents load users/tags → embeddings → store → storage/index → the full
chain → `contest.ts` `extends MapStorage` runs while map.ts is still evaluating →
**"Class extends value undefined is not a constructor or null"**. In production it only
"works" by luck of import order (index.ts loads map before contest).

## Fix / rule
The genuine root cause is the **leaf-imports-aggregate-singleton** edge:
`embeddings/store.ts → storage/index.ts`. It used `storage` only inside two async
helpers (`getEfSearch`, `getDailyCap`), so it's lazy-imported there
(`const { storage } = await import("../storage")`), deferring the edge past module eval.

**Why:** a low-level persistence helper must not eagerly import the top-level `storage`
singleton; storage→embeddings is the natural forward edge, embeddings→storage(aggregate)
is the inversion that closes the loop.

**How to apply:** any `server/embeddings/*` (or other low-level module) that needs the
aggregate `storage` singleton should `await import("../storage")` inside the async call
site, never at module top. If `MapStorage`/any storage class must be unit-tested in
isolation again and crashes with "extends undefined", look for a NEW eager
leaf→`../storage` (index) import, not a test-mock problem.
