/**
 * Deleting a workflow must remove every local copy of it — otherwise the list
 * merge (server list + localStorage) shows the leftover copy again and the
 * workflow "respawns".
 */
import { describe, it, expect } from 'vitest'
import { isLocalCopyOf } from './useWorkflows'

describe('isLocalCopyOf', () => {
  it('matches the id itself and saveWorkflow() "-vN" duplicates', () => {
    expect(isLocalCopyOf('workflow_1', 'workflow_1')).toBe(true)
    expect(isLocalCopyOf('workflow_1', 'workflow_1-v2')).toBe(true)
    expect(isLocalCopyOf('workflow_1', 'workflow_1-v13')).toBe(true)
  })

  it('keeps named saved versions and unrelated workflows', () => {
    expect(isLocalCopyOf('workflow_1', 'workflow_1-before-launch')).toBe(false)
    expect(isLocalCopyOf('workflow_1', 'workflow_1-v2-final')).toBe(false)
    expect(isLocalCopyOf('workflow_1', 'workflow_10')).toBe(false)
    expect(isLocalCopyOf('workflow_1', 'workflow_10-v2')).toBe(false)
  })

  it('does not treat a different uuid as a copy', () => {
    expect(isLocalCopyOf('eca08ba4-616b-43a7-8b29-b24794e0d473', '16e1889d-7f0d-43d8-a0a2-5482b88f758d')).toBe(false)
  })
})
