#!/usr/bin/env bash
set -e

mkdir -p .expo/types

if [ ! -s .expo/types/router.d.ts ]; then
  echo "// stub — replaced by Metro on first run" > .expo/types/router.d.ts
fi

npx tsc --noEmit --project tsconfig.json
