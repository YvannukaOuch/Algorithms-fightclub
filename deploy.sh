#!/usr/bin/env bash
# Build and publish Algorithm Fight Club (Git Bash, from this folder):  ./deploy.sh
# Static files only (no server process); the C++ engine runs in the browser as WebAssembly.
# The first run adds the Caddy block for fightclub.sraas.dev (backed up, validated).
set -euo pipefail

TARGET="${DEPLOY_TARGET:-sraas}"
HOSTS="${HOSTS:-fightclub.sraas.dev}"

npm run build:wasm
npm run build
tar czf - -C dist . | ssh "$TARGET" 'rm -rf /var/www/fightclub.new && mkdir -p /var/www/fightclub.new && tar xzf - -C /var/www/fightclub.new'
ssh "$TARGET" "HOSTS='$HOSTS' bash -s" <<'REMOTE'
set -e
rm -rf /var/www/fightclub.old
[ -d /var/www/fightclub ] && mv /var/www/fightclub /var/www/fightclub.old
mv /var/www/fightclub.new /var/www/fightclub && rm -rf /var/www/fightclub.old
CF=/etc/caddy/Caddyfile
if ! grep -q "Fight Club (added by fightclub/deploy.sh)" "$CF"; then
  BACKUP="$CF.bak-$(date +%F-%H%M)-fightclub"
  cp "$CF" "$BACKUP"
  printf '\n# ---- Fight Club (added by fightclub/deploy.sh) ---- static site; WebGL + WebAssembly run in the browser\n%s {\n\timport horsetinder_log fightclub\n\tencode zstd gzip\n\troot * /var/www/fightclub\n\t@assets path /assets/*\n\theader @assets Cache-Control "public, max-age=31536000, immutable"\n\t@pages not path /assets/*\n\theader @pages Cache-Control "no-cache"\n\theader X-Content-Type-Options nosniff\n\ttry_files {path} /index.html\n\tfile_server\n}\n' "$HOSTS" >> "$CF"
  touch /var/log/caddy/fightclub.log && chown caddy:caddy /var/log/caddy/fightclub.log
  if ! caddy validate --config "$CF" --adapter caddyfile >/dev/null 2>&1; then
    cp "$BACKUP" "$CF"
    echo "Caddyfile didn't validate; restored the backup." >&2
    exit 1
  fi
  systemctl reload caddy
fi
echo published
REMOTE
echo "> Done: https://fightclub.sraas.dev"
