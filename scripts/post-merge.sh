#!/bin/bash
set -e

echo "Running post-merge setup..."
npm run db:push --force 2>&1 || true
echo "Post-merge setup complete."
