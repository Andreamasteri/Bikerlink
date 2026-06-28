---
name: Split-file merge via bash assembly
description: How to reliably merge lazy-split satellite files back into a main file (pure refactor) and the >600-line marker policy.
---

# Merge dei file split lazy-load (refactor puro)

Per fondere file satellite (`.part2`/`.parts`/`.map`/`.voice`/`.part1`/`.next`) nel
file principale senza cambi di logica, **assembla via bash** (`sed -n 'A,Bp'` + `cat`
in un `{ ... } > tmp; mv tmp file`), NON ritrascrivere a mano: preserva il contenuto
esatto (template string con escaping complesso, array dati lunghi) e azzera il rischio
di refusi.

**Why:** i subagent si sono rivelati inaffidabili su questo tipo di task (lasciano
lavoro parziale: file fuso ma part non eliminato, oppure file non toccato). La fonte
di verità è sempre il filesystem (rg dei riferimenti + `wc -l` + `head -1` per il
marker), non i messaggi dei subagent.

**How to apply:**
- ≤600 righe risultanti → prima riga `// @no-split` (convenzione).
- >600 righe → prima riga `// LARGE-FILE-ALLOW: <path> — <motivo>` **E** voce in
  `.large-files-allow.txt` (auto-discovery proibita: marker senza voce fa fallire
  `scripts/check-large-files-ratchet.sh`).
- Array dati (es. `lib/countries/*`): estrai il body con
  `sed -n '/const partN.*= \[/,/^];/p' f | sed '1d;$d'` e concatena in un unico
  array literal con lo stesso nome esportato.
- Costante stringa importata (es. leaflet bridge PART1): rinomina l'`export const X`
  del part in `const LOCAL` e tieni invariata l'espressione finale che concatena.
- Orfani (zero importatori, anche via `require()`) → ELIMINA, non inlinare.
- Se il main contiene duplicati morti underscore-prefissati (residuo dello split,
  es. `_PRIVACY_SETTINGS`) che confliggono col simbolo reale del part → rimuovili
  (sono dead code, lo split li aveva introdotti per zittire il lint unused).
- Verifica finale: `tsc -p tsconfig.client.json && tsc -p server/tsconfig.json`,
  `npm run lint -- --max-warnings=0`, gate ratchet, `rg` zero riferimenti residui.
  Attenzione: i commenti che citano `.parts`/`.part2` nel testo fanno scattare il
  grep di controllo → riformulali.
