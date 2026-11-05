#!/usr/bin/env bash
# Close the two CrowdSec blind spots found on 2026-11-04:
#   1. HTTP: CrowdSec reads /var/log/traefik/access.log, but that file has been stale since
#      23 Jul (Traefik logs to stdout), so trap hits (/.env, /.aws/config, /wp-admin ...) never
#      became bans. -> Traefik now writes the access log to that file (+ logrotate).
#   2. SSH honeypot: cowrie (port 22) is not read by CrowdSec at all. -> cowrie.json is acquired
#      with a small local JSON parser that maps login attempts to `ssh_failed-auth`, so the stock
#      ssh-bf / ssh-slow-bf scenarios ban the attacker at the host firewall.
#
# Safety: Cloudflare ranges are whitelisted at parser level (plus the hub's cdn-whitelist
# postoverflow already enabled), because Traefik still logs the Cloudflare edge IP as client
# for proxied domains - without this a trap hit could get an edge IP banned.
# Note: Traefik no longer prints the access log to `docker logs`; read the file instead.
# Side effect: banned cowrie visitors stop reaching the honeypot (they are dropped by iptables).
#
#   ssh aivory-prod 'bash -s -- apply'    < scripts/crowdsec-feed-traefik-cowrie.sh
#   ssh aivory-prod 'bash -s -- rollback' < scripts/crowdsec-feed-traefik-cowrie.sh
set -euo pipefail

ACTION="${1:-}"
ROOT=/home/ubuntu/AVRY-V2-Main
TRAEFIK_COMPOSE="$ROOT/docker-compose.prod.yml"
CS_DIR=/home/ubuntu/crowdsec
CS_COMPOSE="$CS_DIR/docker-compose.yml"
TLOGS="$ROOT/traefik/logs"
COWRIE_LOGS=/var/lib/docker/volumes/cowrie_cowrie-var/_data/log/cowrie
BK_ROOT="$HOME/deploy-backups"
CS_FILES="parsers/s01-parse/aivory-cowrie-json.yaml parsers/s02-enrich/aivory-cloudflare-whitelist.yaml acquis.d/cowrie.yaml"

log() { printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
tdc() { (cd "$ROOT" && sudo docker compose -f docker-compose.prod.yml "$@"); }
cdc() { (cd "$CS_DIR" && sudo docker compose "$@"); }
cs() { sudo docker exec crowdsec "$@"; }
latest_backup() { ls -1dt "$BK_ROOT"/crowdsec-feed-* 2>/dev/null | head -1; }
traefik_up() { [ "$(sudo docker inspect -f '{{.State.Status}}' avry-traefik)" = running ] \
  && [ "$(curl -s -o /dev/null -w '%{http_code}' --resolve api.aivory.id:443:127.0.0.1 https://api.aivory.id/health)" = 200 ]; }
cs_up() { [ "$(sudo docker inspect -f '{{.State.Status}}' crowdsec)" = running ] && cs cscli lapi status >/dev/null 2>&1; }
wait_for() { local n=$1; shift; for _ in $(seq 1 "$n"); do "$@" && return 0; sleep 2; done; return 1; }

remove_cs_files() { for f in $CS_FILES; do cs rm -f "/etc/crowdsec/$f" || true; done; }

if [ "$ACTION" = rollback ]; then
  BK="$(latest_backup)"; [ -n "$BK" ] || { echo "no backup found"; exit 1; }
  log "rollback from $BK"
  sudo cp -p "$BK/traefik.docker-compose.prod.yml" "$TRAEFIK_COMPOSE"
  sudo cp -p "$BK/crowdsec.docker-compose.yml" "$CS_COMPOSE"
  remove_cs_files
  sudo rm -f /etc/logrotate.d/traefik-access
  cdc up -d --no-deps crowdsec
  tdc up -d --no-deps traefik
  wait_for 30 traefik_up && echo "traefik healthy" || echo "traefik NOT healthy - check: sudo docker logs avry-traefik"
  wait_for 30 cs_up && echo "crowdsec healthy" || echo "crowdsec NOT healthy"
  exit 0
fi
[ "$ACTION" = apply ] || { echo "usage: bash -s -- apply|rollback"; exit 2; }

log "preflight"
traefik_up || { echo "traefik not healthy before the change, abort"; exit 1; }
cs_up || { echo "crowdsec not healthy before the change, abort"; exit 1; }
sudo test -s "$COWRIE_LOGS/cowrie.json" || { echo "cowrie.json not found at $COWRIE_LOGS, abort"; exit 1; }
[ "$(df --output=avail -BG / | tail -1 | tr -dc 0-9)" -ge 10 ] || { echo "less than 10G free, abort"; exit 1; }

TS="$(date +%Y%m%d-%H%M%S)"; BK="$BK_ROOT/crowdsec-feed-$TS"; mkdir -p "$BK"
log "backup -> $BK"
sudo cp -p "$TRAEFIK_COMPOSE" "$BK/traefik.docker-compose.prod.yml"
sudo cp -p "$CS_COMPOSE" "$BK/crowdsec.docker-compose.yml"

log "write CrowdSec config (inside the crowdsec-config volume)"
cs mkdir -p /etc/crowdsec/acquis.d /etc/crowdsec/parsers/s01-parse /etc/crowdsec/parsers/s02-enrich

sudo docker exec -i crowdsec sh -c 'cat > /etc/crowdsec/parsers/s01-parse/aivory-cowrie-json.yaml' <<'EOF'
onsuccess: next_stage
name: aivory/cowrie-json
description: "Cowrie honeypot JSON log -> ssh auth events for the stock ssh-bf scenarios"
filter: "evt.Line.Labels.type == 'cowrie-json'"
statics:
  - parsed: eventid
    expression: JsonExtract(evt.Line.Raw, "eventid")
  - target: evt.StrTime
    expression: JsonExtract(evt.Line.Raw, "timestamp")
  - meta: source_ip
    expression: JsonExtract(evt.Line.Raw, "src_ip")
  - meta: target_user
    expression: JsonExtract(evt.Line.Raw, "username")
  - meta: service
    value: ssh
  - meta: log_type
    expression: "evt.Parsed.eventid in ['cowrie.login.failed', 'cowrie.login.success'] ? 'ssh_failed-auth' : 'cowrie_other'"
EOF

# Cloudflare edge ranges: live list, falling back to the list known on 2026-11-04.
CF_V4="$(curl -s -m 8 https://www.cloudflare.com/ips-v4 || true)"
CF_V6="$(curl -s -m 8 https://www.cloudflare.com/ips-v6 || true)"
if ! echo "$CF_V4" | grep -q '^173.245.48.0/20'; then
  CF_V4="173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13 104.24.0.0/14 172.64.0.0/13 131.0.72.0/22"
  CF_V6="2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32"
fi
{
  echo 'name: aivory/cloudflare-whitelist'
  echo 'description: "Cloudflare edge IPs are the client IP Traefik logs for proxied domains; never ban them"'
  echo 'whitelist:'
  echo '  reason: "cloudflare edge"'
  echo '  cidr:'
  for c in $CF_V4 $CF_V6; do echo "    - \"$c\""; done
} | sudo docker exec -i crowdsec sh -c 'cat > /etc/crowdsec/parsers/s02-enrich/aivory-cloudflare-whitelist.yaml'

sudo docker exec -i crowdsec sh -c 'cat > /etc/crowdsec/acquis.d/cowrie.yaml' <<'EOF'
filenames:
  - /var/log/cowrie/cowrie.json
labels:
  type: cowrie-json
EOF

log "dry-run the parsers with cscli explain (nothing is live yet)"
SAMPLE="$(sudo grep -m1 '"eventid":"cowrie.login.failed"' "$COWRIE_LOGS/cowrie.json")"
EXPL="$(cs cscli explain --log "$SAMPLE" --type cowrie-json 2>&1 || true)"
echo "$EXPL" | head -25
# explain prints the pipeline tree, not meta values: success = our parser ran AND the stock
# ssh-bf scenario would consume the event (its filter needs log_type == ssh_failed-auth).
if ! echo "$EXPL" | grep -q 'aivory/cowrie-json' || ! echo "$EXPL" | grep -q 'parser success' \
   || ! echo "$EXPL" | grep -q 'crowdsecurity/ssh-bf'; then
  echo "cowrie sample did not reach the ssh-bf scenarios - removing config, nothing changed"; remove_cs_files; exit 1
fi
CFLINE='162.158.88.105 - - [03/Nov/2026:16:05:14 +0000] "GET /.env HTTP/2.0" 404 19 "-" "-" 1 "websecure-main-app@docker" "http://172.18.0.9:3000" 5ms'
cs cscli explain --log "$CFLINE" --type traefik 2>&1 | head -20 | sed 's/^/  /'

log "patch crowdsec compose: mount the cowrie log dir read-only"
sudo python3 - "$CS_COMPOSE" "$COWRIE_LOGS" <<'PY'
import sys
path, src = sys.argv[1], sys.argv[2]
t = open(path).read()
line = f"      - {src}:/var/log/cowrie:ro\n"
if line in t:
    print("already patched"); sys.exit(0)
anchor = "      - /var/log:/var/log/host:ro\n"
assert t.count(anchor) == 1, "anchor not found exactly once"
open(path, "w").write(t.replace(anchor, anchor + line, 1))
print("patched")
PY
cdc config -q || { echo "crowdsec compose invalid, restoring"; sudo cp -p "$BK/crowdsec.docker-compose.yml" "$CS_COMPOSE"; remove_cs_files; exit 1; }

log "recreate crowdsec only (bouncers keep their cache during the ~10 s LAPI gap)"
cdc up -d --no-deps crowdsec
wait_for 40 cs_up || { echo "crowdsec did not come back"; echo "run: bash -s -- rollback"; exit 1; }

log "move the stale Traefik access.log aside"
if sudo test -s "$TLOGS/access.log"; then
  sudo mv "$TLOGS/access.log" "$TLOGS/access.log.stale-20260723"
  sudo gzip -f "$TLOGS/access.log.stale-20260723"
fi

log "patch traefik compose: access log to file + mount"
sudo python3 - "$TRAEFIK_COMPOSE" "$TLOGS" <<'PY'
import sys, re
path, logs = sys.argv[1], sys.argv[2]
src = open(path).read()
m = re.search(r'^  traefik:\n(?:(?!^  \S).*\n?)*', src, re.M)
assert m, "traefik service not found"
blk = m.group(0)
if "--accesslog.filepath=" in blk:
    print("already patched"); sys.exit(0)
flag_anchor = '      - "--accesslog=true"\n'
vol = f"      - {logs}:/var/log/traefik\n"
vol_anchor = "      - /home/ubuntu/AVRY-V2-Main/traefik/secrets:/etc/traefik/secrets:ro\n"
assert flag_anchor in blk and vol_anchor in blk
new = blk.replace(flag_anchor, flag_anchor + '      - "--accesslog.filepath=/var/log/traefik/access.log"\n', 1)
new = new.replace(vol_anchor, vol_anchor + vol, 1)
open(path, "w").write(src.replace(blk, new, 1))
print("patched")
PY
tdc config -q || { echo "traefik compose invalid, restoring"; sudo cp -p "$BK/traefik.docker-compose.prod.yml" "$TRAEFIK_COMPOSE"; exit 1; }

log "recreate avry-traefik only (80/443 blip ~5 s)"
tdc up -d --no-deps traefik
wait_for 30 traefik_up || {
  echo "traefik did not come back -> restoring its compose"
  sudo cp -p "$BK/traefik.docker-compose.prod.yml" "$TRAEFIK_COMPOSE"; tdc up -d --no-deps traefik; exit 1; }

log "logrotate for the new file"
sudo tee /etc/logrotate.d/traefik-access >/dev/null <<EOF
$TLOGS/access.log {
    daily
    maxsize 200M
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF
sudo logrotate -d /etc/logrotate.d/traefik-access >/dev/null 2>&1 && echo "logrotate config ok" || echo "WARN: logrotate dry-run failed"

log "verify (waits up to ~4 min for live traffic)"
OK_T=0; OK_C=0
for _ in $(seq 1 24); do
  M="$(cs cscli metrics show acquisition 2>/dev/null || true)"
  echo "$M" | grep -E 'traefik/access.log' | grep -qv '^| *file:[^|]*| *0 ' && OK_T=1
  echo "$M" | grep -E 'cowrie.json' | grep -qv '^| *file:[^|]*| *0 ' && OK_C=1
  [ $OK_T = 1 ] && [ $OK_C = 1 ] && break
  sleep 10
done
cs cscli metrics show acquisition 2>/dev/null | head -14
echo "traefik log read: $OK_T   cowrie log read: $OK_C"
echo "--- newest alerts (expect ssh-bf from cowrie IPs soon; no Cloudflare IPs)"
cs cscli alerts list --since 15m 2>&1 | cut -c1-170 | head -12
CFB="$(cs cscli decisions list -o raw 2>/dev/null | grep -E ',(162\.158|172\.(6[4-9]|7[0-1])|104\.(1[6-9]|2[0-7]))\.' | head -3 || true)"
[ -z "$CFB" ] && echo "no Cloudflare IP in decisions: OK" || { echo "WARNING Cloudflare IP in decisions: $CFB"; }

if [ $OK_T = 1 ] && [ $OK_C = 1 ]; then
  log "DONE. Backup: $BK"
else
  log "PARTIAL: a log source shows no lines yet (low traffic?). Re-check in a few minutes: sudo docker exec crowdsec cscli metrics show acquisition"
fi
echo "Undo any time: ssh aivory-prod 'bash -s -- rollback' < scripts/crowdsec-feed-traefik-cowrie.sh"
echo "Unban a wrongly banned IP: sudo docker exec crowdsec cscli decisions delete --ip <ip>"
