---
name: GH RAM_STORE OOM silenzioso su PBF grandi
description: GraphHopper su PBF > 5 GB con RAM_STORE fa import completo (exit 0, 28+ min) ma non scrive il file properties — OOM silenzioso durante flush/CH.
---

# GH RAM_STORE OOM silenzioso — aree grandi

**Regola:** aree con PBF > 5 GB NON devono usare `-Ddw.graphhopper.graph.dataaccess.default_type=RAM_STORE`.

**Why:** Con RAM_STORE tutto il grafo vive in heap durante l'import. Per france-benelux (6.8 GB PBF) il grafo occupa ~20-25 GB di heap. Con -Xmx28g l'import termina (28+ min, exit 0) ma durante la fase CH shortcuts o il flush finale il JVM OOM silenziosamente → GH esce 0 senza scrivere `properties`.

**How to apply:**
- Aree piccole (< 4 GB PBF): RAM_STORE OK, import veloce.
- Aree grandi (> 5 GB PBF: germania-centro, francia-benelux): ometti il flag → GH usa MMAP di default → scrive su disco progressivamente → no OOM → properties scritto.
- Con MMAP usa heap ridotto (-Xmx14g): il grafo non sta in heap, solo le strutture CH.
- Build più lento con MMAP ma affidabile al 100%.

**Banco di prova:** usa sempre `ecuador` (PBF 114 MB, ~5 min) per verificare che il docker command sia corretto PRIMA di buildare le aree grandi. Marker di successo: file `properties` nella graph-cache dir.

**Docker command corretto (template):**
```bash
docker run --rm \
  --name bk-build-<area> \
  -v $BASE/data:/data:ro \
  -v $BASE/graphs/<area>:/graphhopper/graph-cache \
  -v $BASE/graphhopper/config.yml:/graphhopper/config.yml:ro \
  -e GRAPH=/graphhopper/graph-cache \
  -e FILE=/data/<area>.osm.pbf \
  -e JAVA_OPTS="<heap> -XX:+UseParallelGC -XX:ParallelGCThreads=4 -XX:MaxMetaspaceSize=512m -server [+RAM_STORE solo se piccola]" \
  bikerlink/graphhopper:latest \
  --import -c /graphhopper/config.yml -o /graphhopper/graph-cache
```
