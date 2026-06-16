---
name: Port mapping probe vs Express
description: .replit ports config — configurazione BLOCCATA; non modificare senza autorizzazione esplicita utente.
---

## ⛔ REGOLA FISSA — autorizzazione esplicita obbligatoria

Le sezioni `[[ports]]` di `.replit` sono **BLOCCATE**. Nessun task, fix o refactoring può modificarle senza esplicita autorizzazione dell'utente. Neanche se sembra necessario per risolvere un bug.

## Configurazione corretta e immutabile

```toml
[[ports]]
localPort = 5000
externalPort = 80        # Express — serve tutto il traffico pubblico biker-link.replit.app

[[ports]]
localPort = 8081
externalPort = 8081      # probe interno (deploy health check stack=EXPO) — NON deve essere 80

[[ports]]
localPort = 8082
externalPort = 6000
```

**Why:** In passato localPort=8081 aveva externalPort=80 → tutto il traffico pubblico andava al probe server che risponde `text/plain: ok` a qualsiasi richiesta → APK riceveva `Content-Type: text/plain` su ogni API call → `"Risposta del server non valida. Riprova."` per login e tutte le API. Il bug era invisibile all'Error Monitor (pinga localhost:5000 direttamente, non l'URL pubblica).

**How to apply:** Se si sospetta un problema di routing porte, verificare PRIMA di toccare qualsiasi cosa:
```bash
curl -s -w "\n%{content_type}" https://biker-link.replit.app/api/health
```
Deve restituire `application/json`. Se ritorna `text/plain` → chiedere autorizzazione all'utente prima di procedere.

Se autorizzati a correggere: usare `verifyAndReplaceDotReplit({ tempFilePath })`, mai editare `.replit` direttamente.
