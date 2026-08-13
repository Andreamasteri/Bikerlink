# Audit variabili d'ambiente e secret — BikerLink

> Aggiornato: 1 luglio 2026 (Task #5260). Riferimento operativo su **quali valori
> di configurazione stanno come variabile d'ambiente (`env`)** e **quali come secret**,
> con la motivazione di ciascuna scelta. Le funzioni di gestione (view/set/delete/request)
> sono descritte in `.local/skills/environment-secrets/SKILL.md`.

## Regola generale

- **Secret** = valore riservato o comunque di configurazione infrastrutturale che
  NON deve variare tra ambienti (dev/prod condividono lo stesso valore) e che non
  serve essere inline nel bundle client. In BikerLink la stragrande maggioranza
  delle URL dei servizi self-hosted e dei token va in **secret**.
- **Variabile d'ambiente (`env`)** = valore che **deve** essere leggibile a
  build-time dal client Expo (prefisso `EXPO_PUBLIC_*`, viene inlinato nel bundle),
  oppure valore che deve differire per ambiente (`development` vs `production`).

## Duplicati risolti

| Variabile | Situazione precedente | Azione |
|---|---|---|
| `BIKERLINK_ADMIN_EMAIL` | esisteva sia come **env shared** sia come **secret** (in shell vinceva l'env); **non letta da nessun punto del codice** | Rimossa la copia **env shared**. Confermato con ricerca globale che il **secret** omonimo è a sua volta inutilizzato: da rimuovere manualmente dal pannello Secrets (l'agente non può cancellare secret via tool). |
| `BIKERLINK_BACKEND_URL` | solo **env shared**, **non letta da nessun punto del codice** | Rimossa (variabile morta). |

## Classificazione delle variabili shared rimanenti

### Restano come variabile d'ambiente (`env`)

| Variabile | Motivazione |
|---|---|
| `EXPO_PUBLIC_DOMAIN` | **Client-inlined.** Letta dal codice client Expo (`app/giri/[id].tsx`, `lib/query-client.ts`, `lib/background-location-task.ts`, `lib/foreground-location-service.ts`); i valori `EXPO_PUBLIC_*` vengono inlinati nel bundle a build-time e NON possono essere secret. **Deve restare env.** |

> `EXPO_WEB_URL` e `NODE_ENV` esistono solo con scope `development`/`production`
> (non `shared`): sono legati all'ambiente e restano `env` per definizione — fuori
> dallo scope di questo task.

### Da migrare a secret (server-side, stesso valore in dev e prod)

Tutte lette **solo lato server** (o via lib condivisa importata dal server), nessuna
inlinata nel client:

| Variabile | Letta da (esempi) | Motivazione |
|---|---|---|
| `GRAPHHOPPER_URL` | `server/graphhopper-client.ts`, `server/jobs/thinkcentre-monitor-probes.ts` | URL servizio self-hosted (Cloudflare Tunnel), solo server |
| `VALHALLA_URL` | `server/routing/valhalla-client.ts`, `server/routing/valhalla-startup.ts` | URL servizio self-hosted, solo server |
| `NOMINATIM_URL` | `server/lib/nominatim-client.ts`, `server/routes/routing-areas.ts` | URL servizio self-hosted, solo server |
| `TILES_URL` | `lib/map-tiles.ts` (importata solo da route admin server) | URL tile self-hosted; sul client resta `undefined` (non `EXPO_PUBLIC_`) |
| `REDIS_PROBE_URL` | `server/routes/admin/thinkcentre-health-infra-probes.ts` | Endpoint di probe per il **DragonflyDB** (Redis-compatible) self-hosted sul ThinkCentre — Redis è stato sostituito da DragonflyDB; l'endpoint resta `/probe/redis` solo per compatibilità. Solo server |
| `TC_SSH_PORT` | `server/routes/ssh-exec.ts` | Parametro connessione SSH ThinkCentre, solo server |
| `DIAG_OLLAMA_URL` | provider **Ares** — `server/lib/ares-client.ts`, `server/routes/admin/thinkcentre-health-ares-probe.ts`, `scripts/ollama-diagnose.ts` | URL dell'istanza Ollama dedicata ad **Ares** (l'AI di diagnostica tecnica su PC fisso separato); solo server |
| `DIAG_OLLAMA_MODEL` | provider **Ares** — `server/lib/ares-client.ts` | Modello usato da **Ares**; coerente con la famiglia `DIAG_OLLAMA_*` (secret) |

> Nota naming: la famiglia `DIAG_OLLAMA_*` è il canale della persona **Ares** (diagnostica).
> Per decisione consolidata i **secret non vengono rinominati** in `ARES_*` — cambiano
> solo doc/log/Modelfile. `OLLAMA_*` / `OLLAMA_ROUTING_MODEL` / `DIAG_OLLAMA_TOKEN` /
> `ARES_METRICS_URL` risultano **non impostate** e rientrano nel dominio del task di
> refactoring persona (Bowie/Horus/Ares): **non toccate qui**.

## Pannelli admin ThinkCentre — URL infra/metriche (secret su `tc.biker-link.net`)

Questi valori alimentano i pannelli admin **Metriche** e **Infra** del ThinkCentre.
Vanno tenuti come **secret** e puntati all'host Cloudflare Tunnel `tc.biker-link.net`
(il vecchio host DuckDNS `*.bikerlink.duckdns.org` è **dismesso**). Il codice appende

| Secret | Valore corretto | Letto da |
|---|---|---|
| `NGINX_MONITOR_URL` | `https://tc.biker-link.net/probe/nginx` | `server/routes/admin/thinkcentre-health-infra-probes.ts` |
| `UPTIME_KUMA_URL` | `https://tc.biker-link.net/probe/uptime-kuma` | idem |
| `REDIS_PROBE_URL` | `https://tc.biker-link.net/probe/redis` | idem (ha precedenza sul TCP `REDIS_PROBE_HOST`) |

> **Propagazione secret aggiornati:** un secret **nuovo** entra nel container in
> tempo reale, ma un secret **esistente** riaggiornato mantiene il vecchio valore
> nell'env del container già avviato — si aggiorna solo a **cold boot** (deploy /
> merge / riavvio del Repl), NON con un semplice restart dei workflow. Se il probe
> non è raggiungibile il pannello mostra correttamente lo stato `offline`/`non
> configurato` senza crash.

## Procedura di migrazione env → secret

1. `requestEnvVar({ requestType: "secret", keys: [...9...] })` — l'utente reinserisce
   i valori (identici agli attuali) nel pannello Secrets.
2. A valori inseriti, `deleteEnvVars({ keys: [...9...], environment: "shared" })`
   per rimuovere le copie `env` (durante la finestra in cui coesistono, in shell
   vince l'`env`, ma i valori sono identici → nessuna differenza funzionale).
3. Riavvio backend + verifica runtime che `process.env.<KEY>` risolva al secret.
