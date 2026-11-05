#!/usr/bin/env bash
# Deploy: long-lived sessions (avry-backend#31 + avry-user-dashboard#96) and a
# 1-minute Composio connection sync (so a freshly connected Gmail reaches agents fast).
# Run from the Mac:  bash scripts/deploy-session-fix.sh
set -euo pipefail

ssh aivory-prod 'bash -s' <<'REMOTE'
set -euo pipefail
ts=$(date +%Y%m%d-%H%M%S)
cd /home/ubuntu/AVRY-V2-Main
C=docker-compose.prod.yml

# 1. rollback tags (from the RUNNING image, not the compose :latest tag)
for svc in avry-backend avry-user-dashboard; do
  img=$(sudo docker inspect -f '{{.Image}}' "$svc")
  repo=$(sudo docker inspect -f '{{.Config.Image}}' "$svc" | cut -d: -f1)
  sudo docker tag "$img" "$repo:rollback-$ts"
  echo "rollback tag: $repo:rollback-$ts"
done

# 2. move the checkouts to origin/main
sudo -u ubuntu git -C backend/avry-backend fetch -q origin main
sudo -u ubuntu git -C backend/avry-backend checkout -q --detach origin/main
sudo -u ubuntu git -C frontend/avry-user-dashboard fetch -q origin main
sudo -u ubuntu git -C frontend/avry-user-dashboard checkout -q --detach origin/main
echo "backend   -> $(sudo -u ubuntu git -C backend/avry-backend log --oneline -1)"
echo "dashboard -> $(sudo -u ubuntu git -C frontend/avry-user-dashboard log --oneline -1)"

# 3. build (log to file, up to 3 tries) + up
for svc in avry-backend avry-user-dashboard; do
  ok=0
  for try in 1 2 3; do
    log=$(mktemp /tmp/deploy-$svc-XXXX.log)
    if sudo docker compose -f "$C" build --progress=plain "$svc" > "$log" 2>&1; then ok=1; break; fi
    echo "build $svc failed (try $try), log: $log"; tail -15 "$log"
  done
  [ "$ok" = 1 ] || { echo "BUILD FAILED: $svc (running container untouched)"; exit 1; }
  sudo docker compose -f "$C" up -d --no-deps "$svc" 2>&1 | tail -2
done

# 4. verify + pin the new images
sleep 20
for svc in avry-backend avry-user-dashboard; do
  echo "$svc: $(sudo docker inspect -f '{{.State.Status}} restarts={{.RestartCount}}' "$svc")"
  repo=$(sudo docker inspect -f '{{.Config.Image}}' "$svc" | cut -d: -f1)
  sudo docker tag "$(sudo docker inspect -f '{{.Image}}' "$svc")" "$repo:current-$ts"
done
curl -s -o /dev/null -w "dashboard https://aivory.uk/dashboard/ : %{http_code}\n" https://aivory.uk/dashboard/ || true
curl -s -o /dev/null -w "backend   https://backend.aivory.id/health : %{http_code}\n" https://backend.aivory.id/health || true

# 5. Composio connection sync every minute (was 10): new connections reach agents sooner
sudo mkdir -p /etc/systemd/system/composio-connection-sync.timer.d
printf '[Timer]\nOnUnitActiveSec=\nOnUnitActiveSec=1min\nRandomizedDelaySec=5\n' \
  | sudo tee /etc/systemd/system/composio-connection-sync.timer.d/fast.conf >/dev/null
sudo systemctl daemon-reload
sudo systemctl restart composio-connection-sync.timer
systemctl list-timers --all | grep composio || true
echo "DONE ts=$ts  (rollback: retag <repo>:rollback-$ts to the compose image and 'up -d --no-deps <svc>')"
REMOTE
