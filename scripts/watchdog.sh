#!/bin/bash
# watchdog.sh — shim: il guardiano ora è Cerbero (tre teste). Originale in scripts/backup/watchdog.sh.bak
exec bash "$(dirname "$0")/cerbero.sh" "$@"
