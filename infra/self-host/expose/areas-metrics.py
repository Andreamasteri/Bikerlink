#!/usr/bin/env python3
# =============================================================================
# BikerLink — areas-metrics.py
# Collector di metriche per le istanze GraphHopper-area. Espone in locale
# (127.0.0.1:9090) un JSON con stato + consumo risorse di ogni container area,
# letto da nginx su /metrics/areas (vedi nginx-bikerlink.conf).
#
# SOLO stdlib (nessuna dipendenza pip). Dati raccolti via `docker`:
#   - docker ps        → quali container area esistono / sono su
#   - docker stats     → CPU%, RAM usata/limite per i container su
#
# Auth: header X-GH-Token (o Authorization: Bearer) confrontato con GH_TOKEN.
#   nginx fa già da primo gate, ma il controllo qui è difesa in profondità nel
#   caso il servizio venga esposto direttamente.
#
# Uso (systemd: areas-metrics.service):
#   GH_TOKEN=<token> ./areas-metrics.py
# Env opzionali:
#   METRICS_PORT (default 9090), METRICS_BIND (default 127.0.0.1)
#
# Output esempio:
#   {
#     "timestamp": "2026-06-07T10:00:00Z",
#     "areas": [
#       {"code":"grecia","container":"bikerlink-gh-grecia","running":true,
#        "health":"healthy","cpu_perc":"3.2%","mem_usage":"1.1GiB","mem_limit":"2GiB","mem_perc":"55%"},
#       {"code":"est","container":"bikerlink-gh-est","running":false,"health":null}
#     ]
#   }
# =============================================================================
import json
import os
import subprocess
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Codici area validi (sync con shared/routing-areas.ts).
AREA_CODES = [
    "grecia",
    "balcani",
    "est",
    "iberia",
    "arco-alpino",
    "germania-centro",
    "francia-benelux",
    "ecuador",
]
CONTAINER_PREFIX = "bikerlink-gh-"

GH_TOKEN = os.environ.get("GH_TOKEN", "")
PORT = int(os.environ.get("METRICS_PORT", "9090"))
BIND = os.environ.get("METRICS_BIND", "127.0.0.1")

# File JSONL scritto da areas-watchdog.sh con gli eventi start/stop container.
# Deve corrispondere ad AREAS_EVENTS_FILE nel watchdog (stesso default).
EVENTS_FILE = os.environ.get(
    "AREAS_EVENTS_FILE", "/var/lib/bikerlink/watchdog-events.jsonl"
)
EVENTS_MAX_RETURN = 50  # quanti eventi esporre al massimo nella relay


def _run(args, timeout=10):
    """Esegue un comando e ritorna stdout (str) o '' in caso di errore."""
    try:
        out = subprocess.run(
            args, capture_output=True, text=True, timeout=timeout, check=False
        )
        return out.stdout if out.returncode == 0 else ""
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return ""


def _running_containers():
    """Set dei nomi container area attualmente in esecuzione."""
    out = _run(["docker", "ps", "--format", "{{.Names}}"])
    return {n.strip() for n in out.splitlines() if n.strip().startswith(CONTAINER_PREFIX)}


def _health(container):
    """Stato health del container (healthy/unhealthy/starting) o None."""
    out = _run(
        ["docker", "inspect", "-f", "{{.State.Health.Status}}", container]
    ).strip()
    if not out or out == "<no value>":
        return None
    return out


def _stats():
    """Mappa container → dict di metriche da `docker stats` (no-stream)."""
    fmt = "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"
    out = _run(["docker", "stats", "--no-stream", "--format", fmt], timeout=20)
    result = {}
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) != 4:
            continue
        name, cpu, mem_usage, mem_perc = (p.strip() for p in parts)
        if not name.startswith(CONTAINER_PREFIX):
            continue
        usage, _, limit = mem_usage.partition("/")
        result[name] = {
            "cpu_perc": cpu,
            "mem_usage": usage.strip(),
            "mem_limit": limit.strip(),
            "mem_perc": mem_perc,
        }
    return result


def _collect_events():
    """Legge gli ultimi EVENTS_MAX_RETURN eventi dal file JSONL del watchdog.

    Ogni riga del file è un oggetto JSON:
      {"ts":"...","code":"...","action":"...","reason":"..."}
    Gli eventi sono restituiti in ordine decrescente (più recente prima),
    come si aspetta la UI Log Watchdog.
    Ritorna una lista vuota se il file non esiste o non è leggibile.
    """
    try:
        with open(EVENTS_FILE, "r", encoding="utf-8") as fh:
            lines = fh.readlines()
    except (FileNotFoundError, PermissionError, OSError):
        return []

    events = []
    for line in reversed(lines):
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        events.append(obj)
        if len(events) >= EVENTS_MAX_RETURN:
            break
    return events


def collect():
    """Raccoglie lo snapshot completo delle metriche per tutte le aree."""
    running = _running_containers()
    stats = _stats()
    areas = []
    for code in AREA_CODES:
        container = CONTAINER_PREFIX + code
        is_running = container in running
        entry = {
            "code": code,
            "container": container,
            "running": is_running,
            "health": _health(container) if is_running else None,
        }
        if is_running and container in stats:
            entry.update(stats[container])
        areas.append(entry)
    return {
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "areas": areas,
        "events": _collect_events(),
    }


def _authorized(headers):
    """True se il token nell'header combacia con GH_TOKEN. Se GH_TOKEN è vuoto
    l'auth è disattivata (utile solo in debug locale)."""
    if not GH_TOKEN:
        return True
    if headers.get("X-GH-Token") == GH_TOKEN:
        return True
    auth = headers.get("Authorization", "")
    return auth == f"Bearer {GH_TOKEN}"


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not _authorized(self.headers):
            self._send(401, {"error": "Unauthorized. Provide X-GH-Token header."})
            return
        try:
            self._send(200, collect())
        except Exception as exc:  # noqa: BLE001 — non far cadere il server
            self._send(500, {"error": f"collector error: {exc}"})

    def log_message(self, *_args):
        # Silenzia il log per-request su stderr (gestito da nginx/journal).
        pass


def main():
    server = ThreadingHTTPServer((BIND, PORT), Handler)
    print(f"[areas-metrics] in ascolto su http://{BIND}:{PORT} (auth={'on' if GH_TOKEN else 'off'})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()


if __name__ == "__main__":
    main()
