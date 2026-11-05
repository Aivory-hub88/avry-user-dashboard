#!/usr/bin/env bash
# Swap Traefik's CrowdSec forwardAuth bouncer (fbonalair/traefik-crowdsec-bouncer,
# ~35 ms per request, one extra HTTP hop) for the in-process Traefik plugin in
# stream mode (decisions cached in memory, refreshed every 15 s).
#
# Run from the Mac:
#   ssh aivory-prod 'bash -s -- apply'    < scripts/traefik-crowdsec-plugin.sh
#   ssh aivory-prod 'bash -s -- rollback' < scripts/traefik-crowdsec-plugin.sh
#
# What apply does (every edit is backed up first, nothing is deleted):
#   1. registers a new CrowdSec bouncer key -> traefik/secrets/crowdsec-lapi-key (600)
#   2. adds the plugin to the traefik service in docker-compose.prod.yml
#      (3 flags + 1 read-only volume) and recreates ONLY avry-traefik (~5 s blip on 80/443)
#   3. writes traefik/dynamic/crowdsec-plugin.yml (new middleware, not used yet)
#   4. swaps `crowdsec-bouncer` -> `crowdsec-plugin` inside the aivory-secure chain
#      (file provider hot-reloads, no restart)
#   5. measures latency + proves a ban is enforced; any failure restores the old chain
# The old crowdsec-bouncer container is left running as the fallback.
set -euo pipefail

ACTION="${1:-}"
ROOT=/home/ubuntu/AVRY-V2-Main
COMPOSE="$ROOT/docker-compose.prod.yml"
DYN="$ROOT/traefik/dynamic"
SECRETS="$ROOT/traefik/secrets"
CHAIN="$DYN/aivory-secure.yml"
PLUGIN_FILE="$DYN/crowdsec-plugin.yml"
PLUGIN_VERSION="v1.8.1"
BK_ROOT="$HOME/deploy-backups"
HEALTH_URL_HOST="api.aivory.id"

log() { printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
dc() { (cd "$ROOT" && sudo docker compose -f docker-compose.prod.yml "$@"); }

# Median of the 2nd request on a reused TLS connection (isolates middleware cost from the handshake).
warm_ms() {
  local out=() i
  for i in $(seq 1 15); do
    out+=("$(curl -s -o /dev/null -o /dev/null --resolve "$HEALTH_URL_HOST:443:127.0.0.1" \
      "https://$HEALTH_URL_HOST/health" "https://$HEALTH_URL_HOST/health" \
      -w '%{time_total}\n' | tail -1)")
  done
  printf '%s\n' "${out[@]}" | sort -n | sed -n '8p' | awk '{printf "%d", $1*1000}'
}
code_of() { curl -s -o /dev/null -w '%{http_code}' --resolve "$HEALTH_URL_HOST:443:127.0.0.1" "https://$HEALTH_URL_HOST/health"; }

restore_chain() { # $1 = backup dir
  sudo cp -p "$1/aivory-secure.yml" "$CHAIN"
  sudo rm -f "$PLUGIN_FILE"
}

latest_backup() { ls -1dt "$BK_ROOT"/traefik-plugin-* 2>/dev/null | head -1; }

if [ "$ACTION" = rollback ]; then
  BK="$(latest_backup)"; [ -n "$BK" ] || { echo "no backup found"; exit 1; }
  log "rollback from $BK"
  restore_chain "$BK"
  sudo cp -p "$BK/docker-compose.prod.yml" "$COMPOSE"
  dc up -d --no-deps traefik
  sleep 6
  echo "traefik: $(sudo docker inspect -f '{{.State.Status}}' avry-traefik)  health code: $(code_of)"
  echo "(bouncer key 'traefik-plugin-*' left registered in CrowdSec; remove with: sudo docker exec crowdsec cscli bouncers delete <name>)"
  exit 0
fi

[ "$ACTION" = apply ] || { echo "usage: bash -s -- apply|rollback"; exit 2; }
set +o history 2>/dev/null || true

TS="$(date +%Y%m%d-%H%M%S)"
BK="$BK_ROOT/traefik-plugin-$TS"
mkdir -p "$BK"

log "preflight"
sudo docker exec avry-traefik wget -qO- -T 5 http://crowdsec:8080/health >/dev/null \
  || { echo "avry-traefik cannot reach crowdsec:8080 - abort (network mismatch)"; exit 1; }
curl -s -m 10 -o /dev/null https://github.com/maxlerebourg/crowdsec-bouncer-traefik-plugin \
  || { echo "github unreachable from VPS - Traefik could not fetch the plugin, abort"; exit 1; }
BEFORE_MS="$(warm_ms)"; echo "baseline warm request via Traefik: ${BEFORE_MS} ms (code $(code_of))"
[ "$(code_of)" = 200 ] || { echo "baseline is not healthy, abort"; exit 1; }

log "backup -> $BK"
sudo cp -p "$COMPOSE" "$BK/docker-compose.prod.yml"
sudo cp -p "$CHAIN" "$BK/aivory-secure.yml"

log "register bouncer key (value never printed)"
sudo mkdir -p "$SECRETS"
if [ ! -s "$SECRETS/crowdsec-lapi-key" ]; then
  sudo docker exec crowdsec cscli bouncers add "traefik-plugin-$TS" -o raw | sudo tee "$SECRETS/crowdsec-lapi-key" >/dev/null
  sudo chmod 600 "$SECRETS/crowdsec-lapi-key"
fi
[ -s "$SECRETS/crowdsec-lapi-key" ] || { echo "key file empty, abort"; exit 1; }
sudo chmod 755 "$SECRETS"

log "patch docker-compose.prod.yml (traefik service only)"
sudo python3 - "$COMPOSE" "$PLUGIN_VERSION" <<'PY'
import sys, re
path, ver = sys.argv[1], sys.argv[2]
src = open(path).read()
m = re.search(r'^  traefik:\n(?:(?!^  \S).*\n?)*', src, re.M)
assert m, "traefik service not found"
blk = m.group(0)
if "experimental.plugins.crowdsec-bouncer" in blk:
    print("already patched"); sys.exit(0)
flags = (
    '      - "--experimental.plugins.crowdsec-bouncer.modulename=github.com/maxlerebourg/crowdsec-bouncer-traefik-plugin"\n'
    f'      - "--experimental.plugins.crowdsec-bouncer.version={ver}"\n'
)
vol = '      - /home/ubuntu/AVRY-V2-Main/traefik/secrets:/etc/traefik/secrets:ro\n'
assert '      - "--accesslog=true"\n' in blk and '/letsencrypt:/letsencrypt\n' in blk
new = blk.replace('      - "--accesslog=true"\n', '      - "--accesslog=true"\n' + flags, 1)
new = re.sub(r'(      - \S*/traefik/letsencrypt:/letsencrypt\n)', lambda m: m.group(1) + vol, new, count=1)
assert "experimental.plugins.crowdsec-bouncer.version" in new and "traefik/secrets" in new
open(path, "w").write(src.replace(blk, new, 1))
print("patched")
PY
dc config -q || { echo "compose invalid after patch, restoring"; sudo cp -p "$BK/docker-compose.prod.yml" "$COMPOSE"; exit 1; }

fail_static() {
  log "FAILED - restoring compose + recreating traefik"
  sudo cp -p "$BK/docker-compose.prod.yml" "$COMPOSE"; restore_chain "$BK"
  dc up -d --no-deps traefik; sleep 6
  echo "traefik: $(sudo docker inspect -f '{{.State.Status}}' avry-traefik) code: $(code_of)"; exit 1
}

log "recreate avry-traefik only (plugin download happens at start)"
dc up -d --no-deps traefik
for i in $(seq 1 30); do
  [ "$(sudo docker inspect -f '{{.State.Status}}' avry-traefik)" = running ] && [ "$(code_of)" = 200 ] && break
  sleep 2
done
[ "$(code_of)" = 200 ] || fail_static
if sudo docker logs --since 2m avry-traefik 2>&1 | grep -i -E 'plugin.*(error|fail)|unable to.*plugin'; then fail_static; fi

log "write plugin middleware (unused until the chain swap)"
sudo tee "$PLUGIN_FILE" >/dev/null <<EOF
http:
  middlewares:
    crowdsec-plugin:
      plugin:
        crowdsec-bouncer:
          enabled: true
          logLevel: ERROR
          crowdsecMode: stream
          crowdsecLapiScheme: http
          crowdsecLapiHost: crowdsec:8080
          crowdsecLapiKeyFile: /etc/traefik/secrets/crowdsec-lapi-key
          updateIntervalSeconds: 15
          defaultDecisionSeconds: 60
          httpTimeoutSeconds: 5
EOF
sudo chmod 644 "$PLUGIN_FILE"
sleep 3
if sudo docker logs --since 20s avry-traefik 2>&1 | grep -i -E 'crowdsec-plugin.*(error|fail)|plugin.*(error|fail)'; then
  echo "plugin middleware failed to load"; restore_chain "$BK"; exit 1
fi

log "swap chain: crowdsec-bouncer -> crowdsec-plugin"
sudo sed -i 's/- "crowdsec-bouncer"/- "crowdsec-plugin"/' "$CHAIN"
grep -q 'crowdsec-plugin' "$CHAIN" || { echo "sed did not apply"; restore_chain "$BK"; exit 1; }
sleep 4

log "verify"
CODE="$(code_of)"; AFTER_MS="$(warm_ms)"
echo "after: code=$CODE warm=${AFTER_MS} ms (before: ${BEFORE_MS} ms)"
if [ "$CODE" != 200 ] || [ "$AFTER_MS" -ge "$BEFORE_MS" ]; then
  echo "no improvement or unhealthy -> restoring chain (instant, hot reload)"; restore_chain "$BK"; sleep 3
  echo "restored: code=$(code_of)"; exit 1
fi

# Ban test: local curl reaches Traefik as 127.0.0.1 (or the docker gateway); ban only if it is loopback.
PEER="$(sudo docker logs --tail 5 avry-traefik 2>&1 | grep -E '^[0-9.]+ - ' | tail -1 | awk '{print $1}')"
if [ "$PEER" = 127.0.0.1 ]; then
  sudo docker exec crowdsec cscli decisions add --ip 127.0.0.1 --duration 2m --reason "traefik-plugin ban test" >/dev/null
  sleep 20
  BANNED="$(code_of)"
  sudo docker exec crowdsec cscli decisions delete --ip 127.0.0.1 >/dev/null
  echo "ban test: banned request got HTTP $BANNED (expect 403)"
  if [ "$BANNED" != 403 ]; then
    echo "ban NOT enforced -> restoring chain"; restore_chain "$BK"; exit 1
  fi
  sleep 20; echo "after unban: HTTP $(code_of) (expect 200)"
else
  echo "peer IP seen by Traefik is '$PEER', not loopback: skipping ban test (host-firewall bouncer still enforces at iptables)"
fi

log "DONE. warm request ${BEFORE_MS} ms -> ${AFTER_MS} ms. Backup: $BK"
echo "Rollback any time: ssh aivory-prod 'bash -s -- rollback' < scripts/traefik-crowdsec-plugin.sh"
echo "After a few days stable, retire the old container: cd /home/ubuntu/crowdsec && sudo docker compose stop crowdsec-traefik-bouncer"
