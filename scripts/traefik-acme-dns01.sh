#!/usr/bin/env bash
# Move Traefik's Let's Encrypt resolver `letsencrypt` from HTTP-01 to DNS-01 (Cloudflare).
#
# Why: aivory.uk / aivory.id / dashboard / app / admin sit behind Cloudflare, which 301s
# plain-HTTP /.well-known/acme-challenge/* to HTTPS (and aivory.id -> aivory.uk) before it
# reaches Traefik's port-80 handler. Result: certs expired 21 Sep - 7 Oct 2026 and no renewal.
# DNS-01 only needs a TXT record in the zone, so redirects/proxy no longer matter.
#
# The resolver keeps its name (`letsencrypt`) so every router label and the existing
# acme.json keep working. Zones: aivory.id, aivory.uk, collectiva.pro (all on Cloudflare).
#
# Prerequisite: Cloudflare API token (Zone:Zone:Read + Zone:DNS:Edit on those 3 zones) stored at
#   /home/ubuntu/AVRY-V2-Main/traefik/secrets/cf-dns-token   (root, mode 600; never printed here)
#
#   ssh aivory-prod 'bash -s -- apply'    < scripts/traefik-acme-dns01.sh
#   ssh aivory-prod 'bash -s -- rollback' < scripts/traefik-acme-dns01.sh
set -euo pipefail

ACTION="${1:-}"
ROOT=/home/ubuntu/AVRY-V2-Main
COMPOSE="$ROOT/docker-compose.prod.yml"
ACME="$ROOT/traefik/letsencrypt/acme.json"
TOKEN_FILE="$ROOT/traefik/secrets/cf-dns-token"
BK_ROOT="$HOME/deploy-backups"
WANT_SNIS="aivory.uk aivory.id dashboard.aivory.id admin.aivory.id"

log() { printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
dc() { (cd "$ROOT" && sudo docker compose -f docker-compose.prod.yml "$@"); }
latest_backup() { ls -1dt "$BK_ROOT"/traefik-dns01-* 2>/dev/null | head -1; }
end_epoch() { # $1 = SNI -> notAfter epoch served by the origin
  echo | openssl s_client -connect 127.0.0.1:443 -servername "$1" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 | xargs -I{} date -d "{}" +%s 2>/dev/null || echo 0
}
traefik_up() { [ "$(sudo docker inspect -f '{{.State.Status}}' avry-traefik)" = running ] \
  && [ "$(curl -s -o /dev/null -w '%{http_code}' --resolve api.aivory.id:443:127.0.0.1 https://api.aivory.id/health)" = 200 ]; }

if [ "$ACTION" = rollback ]; then
  BK="$(latest_backup)"; [ -n "$BK" ] || { echo "no backup found"; exit 1; }
  log "rollback from $BK (compose only; acme.json restored too)"
  sudo cp -p "$BK/docker-compose.prod.yml" "$COMPOSE"
  sudo cp -p "$BK/acme.json" "$ACME"
  dc up -d --no-deps traefik
  sleep 8; traefik_up && echo "traefik healthy" || echo "traefik NOT healthy - check: sudo docker logs avry-traefik"
  exit 0
fi
[ "$ACTION" = apply ] || { echo "usage: bash -s -- apply|rollback"; exit 2; }

log "preflight"
[ -s "$TOKEN_FILE" ] || { echo "missing $TOKEN_FILE - store the Cloudflare token first (see header)"; exit 1; }
traefik_up || { echo "traefik is not healthy before the change, abort"; exit 1; }
TOKEN="$(sudo cat "$TOKEN_FILE")"
VERIFY="$(curl -s -m 15 -H "Authorization: Bearer $TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify \
  | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("result",{}).get("status","invalid"))')"
echo "token status: $VERIFY"
[ "$VERIFY" = active ] || { echo "token is not active, abort"; exit 1; }
for z in aivory.id aivory.uk collectiva.pro; do
  N="$(curl -s -m 15 -H "Authorization: Bearer $TOKEN" "https://api.cloudflare.com/client/v4/zones?name=$z" \
    | python3 -c 'import sys,json;print(len(json.load(sys.stdin).get("result",[])))')"
  echo "zone $z visible to token: $N"
  [ "$N" = 1 ] || { echo "token cannot see zone $z - add it to the token's Zone Resources, abort"; exit 1; }
done
unset TOKEN

TS="$(date +%Y%m%d-%H%M%S)"; BK="$BK_ROOT/traefik-dns01-$TS"; mkdir -p "$BK"
log "backup -> $BK"
sudo cp -p "$COMPOSE" "$BK/docker-compose.prod.yml"
sudo cp -p "$ACME" "$BK/acme.json"
for s in $WANT_SNIS; do echo "$s before: $(date -d @"$(end_epoch "$s")" +%F 2>/dev/null)"; done

log "patch docker-compose.prod.yml (traefik service only)"
sudo python3 - "$COMPOSE" <<'PY'
import sys, re
path = sys.argv[1]
src = open(path).read()
m = re.search(r'^  traefik:\n(?:(?!^  \S).*\n?)*', src, re.M)
assert m, "traefik service not found"
blk = m.group(0)
if "acme.dnschallenge=true" in blk:
    print("already patched"); sys.exit(0)
http = ['      - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"\n',
        '      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"\n']
assert all(h in blk for h in http), "httpchallenge flags not found as expected"
dns = ('      - "--certificatesresolvers.letsencrypt.acme.dnschallenge=true"\n'
       '      - "--certificatesresolvers.letsencrypt.acme.dnschallenge.provider=cloudflare"\n'
       '      - "--certificatesresolvers.letsencrypt.acme.dnschallenge.resolvers=1.1.1.1:53,8.8.8.8:53"\n')
new = blk.replace(http[0], dns, 1).replace(http[1], "", 1)
assert "\n    environment:" not in new, "traefik already has an environment block"
new = new.replace("\n    command:\n",
    "\n    environment:\n      - CF_DNS_API_TOKEN_FILE=/etc/traefik/secrets/cf-dns-token\n    command:\n", 1)
assert "httpchallenge" not in new and "CF_DNS_API_TOKEN_FILE" in new and "traefik/secrets:/etc/traefik/secrets" in new
open(path, "w").write(src.replace(blk, new, 1))
print("patched")
PY
dc config -q || { echo "compose invalid, restoring"; sudo cp -p "$BK/docker-compose.prod.yml" "$COMPOSE"; exit 1; }

log "recreate avry-traefik (80/443 blip ~5 s); certs expiring <30 d are renewed at start"
dc up -d --no-deps traefik
for i in $(seq 1 30); do traefik_up && break; sleep 2; done
traefik_up || { echo "traefik did not come back -> restoring compose"; sudo cp -p "$BK/docker-compose.prod.yml" "$COMPOSE"; dc up -d --no-deps traefik; exit 1; }

log "waiting for renewals (up to 5 min)"
NOW=$(date +%s); DONE=0
for i in $(seq 1 30); do
  DONE=0
  for s in $WANT_SNIS; do [ "$(end_epoch "$s")" -gt $((NOW + 60*86400)) ] && DONE=$((DONE+1)); done
  [ "$DONE" -eq 4 ] && break
  sleep 10
done
for s in $WANT_SNIS; do echo "$s now expires: $(date -d @"$(end_epoch "$s")" +%F)"; done
sudo docker logs --since 6m avry-traefik 2>&1 | grep -i -E "level=error" | grep -i -v "stag.aivory.id" | cut -c1-300 | tail -8 || true

if [ "$DONE" -eq 4 ]; then
  log "DONE: all 4 certificates renewed via DNS-01. Backup: $BK"
else
  log "PARTIAL: $DONE/4 renewed. Traefik is healthy; see errors above. Rollback: bash -s -- rollback"
  exit 1
fi
