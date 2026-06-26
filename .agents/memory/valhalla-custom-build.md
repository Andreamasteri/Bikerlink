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
