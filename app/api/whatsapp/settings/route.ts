/**
 * Per-account WhatsApp settings: whether incoming messages get a reply (off by default), who writes it, and what happens
 * to it: "approval" (a draft a person sends) or "autonomous" (sent automatically, within guardrails).
 * The writer is the customer's own agent (Lex, Teo, ...). Aivory's own assistant only knows Aivory, so it is an
 * option for the Aivory-owned number alone.
 */
import { NextRequest, NextResponse } from 'next/server'
import { AGENT_ROSTER, AGENT_TYPE_IDS } from '@/lib/agentRoster'
import { ANY_MODULE, requirePaidPlan } from '@/lib/planGate'
import { getConnection } from '@/lib/whatsappConnection'
import { getDraftConfig, setDraftConfig } from '@/lib/whatsappDrafts'

export const runtime = 'nodejs'

const agents = AGENT_ROSTER.map((a) => ({ type: a.type, name: a.name, title: a.title }))

export async function GET(req: NextRequest) {
  const gate = await requirePaidPlan(req, ANY_MODULE)
  if (!gate.ok) return gate.response
  try {
    const assistantAvailable = (await getConnection(gate.user.user_id))?.mode === 'aivory'
    const c = await getDraftConfig(gate.user.user_id)
    // "On" only counts when someone can actually write the drafts.
    return NextResponse.json({ draft_replies: c.draftReplies && (!!c.agent || assistantAvailable), agent: c.agent, reply_mode: c.replyMode, agents, assistant_available: assistantAvailable })
  } catch (e) {
    console.error('[whatsapp settings get]', (e as Error).message)
    return NextResponse.json({ draft_replies: false, agent: null, reply_mode: 'approval', agents, assistant_available: false })
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requirePaidPlan(req, ANY_MODULE)
  if (!gate.ok) return gate.response
  const b = (await req.json().catch(() => ({}))) as { draft_replies?: unknown; agent?: unknown; reply_mode?: unknown }
  const hasOn = b.draft_replies !== undefined
  const hasAgent = b.agent !== undefined
  const hasMode = b.reply_mode !== undefined
  if (!hasOn && !hasAgent && !hasMode) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 })
  if (hasOn && typeof b.draft_replies !== 'boolean') return NextResponse.json({ error: 'draft_replies must be true or false.' }, { status: 400 })
  if (hasAgent && b.agent !== null && (typeof b.agent !== 'string' || !(AGENT_TYPE_IDS as readonly string[]).includes(b.agent))) {
    return NextResponse.json({ error: 'Unknown agent.' }, { status: 400 })
  }
  if (hasMode && b.reply_mode !== 'approval' && b.reply_mode !== 'autonomous') return NextResponse.json({ error: 'reply_mode must be approval or autonomous.' }, { status: 400 })
  try {
    const cur = await getDraftConfig(gate.user.user_id)
    const nextOn = hasOn ? (b.draft_replies as boolean) : cur.draftReplies
    const nextAgent = hasAgent ? (b.agent as string | null) : cur.agent
    if (nextOn && !nextAgent && (await getConnection(gate.user.user_id))?.mode !== 'aivory') {
      return NextResponse.json({ error: 'Choose which of your agents writes the drafts first.' }, { status: 400 })
    }
    const nextMode = hasMode ? (b.reply_mode as 'approval' | 'autonomous') : cur.replyMode
    await setDraftConfig(gate.user.user_id, { ...(hasOn ? { draftReplies: nextOn } : {}), ...(hasAgent ? { agent: nextAgent } : {}), ...(hasMode ? { replyMode: nextMode } : {}) })
    return NextResponse.json({ draft_replies: nextOn, agent: nextAgent, reply_mode: nextMode })
  } catch (e) {
    console.error('[whatsapp settings put]', (e as Error).message)
    return NextResponse.json({ error: 'Could not save the setting. Try again.' }, { status: 500 })
  }
}
