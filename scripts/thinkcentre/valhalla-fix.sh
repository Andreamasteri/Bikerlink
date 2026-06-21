#!/usr/bin/env bash
# Riavvia Valhalla (senza rebuild tile)
docker stop valhalla 2>/dev/null; sleep 2
docker start valhalla
sleep 5
docker ps --filter name=valhalla --format "{{.Names}}  {{.Status}}"
