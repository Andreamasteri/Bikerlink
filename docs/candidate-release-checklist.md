# BikerLink — Candidate release checklist

Questa checklist prepara il passaggio da Replit a Railway/R2 senza modificare
database o cancellare la sorgente Replit.

## Offline / repository

- [ ] Eseguire `bash scripts/pre-build-candidate-check.sh`
- [ ] Eseguire `npm ci` da registry pubblico
- [ ] Eseguire Expo Doctor, test, lint e build backend
- [ ] Verificare che il lockfile non contenga proxy Replit
- [ ] Usare un commit candidato nuovo e immutabile
- [ ] Impostare `EXPO_PUBLIC_DOMAIN` all'host HTTPS Candidate
- [ ] Generare solo il profilo EAS `preview`

## Neon

- [ ] Audit schema read-only su Dev
- [ ] Applicare le migration pending su Dev
- [ ] Verificare boot e smoke Dev
- [ ] Promuovere lo stesso set a Candidate
- [ ] Testare Candidate e ottenere approvazione
- [ ] Promuovere a Production senza copiare dati personali

Il runner di boot può applicare migration: nessun avvio Production va usato
come prova cieca.

## R2

- [ ] Eseguire `scripts/r2-migration-preflight.ts`
- [ ] Inventario dry-run della sorgente
- [ ] Copia resumable con stato persistente
- [ ] Verifica conteggi, dimensioni e SHA-256
- [ ] Smoke autenticato upload/download
- [ ] Osservazione con sorgente Replit conservata
- [ ] Solo dopo la verifica, rimuovere eventuali dipendenze runtime Replit

## Smoke candidato

- [ ] health e boot
- [ ] login/session renewal
- [ ] chat/SSE
- [ ] mappe e routing
- [ ] media upload/download
- [ ] telemetria
- [ ] OTA e riapertura offline
- [ ] rollback

Production resta protetta finché Candidate non è approvato.
