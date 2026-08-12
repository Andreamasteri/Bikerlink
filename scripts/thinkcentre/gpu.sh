#!/usr/bin/env bash
# gpu.sh — ThinkCentre GPU/NVMe/PCIe monitor with 5s refresh
#
# Usage: ./gpu.sh
# Requires: HUB_GATE_TOKEN env var (or set in ~/.bashrc / sourced .env)
#
# Queries http://localhost:4405/vram and formats VRAM, GPU%, NVMe temp,
# and PCIe AER status. Refreshes every 5 seconds.

set -euo pipefail

TOKEN="${HUB_GATE_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  # Try sourcing local .env if present
  if [ -f "$(dirname "$0")/.env" ]; then
    # shellcheck source=/dev/null
    source "$(dirname "$0")/.env"
    TOKEN="${HUB_GATE_TOKEN:-}"
  fi
fi

if [ -z "$TOKEN" ]; then
  echo "ERROR: HUB_GATE_TOKEN is not set. Export it before running this script." >&2
  exit 1
fi

ENDPOINT="http://localhost:4405/vram"

format_vram() {
  local json="$1"
  local used total pct gpu_util nvme_temp nvme_spare nvme_used nvme_unsafe nvme_media
  local aer_count aer_warn breakdown confidence
  local available reason

  available=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('available', True) else 'no')" 2>/dev/null || echo "yes")
  reason=$(echo "$json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('reason','unknown'))" 2>/dev/null || echo "unknown")
  if [ "$available" = "no" ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  🖥  ThinkCentre GPU Monitor  —  $(date '+%Y-%m-%d %H:%M:%S')"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  VRAM:     offline (GPU metrics unavailable: $reason)"
    echo "  GPU Util: unavailable"
    echo ""
    echo "  Agents loaded: unavailable"
    echo "  NVMe: unavailable while GPU metrics endpoint is offline"
    echo "  PCIe AER: unavailable while GPU metrics endpoint is offline"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    return
  fi

  used=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['current']['usedMiB'])" 2>/dev/null || echo "?")
  total=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['current']['totalMiB'])" 2>/dev/null || echo "?")
  pct=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print('%.1f' % d['current']['pct'])" 2>/dev/null || echo "?")
  gpu_util=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); u=d['current'].get('gpuUtil'); print(str(u)+'%' if u is not None else 'n/a')" 2>/dev/null || echo "?")
  confidence=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('breakdownConfidence','?'))" 2>/dev/null || echo "?")

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  🖥  ThinkCentre GPU Monitor  —  $(date '+%Y-%m-%d %H:%M:%S')"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  printf "  VRAM:     %s / %s MiB  (%.0f%%)\n" "$used" "$total" "$(echo "$pct" | tr -d '%')" 2>/dev/null || \
    printf "  VRAM:     %s / %s MiB  (%s)\n" "$used" "$total" "$pct"
  printf "  GPU Util: %s\n" "$gpu_util"

  # Breakdown
  echo ""
  echo "  Agents loaded (confidence: $confidence):"
  echo "$json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
bd = d.get('breakdown', [])
if not bd:
    print('    (none)')
for e in bd:
    agent = e.get('agent') or 'unknown'
    model = e.get('model') or 'unknown'
    mib   = e.get('usedMiB', 0)
    print(f'    {agent:<12} {model:<25} {mib} MiB')
" 2>/dev/null || echo "    (parse error)"

  # NVMe
  echo ""
  local has_nvme
  has_nvme=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if 'nvme' in d and d['nvme'] else 'no')" 2>/dev/null || echo "no")
  if [ "$has_nvme" = "yes" ]; then
    nvme_temp=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['nvme'].get('tempC','?'))" 2>/dev/null || echo "?")
    nvme_spare=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['nvme'].get('sparePct','?'))" 2>/dev/null || echo "?")
    nvme_used=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['nvme'].get('usedPct','?'))" 2>/dev/null || echo "?")
    nvme_unsafe=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['nvme'].get('unsafeShutdowns','?'))" 2>/dev/null || echo "?")
    nvme_media=$(echo "$json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['nvme'].get('mediaErrors','?'))" 2>/dev/null || echo "?")
    echo "  NVMe (/dev/nvme0):"
    printf "    Temp:             %s °C\n" "$nvme_temp"
    printf "    Available spare:  %s%%\n" "$nvme_spare"
    printf "    Percentage used:  %s%%\n" "$nvme_used"
    printf "    Unsafe shutdowns: %s\n" "$nvme_unsafe"
    printf "    Media errors:     %s\n" "$nvme_media"
  else
    echo "  NVMe: n/a (nvme-cli not installed or no /dev/nvme0)"
  fi

  # PCIe AER
  echo ""
  local aer_block
  aer_block=$(echo "$json" | python3 -c "
import sys, json
d = json.load(sys.stdin)
aer = d.get('pcieAer')
if aer is None:
    print('n/a')
else:
    cnt  = aer.get('count24h', 0)
    warn = aer.get('warn', False)
    flag = '  ⚠  [WARN]' if warn else ''
    print(f'{cnt} correctable errors in last 24h{flag}')
" 2>/dev/null || echo "?")
  printf "  PCIe AER: %s\n" "$aer_block"

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

echo "Starting GPU monitor (refresh every 5s). Press Ctrl-C to quit."
echo ""

while true; do
  json=$(curl -sf -H "X-Hub-Gate-Token: $TOKEN" "$ENDPOINT" 2>/dev/null || echo "")
  if [ -z "$json" ]; then
    echo "$(date '+%H:%M:%S')  ERROR: could not reach $ENDPOINT"
  else
    clear
    format_vram "$json"
  fi
  sleep 5
done
