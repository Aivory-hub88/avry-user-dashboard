/**
 * One typed union over the three things the office rail can tell you about
 * — a decision that needs you (`approval`), a reply you haven't seen yet
 * because you were looking at a different thread (`activity`), or a
 * standing condition worth flagging (`status`). See
 * docs/CERVEAU-WORKING-OFFICE-PLANNING.md, Phase 10.
 *
 * Not a new data source: `approval` wraps the existing PendingApproval,
 * `activity` is derived client-side from session timestamps already held
 * by useChat, and `status` covers cases the rail already rendered ad hoc
 * (not deployed, approvals failed to load). This type just gives the three
 * a shared shape so they can live in one feed instead of three unrelated
 * pieces of state.
 */
import type { PendingApproval } from '@/lib/agentApprovals'

export type Notification =
  | { id: string; kind: 'approval'; agentType: string; approval: PendingApproval }
  | { id: string; kind: 'activity'; agentType: string; sessionId: string; title: string; updatedAt: number }
  /** ADR-009 Phase 3: a standing condition, not an event — today only a
   *  scheduled run Cerveau has reported as `failed`. Unlike the other two
   *  this does not clear by being read; it clears when the underlying
   *  condition does, which is why it carries no timestamp. */
  | { id: string; kind: 'status'; agentType: string; title: string; detail: string | null }
