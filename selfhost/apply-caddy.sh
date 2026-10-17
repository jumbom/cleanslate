#!/bin/bash
# Replace the food.pocket-box.com block in the shared Caddyfile with
# selfhost/caddy-food.txt, then restart Caddy. Keeps a dated backup.
# Run: bash /root/cleanslate-stack/cleanslate/selfhost/apply-caddy.sh
set -euo pipefail
CADDYFILE=/root/n8n-stack/Caddyfile
CONTAINER=n8n-stack-caddy-1
NEW="$(dirname "$0")/caddy-food.txt"
BACKUP="$CADDYFILE.bak-$(date +%Y%m%d-%H%M%S)"

cp "$CADDYFILE" "$BACKUP"
echo "Backup: $BACKUP"

# Drop the old block (from its first line to the closing brace at column 0)
awk '
  /^food\.pocket-box\.com \{/ { skip = 1; next }
  skip && /^\}/ { skip = 0; next }
  !skip { print }
' "$BACKUP" > "$CADDYFILE.tmp"
{ cat "$CADDYFILE.tmp"; echo; cat "$NEW"; } > "$CADDYFILE.new"
rm "$CADDYFILE.tmp"

# Write in place, so the file mounted into the container stays the same file
cat "$CADDYFILE.new" > "$CADDYFILE"
rm "$CADDYFILE.new"

if ! docker exec "$CONTAINER" caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
  echo "Caddy rejected the new config, restoring the backup."
  cat "$BACKUP" > "$CADDYFILE"
  exit 1
fi
docker exec -w /etc/caddy "$CONTAINER" caddy reload --config /etc/caddy/Caddyfile
echo "Caddy updated."
