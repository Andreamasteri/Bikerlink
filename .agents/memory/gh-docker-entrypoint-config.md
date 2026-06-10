---
name: GraphHopper Docker entrypoint config fix
description: israelhikingmap/graphhopper entrypoint hardcodes config-example.yml (relative path) — override obbligatorio nel compose.
---

## Regola

L'immagine `israelhikingmap/graphhopper` ha entrypoint:
```
["./graphhopper.sh", "-c", "config-example.yml"]
```

`config-example.yml` è un path **relativo**: Java lo risolve dalla WORKDIR del container (`/graphhopper/`), quindi legge `/graphhopper/config-example.yml` — il file **bundled nell'immagine** con profili `car, foot, bike`.

Qualsiasi mount del nostro config a `/graphhopper/config-example.yml` viene ignorato perché il container già in esecuzione usa i mounts al momento della creazione; un container creato senza il mount corretto non lo eredita mai.

## Fix nel docker-compose.yml

Nel blocco `x-gh-area` (applicato a tutti i 7 servizi GH), aggiungere:
```yaml
entrypoint: ["./graphhopper.sh", "-c", "/graphhopper/config.yml"]
```

E ogni servizio GH deve montare:
```yaml
- ./graphhopper/config.yml:/graphhopper/config.yml:ro
```

Il path assoluto `/graphhopper/config.yml` bypassa l'ambiguità CWD e punta al nostro config motorcycle.

## Sintomo del bug

- Container avviato senza override entrypoint → usa profili `car, foot, bike` (bundled)
- Se il grafo pre-costruito ha profili `motorcycle` → mismatch → GH cancella il grafo e re-importa da zero con profili sbagliati
- I container "healthy" piccoli (grecia, balcani, est, ~0.6-1.5 GB PBF) finiscono il re-import in 2-4h; quelli grandi rimangono "unhealthy" o "importing" per giorni

**Why:** Il path relativo `config-example.yml` punta sempre al file bundled dentro l'immagine, non al mount esterno.

## Bug aggiuntivo: build-regions.sh — variabile GROUPS riservata bash

`GROUPS` è una variabile **read-only** di bash che contiene i GID dell'utente corrente (es. `1000 24 27 30...`). Se `build-regions.sh` usa `GROUPS` come nome variabile per la lista delle aree, l'assegnazione `GROUPS=("$@")` fallisce silenziosamente, `${#GROUPS[@]}` ritorna il numero di GID (≠ 0), l'if che carica `ALL_GROUPS` viene saltato, e il loop itera sui GID → tutti "gruppi sconosciuti".

**Fix**: `sed -i 's/\bGROUPS\b/BUILD_GROUPS/g' build-regions.sh`

Il sed usa `\b` per word boundary, quindi NON tocca `ALL_GROUPS`, `OK_GROUPS`, `FAIL_GROUPS`.

## Come applicare

Dopo ogni modifica al compose per questi container: `docker compose up -d graphhopper-<nome>` recrea il container con il nuovo entrypoint. Verificare sempre con:
```bash
curl -s http://localhost:89XX/info | python3 -c "import sys,json; d=json.load(sys.stdin); print([p['name'] for p in d.get('profiles',[])])"
# deve restituire ['motorcycle', 'motorcycle_fast', 'car', 'car_fast']
```
