#!/usr/bin/env bash
# Close four Docker-published ports that were reachable from the internet with no DROP rule:
#   3005 avry-mail-web   (Traefik: mail.aivory.uk)
#   3201 aivory-collab   (host 3201 -> container 3200; Traefik: /yjs)
#   8095 avry-mail API   (Traefik: mail.aivory.uk/v1/)
#   8086 avry-console    (Traefik: console.aivory.id)
# All four are already served through Traefik, so the direct host ports are unnecessary.
#
# Same pattern as the existing lockdown of 5432/5678/8081...: sources 172.16.0.0/12, 127.0.0.1 and
# 10.3.0.0/16 are RETURNed, everything else is DROPped. DOCKER-USER sees packets AFTER DNAT, so the
# collab rule matches the container port 3200, not the published 3201.
#
# Source of truth is /etc/iptables/docker-user-rules.v4, restored at boot by
# docker-user-firewall.service, so the change survives a reboot. No container is restarted.
#
#   ssh aivory-prod 'bash -s -- apply'    < scripts/docker-user-lockdown-4ports.sh
#   ssh aivory-prod 'bash -s -- rollback' < scripts/docker-user-lockdown-4ports.sh
set -euo pipefail

ACTION="${1:-}"
RULES=/etc/iptables/docker-user-rules.v4
RESTORE=/usr/local/sbin/docker-user-firewall.sh
BK_ROOT="$HOME/deploy-backups"
OBSERVE_SECONDS="${OBSERVE_SECONDS:-90}"
# "name:dport-seen-by-DOCKER-USER"
PORTS="3005 3200 8095 8086"

log() { printf '\n[%s] %s\n' "$(date +%H:%M:%S)" "$*"; }
latest_backup() { ls -1dt "$BK_ROOT"/docker-user-4ports-* 2>/dev/null | head -1; }
health() {
  local a b
  a="$(curl -s -m 8 -o /dev/null -w '%{http_code}' --resolve api.aivory.id:443:127.0.0.1 https://api.aivory.id/health)"
  b="$(curl -s -m 8 -o /dev/null -w '%{http_code}' --resolve mail.aivory.uk:443:127.0.0.1 https://mail.aivory.uk/health)"
  echo "api=$a mail=$b"; [ "$a" = 200 ] && [ "$b" = 200 ]
}

if [ "$ACTION" = rollback ]; then
  BK="$(latest_backup)"; [ -n "$BK" ] || { echo "no backup found"; exit 1; }
  log "rollback from $BK"
  sudo cp -p "$BK/docker-user-rules.v4" "$RULES"
  sudo "$RESTORE"
  sudo iptables -S DOCKER-USER | grep -c -E 'dport (3005|3200|8095|8086) -j DROP' | sed 's/^/remaining new DROP rules: /'
  health || echo "WARN: health check failed"
  exit 0
fi
[ "$ACTION" = apply ] || { echo "usage: bash -s -- apply|rollback"; exit 2; }

log "preflight"
sudo test -s "$RULES" && sudo test -x "$RESTORE" || { echo "rules file or restore script missing, abort"; exit 1; }
health || { echo "unhealthy before the change, abort"; exit 1; }
sudo docker ps --format '{{.Names}} {{.Ports}}' | grep -E ':(3005|3201|8095|8086)->' | sed 's/^/published: /'

log "observe $OBSERVE_SECONDS s: who connects to these ports from outside the private ranges? (counting only, nothing blocked)"
# iptables-nft allows only one -s per rule, so the private-range exemptions live in a temporary
# chain. External NEW connections fall through to a LOG rule and a bare counting rule.
cleanup_obs() {
  for p in $PORTS; do
    while sudo iptables -D DOCKER-USER -p tcp --dport "$p" -m conntrack --ctstate NEW -j AIVORY_OBS 2>/dev/null; do :; done
  done
  sudo iptables -F AIVORY_OBS 2>/dev/null || true
  sudo iptables -X AIVORY_OBS 2>/dev/null || true
}
trap cleanup_obs EXIT
cleanup_obs
sudo iptables -N AIVORY_OBS
for net in 172.16.0.0/12 127.0.0.1/32 10.3.0.0/16; do sudo iptables -A AIVORY_OBS -s "$net" -j RETURN; done
sudo iptables -A AIVORY_OBS -m limit --limit 30/min -j LOG --log-prefix "AIVORY-OBS "
sudo iptables -A AIVORY_OBS
for p in $PORTS; do
  sudo iptables -I DOCKER-USER 1 -p tcp --dport "$p" -m conntrack --ctstate NEW -j AIVORY_OBS
done
T0="$(date '+%Y-%m-%d %H:%M:%S')"
sleep "$OBSERVE_SECONDS"
# the bare counting rule is the last line of the chain; its first column is the packet count
EXT_PKTS="$(sudo iptables -vnxL AIVORY_OBS | tail -1 | awk '{print $1+0}')"
echo "  external NEW connections to the 4 ports: ${EXT_PKTS:-0}"
echo "  sources (port, source ip, count; logged sample, max 30/min):"
sudo journalctl -k --since "$T0" --no-pager 2>/dev/null | grep 'AIVORY-OBS' \
  | sed -E 's/.*SRC=([0-9a-fA-F.:]+).*DPT=([0-9]+).*/\2 \1/' | sort | uniq -c | sort -rn | head -10 | sed 's/^/    /' || true
cleanup_obs
trap - EXIT
if sudo iptables -S DOCKER-USER | grep -q 'AIVORY_OBS'; then echo "WARN: observation rules still present"; fi

TS="$(date +%Y%m%d-%H%M%S)"; BK="$BK_ROOT/docker-user-4ports-$TS"; mkdir -p "$BK"
log "backup -> $BK"
sudo cp -p "$RULES" "$BK/docker-user-rules.v4"

log "patch $RULES (new blocks go before the final RETURN)"
sudo python3 - "$RULES" $PORTS <<'PY'
import sys
path, ports = sys.argv[1], sys.argv[2:]
t = open(path).read()
last = "-A DOCKER-USER -j RETURN\n"
assert t.count(last) == 1, "final RETURN not found exactly once"
add = ""
for p in ports:
    if f"--dport {p} -j DROP" in t:
        continue
    add += (f"-A DOCKER-USER -s 172.16.0.0/12 -p tcp -m tcp --dport {p} -j RETURN\n"
            f"-A DOCKER-USER -s 127.0.0.1/32 -p tcp -m tcp --dport {p} -j RETURN\n"
            f"-A DOCKER-USER -s 10.3.0.0/16 -p tcp -m tcp --dport {p} -j RETURN\n"
            f"-A DOCKER-USER -p tcp -m tcp --dport {p} -j DROP\n")
if not add:
    print("already patched"); sys.exit(0)
open(path, "w").write(t.replace(last, add + last, 1))
print("patched:", " ".join(p for p in ports))
PY
sudo sed '/^:DOCKER-USER /a -F DOCKER-USER' "$RULES" | sudo iptables-restore --test --noflush \
  || { echo "rules file invalid, restoring"; sudo cp -p "$BK/docker-user-rules.v4" "$RULES"; exit 1; }

log "apply (atomic iptables-restore via the boot script)"
sudo "$RESTORE" || { echo "restore failed, putting the old rules back"; sudo cp -p "$BK/docker-user-rules.v4" "$RULES"; sudo "$RESTORE"; exit 1; }

log "verify"
for p in $PORTS; do
  printf 'port %-5s DROP rule present: ' "$p"; sudo iptables -S DOCKER-USER | grep -q -- "--dport $p -j DROP" && echo yes || echo NO
done
sudo iptables -S DOCKER-USER | grep -c 'aivory-geo' | sed 's/^/geo-block rules still present: /'
sudo iptables -S DOCKER-USER | grep -E -- '--dport (5432|5678|8081) -j DROP' | wc -l | sed 's/^/old lockdown rules (expect 3): /'
sleep 3
if health; then
  log "DONE. Backup: $BK"
else
  log "health check FAILED -> rolling back automatically"
  sudo cp -p "$BK/docker-user-rules.v4" "$RULES"; sudo "$RESTORE"; health || true; exit 1
fi
echo "Direct test from an outside network (phone hotspot): nc -vz -w 5 129.226.155.216 8095   -> should time out"
echo "Rollback: ssh aivory-prod 'bash -s -- rollback' < scripts/docker-user-lockdown-4ports.sh"
