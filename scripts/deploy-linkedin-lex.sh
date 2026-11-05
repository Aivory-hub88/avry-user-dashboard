#!/usr/bin/env bash
# Grant the LinkedIn bundle (social-linkedin) to Lex (leads_qualifier) in Cerveau :3100.
# Idempotent; backs up config and rolls back automatically if Cerveau is unhealthy.
# Run from the Mac:  bash scripts/deploy-linkedin-lex.sh
set -euo pipefail

ssh aivory-prod 'bash -s' <<'REMOTE'
set -euo pipefail
CFG=/home/ubuntu/.zeroclaw-cerveau/config.toml
ts=$(date +%Y%m%d-%H%M%S)
sudo grep -q '^\[mcp_bundles.social-linkedin\]' "$CFG" || { echo "social-linkedin bundle missing: run deploy-linkedin-cerveau.sh first"; exit 1; }
sudo cp -p "$CFG" "$CFG.bak-pre-linkedin-lex-$ts"
sudo CFG="$CFG" python3 - <<'PY'
import os, re
p = os.environ["CFG"]
s = open(p).read()
m = re.search(r'(\[agent_type_mcp_bundles\.leads_qualifier\]\s*\nbundles = \[)([^\]]*)(\])', s)
if not m:
    raise SystemExit("leads_qualifier section not found")
if "social-linkedin" in m.group(2):
    print("already granted"); raise SystemExit(0)
s = s[:m.start(2)] + m.group(2).rstrip() + ', "social-linkedin"' + s[m.end(2):]
try:
    import tomllib; tomllib.loads(s)
except ModuleNotFoundError:
    pass
open(p + ".new", "w").write(s)
PY
if [ -f "$CFG.new" ]; then
  sudo chown --reference="$CFG" "$CFG.new"; sudo chmod --reference="$CFG" "$CFG.new"
  sudo mv "$CFG.new" "$CFG"
  sudo systemctl restart zeroclaw-cerveau
  ok=0
  for i in $(seq 1 30); do
    sleep 2
    curl -fsS -m 3 http://127.0.0.1:3100/health >/dev/null 2>&1 && { ok=1; break; }
  done
  if [ "$ok" = 1 ]; then
    echo "HEALTHY after $((i*2))s; NRestarts=$(systemctl show zeroclaw-cerveau -p NRestarts --value)"
    echo "backup: $CFG.bak-pre-linkedin-lex-$ts"
  else
    echo "UNHEALTHY -> rolling back config"
    sudo cp -p "$CFG.bak-pre-linkedin-lex-$ts" "$CFG"
    sudo systemctl restart zeroclaw-cerveau; sleep 5; systemctl is-active zeroclaw-cerveau
    exit 1
  fi
fi
REMOTE
