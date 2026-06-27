---
name: GraphHopper build on ThinkCentre — operational gotchas
description: How to actually run build-graphs-sequential.sh on the ThinkCentre without the build dying instantly; non-obvious env/sudo/RAM prerequisites.
---

# GraphHopper "grafa" build — ThinkCentre prerequisites

Running the GraphHopper graph build (`infra/self-host/build-graphs-sequential.sh`, the
script `check-status.sh` recommends — NOT `build-regions.sh`) on the ThinkCentre fails
instantly for all areas unless three environment realities are handled. The failures look
like an instant "8 aree fallite" with no real import.

## Must run the whole script as root
The script calls `sudo` internally (cleanup of root-owned `graphs/<area>` dirs that Docker
creates, plus `fallocate`/`mkswap`/`swapon`). Via `tc.py exec` (non-interactive) those inner
`sudo` calls have no password → cleanup + swap fail → every area aborts in setup.
**Fix:** run the entire script as root.

**Why a self-redirecting launcher:** `tc.py exec "... >logfile ..." --sudo` fails the shell
redirect with `Permission denied` (the `>` redirect is not evaluated as root, and overwriting
another user's existing file in sticky `/tmp` fails). Don't fight it. Instead write a tiny
launcher on the box that redirects its OWN stdout (`exec >/home/andrea/ghbuild.out 2>&1` as the
first line), exports the env, then `exec bash build-graphs-sequential.sh`; launch it with
`tc.py exec "setsid bash /home/andrea/run-ghbuild.sh </dev/null & echo PID=\$!" --sudo`.
All redirects then happen inside the root process.

## SWAP_FILE / BACKUP_DIR defaults are wrong for this box
Script defaults `SWAP_FILE=/mnt/nvme/build.swap` and `BACKUP_DIR=/mnt/nvme/GRAFIGH`, but
**`/mnt/nvme` does not exist** — the 1.9T NVMe is mounted at `/` (1.6T free). Override:
`SWAP_FILE=/home/andrea/build.swap SWAP_SIZE_GB=64 BACKUP_DIR=/home/andrea/GRAFIGH`.
Without a valid swap dir the large areas (germania-centro, francia-benelux) fail the resource
guard (they need swap ≥16GB and per-area heap up to `-Xmx28g`).

## Free RAM by stopping ollama first
Ollama (systemd) holds the 30b CPU-only model → ~18GB of 30GB RAM. Build heaps reach 28g, and
the resource guard wants ≥10GB free for large areas. `sudo systemctl stop ollama` drops usage
to ~1GB (≈28GB available). Do this before launching; ollama is only the AI network-fallback,
cloud chain still works. Remember to restart it later if desired.

## Pre-clean the root-owned graph dirs once
Docker creates `graphs/<area>` as root. Before the first build (or after a failed one) clear them
with sudo: `rm -rf /home/andrea/bikerlink/infra/self-host/graphs/*` via `tc.py ... --sudo`.

## Monitoring
- Script log: `/home/andrea/ghbuild.out` (launcher) and `/tmp/bk-build-graphs.log` (script `log()`).
- State: `/tmp/bk-build-graphs-state.txt`. Build order smallest→largest:
  `ecuador grecia balcani est iberia arco-alpino germania-centro francia-benelux`. Takes hours.
- The per-line area label in the log is a cosmetic bug (always prints "francia-benelux"); the real
  area is under the `Area: <x>` header. Containers only start AFTER import (build uses `docker run --rm`).
