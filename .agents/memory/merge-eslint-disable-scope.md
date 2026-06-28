---
name: Merge part files — eslint-disable scope
description: Quando fondi file split, la direttiva eslint-disable file-level del part va riprodotta come blocco, non come disable-next-line.
---

Quando si fonde (`@no-split`) un file `_x.partN.tsx` nel main, se il part aveva un `/* eslint-disable <regola> */` a livello di file (prima riga), quella direttiva proteggeva TUTTO il contenuto del part (tipicamente annotazioni `any` su props di componenti).

**Regola:** nel file fuso, riprodurre la copertura con un blocco `/* eslint-disable <regola> */ ... /* eslint-enable <regola> */` che racchiude l'intero componente/blocco inlinato. NON usare `eslint-disable-next-line`: copre solo la riga della firma `function Foo({` e lascia scoperte le annotazioni di tipo nelle righe successive → il gate `npm run lint -- --max-warnings=0` fallisce con "Unexpected any" + "Unused eslint-disable directive".

**Why:** il gate lint del repo è a `--max-warnings=0`; un disable mal-scopato dopo un merge introduce warning che bloccano la chiusura del task anche se tsc passa.

**How to apply:** dopo ogni merge di part, esegui `npx eslint <file fusi> --max-warnings=0` PRIMA di chiudere; non fidarti del solo tsc. Alternativa più pulita (se i tipi sono noti) = tipizzare le props ed eliminare sia gli `any` sia la direttiva.
