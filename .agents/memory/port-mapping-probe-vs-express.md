---
name: Port mapping probe vs Express
description: .replit ports config — externalPort=80 deve puntare a localPort=5000 (Express), NON a 8081 (probe).
---

## Regola

`[[ports]]` in `.replit`:
- `localPort = 5000 → externalPort = 80` — Express, serve il traffico pubblico `biker-link.replit.app`
- `localPort = 8081 → externalPort = 8081` — probe interno (deploy health check stack=EXPO), NON deve essere externalPort=80

**Why:** Se `localPort = 8081` ha `externalPort = 80`, tutto il traffico pubblico va al probe server che risponde `text/plain: ok` a qualsiasi richiesta → l'APK riceve `Content-Type: text/plain` su ogni API call → `"Risposta del server non valida. Riprova."` ovunque.

Il bug è insidioso perché `Error Monitor` locale pinga `localhost:5000` direttamente → segnala sempre OK, non riflette il comportamento sull'URL pubblica.

**How to apply:** Prima di ogni deploy, verificare con `curl -w "%{content_type}" https://biker-link.replit.app/api/health` — deve restituire `application/json`, non `text/plain`. Se ritorna `text/plain`, le porte sono invertite.

Per correggere: `verifyAndReplaceDotReplit({ tempFilePath })` con il nuovo contenuto (non editare .replit direttamente).
