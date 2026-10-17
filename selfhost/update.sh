#!/bin/bash
# Update self-hosted Clean Slate from the fork. Run from /root/cleanslate-stack:
#   bash cleanslate/selfhost/update.sh
set -euo pipefail
cd "$(dirname "$0")/../.."   # /root/cleanslate-stack

echo "1/4 Backing up the database..."
mkdir -p backups
docker exec cleanslate-db pg_dump -U postgres postgres | gzip > "backups/cleanslate-$(date +%Y%m%d-%H%M%S).sql.gz"
ls -t backups/cleanslate-*.sql.gz | tail -n +11 | xargs -r rm --   # keep the last 10

echo "2/4 Fetching the latest code..."
git -C cleanslate pull --ff-only
cp cleanslate/selfhost/docker-compose.yml docker-compose.yml
export NEXT_PUBLIC_VERSION=$(git -C cleanslate rev-parse --short HEAD)

echo "3/4 Building (takes a few minutes)..."
docker compose build

echo "4/4 Restarting..."
docker compose up -d
docker compose ps
echo "Done: version $NEXT_PUBLIC_VERSION"
