#!/bin/bash
fuser -k 8081/tcp 2>/dev/null || true
sleep 1
exec npm run expo:dev
