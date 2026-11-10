// Extracts a compact catalog (node types, versions, resources/operations, param names) from a running n8n container.
// Usage (read-only):  ssh aivory-prod 'sudo docker exec -i -e N8N_VERSION=<ver> n8n node -' < evals/workflow-builder/extract-node-catalog.js > evals/workflow-builder/node-catalog.json
const fs = require('fs'), path = require('path')
const pnpm = '/usr/local/lib/node_modules/n8n/node_modules/.pnpm'
const pkgs = [
  { prefix: 'n8n-nodes-base.', dir: fs.readdirSync(pnpm).find(d => d.startsWith('n8n-nodes-base@')), pkg: 'n8n-nodes-base' },
  { prefix: '@n8n/n8n-nodes-langchain.', dir: fs.readdirSync(pnpm).find(d => d.startsWith('@n8n+n8n-nodes-langchain@')), pkg: '@n8n/n8n-nodes-langchain' },
]
const out = { n8nVersion: process.env.N8N_VERSION || '', nodes: {} }
for (const p of pkgs) {
  if (!p.dir) { console.error('missing', p.pkg); continue }
  const f = path.join(pnpm, p.dir, 'node_modules', p.pkg, 'dist/types/nodes.json')
  if (!fs.existsSync(f)) { console.error('no types', f); continue }
  for (const d of JSON.parse(fs.readFileSync(f, 'utf8'))) {
    const versions = (Array.isArray(d.version) ? d.version : [d.version]).map(Number)
    const props = d.properties || []
    const resourceProp = props.find(x => x.name === 'resource')
    const resources = resourceProp ? (resourceProp.options || []).map(o => o.value) : []
    const operations = {}
    for (const x of props) {
      if (x.name !== 'operation') continue
      const res = x.displayOptions && x.displayOptions.show && x.displayOptions.show.resource
      const ops = (x.options || []).map(o => o.value)
      if (res) res.forEach(r => { operations[r] = Array.from(new Set([...(operations[r] || []), ...ops])) })
      else operations['*'] = Array.from(new Set([...(operations['*'] || []), ...ops]))
    }
    const key = p.prefix + d.name
    const n = out.nodes[key] || (out.nodes[key] = { versions: [], group: d.group || [], byVersion: {} })
    n.versions = Array.from(new Set([...n.versions, ...versions])).sort((a, b) => a - b)
    const info = { creds: (d.credentials || []).map(c => c.name + (c.required ? '*' : '')), resources, operations, params: Array.from(new Set(props.map(x => x.name))) }
    for (const v of versions) n.byVersion[String(v)] = info
  }
}
process.stdout.write(JSON.stringify(out))
