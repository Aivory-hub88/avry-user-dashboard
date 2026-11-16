/**
 * Test helper: answers the room-roster queries (lib/workspaceRoomPeople) in a
 * mocked `query`, so route tests that assign people see a room whose members
 * and invited agents are the ones those tests use. Returns null for any other SQL.
 */
export const TEST_ROSTER_USERS = ['u-1', 'u-2', 'u-3', 'u-9', 'u-a', 'u-o', 'u-f', 'u-b', 'u-z', 'u-own', 'u-cre', 'u-old', 'u-c', 'a', 'b']
export const TEST_ROSTER_AGENTS = ['autonomous', 'leads_qualifier']

export function rosterResult(sql: string): { rows: Record<string, unknown>[] } | null {
  if (sql.includes('SELECT owner, workspace_id')) return { rows: [{ owner: 'u-1', workspace_id: 'default' }] }
  if (sql.includes('SELECT user_id FROM dashboard.workspace_doc_acl')) return { rows: TEST_ROSTER_USERS.map((user_id) => ({ user_id })) }
  if (sql.includes('SELECT agent_type FROM dashboard.workspace_agent_acl')) return { rows: TEST_ROSTER_AGENTS.map((agent_type) => ({ agent_type })) }
  return null
}
