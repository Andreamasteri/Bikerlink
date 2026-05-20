#!/usr/bin/env python3
"""
BikerLink GraphHopper Health Server
Porta: 8990 (localhost only)
Nginx proxia /health a questo server

Restituisce:
  { "status": "ok", "graph_loaded": true, "osm_date": "2024-01-15", "version": "9.1", "profiles": [...] }
"""

import http.server
import json
import os
import socket
import sys
import time
from datetime import datetime, timezone

GH_DIR = os.environ.get("GH_DIR", "/opt/graphhopper")
GH_PORT = int(os.environ.get("GH_PORT", "8989"))
HEALTH_PORT = int(os.environ.get("HEALTH_PORT", "8990"))
GH_VERSION = os.environ.get("GH_VERSION", "9.1")


def get_osm_date():
    """Restituisce la data di ultima modifica del file OSM (o del grafo buildato)."""
    paths = [
        os.path.join(GH_DIR, "data", "italy-latest-gh"),
        os.path.join(GH_DIR, "data", "italy-latest.osm.pbf"),
    ]
    for p in paths:
        if os.path.exists(p):
            mtime = os.path.getmtime(p)
            return datetime.fromtimestamp(mtime, tz=timezone.utc).strftime("%Y-%m-%d")
    return "unknown"


def is_graphhopper_up():
    """Verifica che GraphHopper sia raggiungibile su localhost:8989."""
    try:
        with socket.create_connection(("127.0.0.1", GH_PORT), timeout=2):
            return True
    except (OSError, ConnectionRefusedError):
        return False


def graph_is_loaded():
    """Controlla se il grafo è stato buildato (directory presente e non vuota)."""
    graph_dir = os.path.join(GH_DIR, "data", "italy-latest-gh")
    if not os.path.isdir(graph_dir):
        return False
    return len(os.listdir(graph_dir)) > 0


class HealthHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def do_GET(self):
        if self.path not in ("/health", "/health/"):
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b'{"error": "Not Found"}')
            return

        gh_up = is_graphhopper_up()
        loaded = graph_is_loaded()

        payload = {
            "status": "ok" if gh_up else "starting",
            "graph_loaded": loaded and gh_up,
            "osm_date": get_osm_date(),
            "version": GH_VERSION,
            "profiles": ["motorcycle", "motorcycle_fast"],
            "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        }

        body = json.dumps(payload).encode()
        http_status = 200 if gh_up else 503

        self.send_response(http_status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    server = http.server.HTTPServer(("127.0.0.1", HEALTH_PORT), HealthHandler)
    print(f"[health-server] Avviato su 127.0.0.1:{HEALTH_PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
