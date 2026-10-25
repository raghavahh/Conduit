#!/bin/bash
set -e

echo "Running database migrations..."

if [ "$1" = "local" ]; then
    wrangler d1 execute conduit-prod --file=./DB/schema.sql
else
    wrangler d1 execute conduit-prod --file=./DB/schema.sql --remote
fi

echo "Migrations complete!"