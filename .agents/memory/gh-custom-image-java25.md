---
name: GraphHopper custom image (da sorgente, Java 25)
description: L'immagine GraphHopper del ThinkCentre è custom (bikerlink/graphhopper:latest) compilata da sorgente; come si rigenera e gotcha di verifica.
---

# GraphHopper custom image — da sorgente su Java 25

Lo stack self-host NON usa più `israelhikingmap/graphhopper`. Gira `bikerlink/graphhopper:latest`,
immagine **custom multi-stage** compilata da sorgente (`graphhopper/graphhopper` @master HEAD, GH 12.x)
su runtime **Java 25 LTS** (Temurin). Build context versionato in `infra/self-host/graphhopper/image/`
(`Dockerfile` + `graphhopper.sh`). L'immagine vive **solo nell'image store locale** del ThinkCentre
(non è su Docker Hub) → referenziata per tag, non per digest.

**How to apply:** rigenerare con `docker build --pull -t bikerlink/graphhopper:latest .` dentro
`infra/self-host/graphhopper/image/` sul ThinkCentre. Pin in `docker-compose.yml` (anchor `x-gh-area`)
e `build-regions.sh` (`GH_IMAGE`) devono restare allineati.

## Perché lo script graphhopper.sh è embeddato
Master HEAD **non ha più** `graphhopper.sh` né un `Dockerfile` alla root del repo. Lo script è copiato
nel build context: è la versione ufficiale che legge le env `FILE`/`GRAPH` e **forza** `graph.location`
via sysprop (così ogni area scrive sul proprio grafo, niente collisione su /data/default-gh). È questo
script — non l'immagine israelhikingmap — il "VINCOLO CRITICO" del config.yml.

## Gotcha di verifica /health
Il `config-example.yml` BUNDLED nell'immagine bind-a su `localhost:8989`, NON `0.0.0.0`. Quindi un
test con `-p 18989:8989` dà "Connection reset by peer" anche se il server è su. **Verifica /health
da DENTRO il container** (`docker exec gh-test curl localhost:8989/health` → 200 OK) oppure usa il
nostro `infra/self-host/graphhopper/config.yml` (bind 0.0.0.0). In produzione si usa il nostro config,
quindi nessun problema reale.

**Why:** verificato con build da master (giugno 2026): java 25.0.3 LTS, jar graphhopper-web-12.0-SNAPSHOT,
Jetty 12.1.9, import andorra.osm.pbf OK, /health=200.
