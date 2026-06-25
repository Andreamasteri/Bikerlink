---
name: Context.Provider value memoization
description: perché ogni Context.Provider deve passare un value memoizzato e il gate CI che lo impone
---

# Context.Provider value memoization

Ogni `<XxxContext.Provider value={{ ... }}>` con oggetto literal inline crea una
nuova referenza a OGNI render del provider → tutti i consumer (`useContext`)
ri-renderano anche senza cambio di valore.

**Why:** nell'albero di provider montato al boot/OTA questi re-render a cascata
amplificano il loop `setOptions` di React Navigation ("Maximum update depth
exceeded") che ricompare a ogni OTA. È una delle cause-radice della famiglia di
crash rnav (vedi `rnav-screenoptions-nested.md`, `rnav-memo-guard.md`).

**How to apply:**
- `const contextValue = useMemo(() => ({ ... }), [deps]); return <Ctx.Provider value={contextValue}>`.
- Le funzioni nei deps devono essere stabili (`useCallback`) o il memo si vanifica.
- React Query: dipendere da `mutate` (destrutturato, referenzialmente stabile),
  NON dall'intero oggetto `useMutation()` che cambia referenza ogni render.
- Gate CI: `scripts/check-rnav-inline-props.sh` blocca `Context\.Provider\s+value=\{\s*\{`
  (single + multiline). Tutti i provider in `lib/` sono già memoizzati e green.
