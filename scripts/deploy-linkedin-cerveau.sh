#!/usr/bin/env bash
# Provision LinkedIn for Aivory agents: Composio auth config + MCP server, then wire it
# into Cerveau (:3100) for office_assistant + autonomous. Idempotent; backs up the config
# and rolls back automatically if Cerveau is unhealthy after restart.
# No tool is auto-approved: every LinkedIn tool (posting AND reading) asks for approval.
# Run from the Mac:  bash scripts/deploy-linkedin-cerveau.sh
set -euo pipefail

ssh aivory-prod 'bash -s' <<'REMOTE'
set -euo pipefail
CFG=/home/ubuntu/.zeroclaw-cerveau/config.toml
ts=$(date +%Y%m%d-%H%M%S)

# 0. Already wired? (idempotent)
if sudo grep -q 'name = "composio-linkedin-social"' "$CFG"; then
  echo "composio-linkedin-social already present in config; nothing to do"; exit 0
fi

# 1. Composio: auth config + MCP server (API key read on the VPS, never printed)
KEY=$(sudo docker exec avry-user-dashboard printenv COMPOSIO_API_KEY)
[ -n "$KEY" ] || { echo "COMPOSIO_API_KEY not found in avry-user-dashboard"; exit 1; }
export KEY
MCP_ID=$(python3 - <<'PY'
import json, os, sys, urllib.request, urllib.error
BASE = "https://backend.composio.dev/api/v3"
H = {"x-api-key": os.environ["KEY"], "Content-Type": "application/json"}
def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, headers=H,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        sys.stderr.write(f"{method} {path} -> HTTP {e.code}: {e.read()[:300]!r}\n")
        raise
# existing auth config for linkedin, else create Composio-managed one
ac = call("GET", "/auth_configs?toolkit_slug=linkedin&limit=20")
items = ac.get("items") or []
if items:
    ac_id = items[0]["id"]
else:
    ac_id = call("POST", "/auth_configs", {
        "toolkit": {"slug": "linkedin"},
        "auth_config": {"type": "use_composio_managed_auth"},
    })["auth_config"]["id"]
# reuse an existing server with our name, else create (empty allowed_tools = full set)
name = "aivory-linkedin"
srv = None
page = call("GET", "/mcp/servers?limit=100")
for s in page.get("items") or []:
    if s.get("name") == name:
        srv = s; break
if srv is None:
    srv = call("POST", "/mcp/servers", {"name": name, "auth_config_ids": [ac_id], "allowed_tools": []})
print(srv["id"])
PY
)
unset KEY
echo "composio mcp server id: $MCP_ID"

# 2. Cerveau config: backup, edit, validate
sudo cp -p "$CFG" "$CFG.bak-pre-linkedin-$ts"
sudo MCP_ID="$MCP_ID" CFG="$CFG" python3 - <<'PY'
import os, re
p = os.environ["CFG"]; mid = os.environ["MCP_ID"]
s = open(p).read()
block = f'''
[[mcp.servers]]
name = "composio-linkedin-social"
transport = "http"
url = "https://backend.composio.dev/v3/mcp/{mid}"
tenant_entity_query_param = "user_id"
requires_composio_toolkit = "linkedin"

[mcp.servers.headers]

[mcp_bundles.social-linkedin]
servers = ["composio-linkedin-social"]
'''
def add_bundle(text, section):
    m = re.search(r'(\[agent_type_mcp_bundles\.%s\]\s*\nbundles = \[)([^\]]*)(\])' % re.escape(section), text)
    if not m:
        raise SystemExit(f"section {section} not found")
    if "social-linkedin" in m.group(2):
        return text
    inner = m.group(2).rstrip()
    return text[:m.start(2)] + inner + ', "social-linkedin"' + text[m.end(2):]
for sec in ("office_assistant", "autonomous"):
    s = add_bundle(s, sec)
s = s.rstrip("\n") + "\n" + block
try:
    import tomllib
    tomllib.loads(s)
except ModuleNotFoundError:
    pass
open(p + ".new", "w").write(s)
PY
sudo chown --reference="$CFG" "$CFG.new"; sudo chmod --reference="$CFG" "$CFG.new"
sudo mv "$CFG.new" "$CFG"

# 3. Restart + health check, rollback on failure
sudo systemctl restart zeroclaw-cerveau
ok=0
for i in $(seq 1 30); do
  sleep 2
  curl -fsS -m 3 http://127.0.0.1:3100/health >/dev/null 2>&1 && { ok=1; break; }
done
if [ "$ok" = 1 ]; then
  echo "HEALTHY after $((i*2))s; NRestarts=$(systemctl show zeroclaw-cerveau -p NRestarts --value)"
  echo "backup: $CFG.bak-pre-linkedin-$ts"
else
  echo "UNHEALTHY -> rolling back config"
  sudo cp -p "$CFG.bak-pre-linkedin-$ts" "$CFG"
  sudo systemctl restart zeroclaw-cerveau; sleep 5; systemctl is-active zeroclaw-cerveau
  exit 1
fi
REMOTE
