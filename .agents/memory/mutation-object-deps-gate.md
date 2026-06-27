---
name: Whole-mutation-object in hook deps gate
description: CI gate that blocks the React Query whole-*Mutation-object-in-deps perf trap; ratchet baseline
---

# Gate: oggetto-mutation intero nei deps di useCallback/useMemo

`scripts/check-mutation-object-deps.sh` blocca l'uso di una variabile
`*Mutation` INTERA (oggetto React Query) come dipendenza di useCallback/useMemo
— il pattern che fa ridisegnare le liste FlatList ad ogni azione utente.
Agganciato come gate bloccante in `scripts/post-merge.sh`.

**Consentito (non segnalato):** `*Mutation.mutate`, `*Mutation.isPending`,
qualsiasi `*Mutation.<membro>`, e `*MutationRef`. Soppressione puntuale:
`// check-mutation-object-deps: safe` sulla riga del deps array o su quella
precedente.

**Ratchet baseline:** `.mutation-object-deps-baseline` (tracked in git) congela
le occorrenze legacy esistenti (handler di pulsanti one-off fuori da renderItem
FlatList). Il gate fallisce solo sulle occorrenze NUOVE.
Aggiornamento solo umano:
`BIKERLINK_HUMAN_BASELINE_UPDATE=1 bash scripts/check-mutation-object-deps.sh --update-baseline`.

**Why:** il pattern (whole mutation object nei deps) rientra facilmente con ogni
nuovo screen FlatList; è perf, non "Maximum update depth exceeded". La regola di
fondo è in `react-query-mutation-ref-deps.md`.

**How to apply:** parser Python che individua l'ULTIMO array `[...]` a livello-top
dell'argomento di useCallback/useMemo (gestisce single-line e multi-line, salta
stringhe/commenti) e cerca un token `*Mutation` nudo (lookbehind/lookahead per
escludere `.membro`, `Ref`, `Mutations`).
