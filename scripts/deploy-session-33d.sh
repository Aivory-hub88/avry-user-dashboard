#!/usr/bin/env bash
# Deploy: login sessions last 33 days (sliding).
#   avry-backend#34, avry-admin-dashboard#16,
#   avry-user-dashboard#101.  (avry-website / Frntend-nxt#102 is deployed separately.)
# Run from the Mac:  bash scripts/deploy-session-33d.sh
set -euo pipefail

ssh aivory-prod 'bash -s' <<'REMOTE'
set -euo pipefail
ts=$(date +%Y%m%d-%H%M%S)
cd /home/ubuntu/AVRY-V2-Main
C=docker-compose.prod.yml

# service:checkout pairs
PAIRS="avry-backend:backend/avry-backend avry-admin-dashboards:frontend/avry-admin-dashboard avry-user-dashboard:frontend/avry-user-dashboard"

# 0. a REFRESH_TOKEN_EXPIRE_DAYS override in the env would beat the new 33-day default
grep -rn "REFRESH_TOKEN_EXPIRE_DAYS" "$C" backend/avry-backend/.env* .env* 2>/dev/null \
  && echo "!! REFRESH_TOKEN_EXPIRE_DAYS is set above: change it to 33 too" || echo "no env override (good)"

# 1. rollback tags from the RUNNING images
for p in $PAIRS; do
  svc=${p%%:*}
  img=$(sudo docker inspect -f '{{.Image}}' "$svc")
  repo=$(sudo docker inspect -f '{{.Config.Image}}' "$svc" | cut -d: -f1)
  sudo docker tag "$img" "$repo:rollback-$ts"
  echo "rollback tag: $repo:rollback-$ts"
done

# 2. move the checkouts to origin/main
for p in $PAIRS; do
  dir=${p#*:}
  sudo -u ubuntu git -C "$dir" fetch -q origin main
  sudo -u ubuntu git -C "$dir" checkout -q --detach origin/main
  echo "$dir -> $(sudo -u ubuntu git -C "$dir" log --oneline -1)"
done

# 3. build (up to 3 tries) + up
for p in $PAIRS; do
  svc=${p%%:*}
  ok=0
  for try in 1 2 3; do
    log=$(mktemp /tmp/deploy-$svc-XXXX.log)
    if sudo docker compose -f "$C" build --progress=plain "$svc" > "$log" 2>&1; then ok=1; break; fi
    echo "build $svc failed (try $try), log: $log"; tail -15 "$log"
  done
  [ "$ok" = 1 ] || { echo "BUILD FAILED: $svc (running container untouched)"; exit 1; }
  sudo docker compose -f "$C" up -d --no-deps "$svc" 2>&1 | tail -2
done

# 4. verify + pin
sleep 20
for p in $PAIRS; do
  svc=${p%%:*}
  echo "$svc: $(sudo docker inspect -f '{{.State.Status}} restarts={{.RestartCount}}' "$svc")"
  repo=$(sudo docker inspect -f '{{.Config.Image}}' "$svc" | cut -d: -f1)
  sudo docker tag "$(sudo docker inspect -f '{{.Image}}' "$svc")" "$repo:current-$ts"
done
curl -s -o /dev/null -w "dashboard https://aivory.uk/dashboard/ : %{http_code}\n" https://aivory.uk/dashboard/ || true
curl -s -o /dev/null -w "backend   https://backend.aivory.id/health : %{http_code}\n" https://backend.aivory.id/health || true
echo "DONE ts=$ts  (rollback: retag <repo>:rollback-$ts to the compose image and 'up -d --no-deps <svc>')"
REMOTE
