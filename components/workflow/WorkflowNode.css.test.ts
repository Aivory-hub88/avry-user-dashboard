import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Regression guard for "dragging from a connection point moves the node instead
// of connecting". The decorative .connectorDot* divs sit exactly on top of the
// real (transparent) React Flow <Handle>; if they take pointer events the
// mousedown never reaches the Handle. Verified in a real browser hit-test:
// elementFromPoint at the handle centre returned connectorDotRight / upperBar.
const css = readFileSync(join(__dirname, 'WorkflowNode.module.css'), 'utf8')

function rule(selectorStart: string): string {
  const i = css.indexOf(selectorStart)
  expect(i).toBeGreaterThanOrEqual(0)
  return css.slice(i, css.indexOf('}', i))
}

describe('WorkflowNode handle hit-testing', () => {
  it('decorative connector dots never intercept pointer events', () => {
    expect(rule('.connectorDotLeft,\n.connectorDotRight {')).toMatch(/pointer-events:\s*none/)
  })
  it('real handles stack above the node body and dots', () => {
    expect(rule('.handle {')).toMatch(/z-index:\s*5\s*!important/)
    expect(rule('.branchHandle {')).toMatch(/z-index:\s*5\s*!important/)
  })
})
