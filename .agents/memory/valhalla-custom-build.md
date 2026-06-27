---
name: Valhalla custom Docker build from source
description: How to rebuild the BikerLink custom Valhalla image from valhalla/valhalla master on the ThinkCentre, and the build gotchas.
---

# Valhalla custom Docker image (built from upstream master)

We build our own `bikerlink/valhalla:master-YYYYMMDD` (+ `:latest`) from
`valhalla/valhalla` master HEAD on the ThinkCentre, instead of the abandoned
`gis-ops/docker-valhalla` (stuck at 3.5.1). Custom Dockerfile lives at
`infra/self-host/valhalla/Dockerfile` (also on TC at
`/home/andrea/bikerlink/infra/self-host/valhalla/Dockerfile`). Full rebuild
procedure is in `infra/self-host/README.md` ("Come ricostruire Valhalla").

## Gotchas (cost real time — don't relearn)

- **Dockerfile is NOT in repo root.** Upstream keeps it at `docker/Dockerfile`
  (context = repo root). Build with `-f <dockerfile> <source-dir>`, never assume
  root. Our custom file is the byte-exact upstream `docker/Dockerfile` + only a
  trailing `ARG`/`LABEL bikerlink.*` block (no build-logic change).
- **Submodules required.** The Dockerfile does `COPY third_party/`. A plain
  shallow clone has empty submodules → build fails. Run
  `git submodule update --init --recursive --depth=1` after clone.
- **`valhalla_build_timezones --version` does NOT print a version** — it ignores
  the flag and writes the timezone SQLite DB to stdout (binary garbage). Use
  `valhalla_service --version` (or `valhalla_build_tiles --version`) →
  `3.7.0-<shortsha>`. The `--build-arg VERSION_MODIFIER=<shortsha>` is what makes
  the version string carry the commit; it also forces a full recompile each build.
- Build ~20-40 min, multi-stage (builder ubuntu:24.04 → runner). TC has 30GB RAM
  + 57GB swap, plenty. Image ~969MB (245MB content).

**Why:** gis-ops image is semi-abandoned and missing 37+ critical post-3.7.0
fixes (oneway-trace crash, loop edges, adminbuilder UB, NaN rapidjson, heap OOB).
Building from master keeps the image under our control with all fixes.

## NOT a drop-in for gis-ops in docker-compose (cost real time)

The custom image is bare upstream: `ENTRYPOINT=null`, `CMD=["/bin/bash"]`. It has
NONE of the gis-ops orchestration entrypoint that read env vars
(`serve_tiles`/`build_admins`/`use_tiles_ignore_pbf`/`force_rebuild`/...), generated
`valhalla.json`, built tiles, and launched the server. So swapping only `image:`
makes the container run bash and exit 0 (Restarting). Two required compose changes:

1. Add an explicit launcher: `command: ["valhalla_service","/custom_files/valhalla.json","1"]`.
   The gis-ops `environment:` keys become no-ops with this image (kept only to document
   intent; tile build is now a separate concern, not the entrypoint's job).
2. **Config schema migration.** The newer master binary rejects the old
   gis-ops-generated `valhalla.json` with `boost ptree_bad_path: No such node
   (loki.service_defaults.mvt_min_zoom_road_class)` and crashes. Fix: regen defaults
   with the new binary (`valhalla_build_config --mjolnir-tile-dir ... --mjolnir-tile-extract
   ... --mjolnir-timezone ... --mjolnir-admin ...`) and ADDITIVELY deep-merge into the
   existing config (existing values win, only missing keys added — ~18 new keys:
   loki.service_defaults.mvt_*, thor.*_astar, service_limits.*, logging, etc.). Tiles
   themselves (`valhalla_tiles.tar` via `tile_extract`) load unchanged. `data/valhalla.json`
   is root-owned → write merge to /tmp and `sudo cp` into place. **Why additive merge:**
   preserves custom motorcycle costing without a risky full regen.

**Build-tile workflow caveat:** `build-valhalla-tiles.sh` and `force_rebuild` env still
assume the gis-ops auto-build entrypoint — they no longer work as-is with the custom image.

**Pre-existing infra gotcha (not caused by image swap):** nginx
`sites-enabled/bikerlink` is a diverged real file (NOT a symlink to sites-available);
its `upstream valhalla_backend` points to `127.0.0.1:8003` while the container serves on
`8002` → public valhalla.bikerlink.duckdns.org returns 502 even when localhost:8002 is 200.
