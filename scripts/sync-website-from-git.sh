#!/usr/bin/env bash
# Sync the prod website source (/home/ubuntu/AVRY-V2-Main root: src/, public/,
# next.config.js, package*.json, ...) from Frntend-nxt main, then rebuild avry-website.
# The VPS root is NOT a Frntend-nxt clone, so this rsyncs from a fresh clone.
# Never touches docker-compose files, node_modules, backend/, frontend/, ops/.
# Run from the Mac:  bash scripts/sync-website-from-git.sh [--dry-run]
set -euo pipefail
DRY=${1:-}

ssh aivory-prod DRY="$DRY" 'bash -s' <<'REMOTE'
set -euo pipefail
ts=$(date +%Y%m%d-%H%M%S)
cd /home/ubuntu/AVRY-V2-Main
C=docker-compose.prod.yml
src=$(mktemp -d)
git clone -q --depth 1 https://github.com/Aivory-hub88/Frntend-nxt.git "$src/n"
echo "Frntend-nxt -> $(git -C "$src/n" log --oneline -1)"

# what would change (src is mirrored; public/ only adds/updates, never deletes)
echo "--- src (mirror)";    rsync -rcni --delete "$src/n/src/" src/ | grep -v '^\.' || true
echo "--- public (no delete)"; rsync -rcni "$src/n/public/" public/ | grep -v '^\.' || true
for f in next.config.js package.json package-lock.json Dockerfile tailwind.config.ts postcss.config.js tsconfig.json; do
  [ -f "$src/n/$f" ] && ! cmp -s "$src/n/$f" "$f" && echo "--- differs: $f"
done
[ "${DRY:-}" = "--dry-run" ] && { echo "dry run only"; exit 0; }

# backup + apply
bk=/home/ubuntu/website-src-backup-$ts; mkdir -p "$bk"
sudo cp -a src public next.config.js package.json package-lock.json Dockerfile tailwind.config.ts postcss.config.js tsconfig.json "$bk"/ 2>/dev/null || true
echo "backup: $bk"
img=$(sudo docker inspect -f '{{.Image}}' avry-website); repo=$(sudo docker inspect -f '{{.Config.Image}}' avry-website | cut -d: -f1)
sudo docker tag "$img" "$repo:rollback-$ts"; echo "rollback tag: $repo:rollback-$ts"

sudo rsync -rc --delete "$src/n/src/" src/
sudo rsync -rc "$src/n/public/" public/
for f in next.config.js package.json package-lock.json Dockerfile tailwind.config.ts postcss.config.js tsconfig.json; do
  [ -f "$src/n/$f" ] && sudo cp "$src/n/$f" "$f"
done

ok=0
for try in 1 2 3; do
  log=$(mktemp /tmp/deploy-website-XXXX.log)
  if sudo docker compose -f "$C" build --progress=plain avry-website > "$log" 2>&1; then ok=1; break; fi
  echo "build failed (try $try), log: $log"; tail -15 "$log"
done
[ "$ok" = 1 ] || { echo "BUILD FAILED (running container untouched). Restore: sudo cp -a $bk/* ."; exit 1; }
sudo docker compose -f "$C" up -d --no-deps avry-website 2>&1 | tail -2
sleep 15
echo "avry-website: $(sudo docker inspect -f '{{.State.Status}} restarts={{.RestartCount}}' avry-website)"
curl -s -o /dev/null -w "https://aivory.uk/ : %{http_code}\n" https://aivory.uk/ || true
echo "DONE ts=$ts (rollback: retag $repo:rollback-$ts and 'up -d --no-deps avry-website')"
REMOTE
