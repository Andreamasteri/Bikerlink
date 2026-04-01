#!/bin/bash
set -e

echo "Running post-merge setup..."
npm run db:push --force 2>&1 || true

echo "Invalidating server_dist to force TypeScript recompile on next start..."
rm -f server_dist/index.js

echo "Post-merge setup complete."
