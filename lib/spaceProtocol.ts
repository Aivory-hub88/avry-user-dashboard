/**
 * Team Space protocol (mini `spaces-protocol`) — Phase 0 fondasi.
 *
 * Keputusan terkunci (SCOPE §7, 2026-09-17):
 * - Produk = Team Space. Mention per-agent langsung
 *   (@Lex/@Geno/@Finn/@Aira/@Teo/@Ofira); Cerveau = nama engine, bukan alamat.
 * - Thread = Postgres-first (bukan Yjs). Yjs khusus isi doc.
 *
 * Isi file ini:
 * 1. zod schemas: Attribution, MentionStamps, SpaceMessage, SpaceTopic,
 *    ProposalResult (applied/merged/conflict — pola Harbor changeset).
 * 2. Pure mention parser: token link grammar, stamp server-side,
 *    code region = kutipan, bare @word = prose (nol stamp),
 *    label TIDAK PERNAH di-parse (hanya id yang divalidasi).
 *
 * Token grammar (TRD §5):
 * - Manusia : `[@Nama](#member:<user_id>)`
 * - Agent   : `[@Lex](#agent:leads_qualifier)` (id = agent_type, label = first name)
 * - Broadcast: `[@here](#here)`
 * - Referensi doc: `[#Judul](#doc:<id>)` — buka doc, notify NOL.
 */

import { z } from "zod";
import { AGENT_ROSTER, isAgentType } from "@/lib/agentRoster";

// ── 1. Attribution ────────────────────────────────────────────────────
// Agent = member (attribution = cara, bukan siapa). Tidak ada akun bot
// terpisah (SCOPE §5.2): agent bertindak *sebagai* member.

export const ActingModeSchema = z.enum(["user", "agent", "system"]);
export type ActingMode = z.infer<typeof ActingModeSchema>;

export const AttributionSchema = z.object({
  /** user_id / member id — siapa yang tercatat sebagai penulis. */
  memberId: z.string().min(1),
  /** Cara bertindak: user mengetik sendiri vs agent bertindak sebagai member. */
  actingMode: ActingModeSchema,
  /** First name agent (mis. "Geno") — wajib bila actingMode = agent. */
  agentName: z.string().min(1).optional(),
  /** agent_type roster (mis. "autonomous") — wajib bila actingMode = agent. */
  agentType: z.string().min(1).optional(),
}).refine(
  (a) => a.actingMode !== "agent" || (!!a.agentName && !!a.agentType),
  { message: "agent attribution requires agentName + agentType" },
);
export type Attribution = z.infer<typeof AttributionSchema>;

// ── 2. MentionStamps ──────────────────────────────────────────────────
// Hasil stamp server-side. Konsumen (unread/activity/push/picker) hanya
// baca stamp ini — tidak pernah re-parse body.

export const MentionStampsSchema = z.object({
  /** agent_type yang di-stamp, urutan kemunculan pertama, deduped. */
  agentTypes: z.array(z.string().min(1)),
  /** user_id manusia yang di-stamp, urutan kemunculan, deduped. */
  memberIds: z.array(z.string().min(1)),
  /** True bila ada token [@here](#here) yang valid di luar code region. */
  here: z.boolean(),
  /** doc id referensi [#..](#doc:id) — notify NOL, hanya untuk buka doc. */
  docRefs: z.array(z.string().min(1)),
  /** True bila agentTypes tidak kosong (kolom `cerval` di TRD = flag ini). */
  hasAgent: z.boolean(),
}).refine(
  (s) => s.hasAgent === (s.agentTypes.length > 0),
  { message: "hasAgent must equal (agentTypes.length > 0)" },
);
export type MentionStamps = z.infer<typeof MentionStampsSchema>;

export const EMPTY_STAMPS: MentionStamps = {
  agentTypes: [],
  memberIds: [],
  here: false,
  docRefs: [],
  hasAgent: false,
};

// ── 3. SpaceMessage / SpaceTopic ──────────────────────────────────────
// Flat: reply selalu menempel ke root id (tidak ada reply-of-reply).

export const SpaceMessageSchema = z.object({
  id: z.string().min(1),
  spaceId: z.string().min(1),
  /** null = root message; string = reply ke root itu. */
  threadRoot: z.string().min(1).nullable(),
  author: AttributionSchema,
  body: z.string(),
  stamps: MentionStampsSchema,
  createdAt: z.string().min(1),
  editedAt: z.string().min(1).nullable().optional(),
  /** Soft-delete tombstone: author-only, body → ''. */
  deletedAt: z.string().min(1).nullable().optional(),
});
export type SpaceMessage = z.infer<typeof SpaceMessageSchema>;

export const SpaceTopicSchema = z.object({
  id: z.string().min(1),
  /** Root message yang diberi judul goal. Max 1 topic per thread. */
  threadRoot: z.string().min(1),
  title: z.string().min(1),
  archived: z.boolean(),
  /** attach_doc: doc id existing, dibuka di samping thread. */
  docId: z.string().min(1).nullable(),
  createdBy: z.string().min(1),
  createdAt: z.string().min(1),
});
export type SpaceTopic = z.infer<typeof SpaceTopicSchema>;

// ── 4. ProposalResult ─────────────────────────────────────────────────
// Hasil tulis offline/import (pola Harbor changeset): applied = langsung
// tulis, merged = three-way merge berhasil, conflict = kembalikan
// currentContent + history, UI tawarkan adopt/retry (tidak silent overwrite).

export const ProposalResultSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("applied"),
    threadRootId: z.string().min(1),
    reason: z.string().min(1),
  }),
  z.object({
    outcome: z.literal("merged"),
    threadRootId: z.string().min(1),
    reason: z.string().min(1),
    mergedWith: z.string().min(1),
  }),
  z.object({
    outcome: z.literal("conflict"),
    threadRootId: z.string().min(1),
    reason: z.string().min(1),
    currentContent: z.string(),
    history: z.array(z.string()),
  }),
]);
export type ProposalResult = z.infer<typeof ProposalResultSchema>;

// ── 5. Mention parser (pure) ──────────────────────────────────────────

export interface ParseSpaceMentionsOptions {
  /** Roster agent_type yang valid. Default = AGENT_ROSTER (6 agent). */
  validAgentTypes?: readonly string[];
  /** Bila diisi, #member: id di luar set ini di-drop (unknown = tampil apa adanya, stamp nol). */
  validMemberIds?: readonly string[];
  /** Bila diisi, #doc: id di luar set ini di-drop. */
  validDocIds?: readonly string[];
}

export interface ParsedSpaceMentionToken {
  kind: "agent" | "member" | "here" | "doc";
  id: string;
  label: string;
}

export interface ParsedSpaceMentions extends MentionStamps {
  tokens: ParsedSpaceMentionToken[];
}

// Fenced ```...``` (termasuk bahasa) + inline `...` = kutipan, bukan sapaan.
const FENCED_RE = /```[\s\S]*?(?:```|$)/g;
const INLINE_RE = /`[^`\n]*`/g;

/** Ganti code region dengan spasi (panjang sama) supaya index tetap stabil. */
function maskCodeRegions(text: string): string {
  return text
    .replace(FENCED_RE, (m) => " ".repeat(m.length))
    .replace(INLINE_RE, (m) => " ".repeat(m.length));
}

// [@Label](#member:id) | [@Label](#agent:type) | [@here](#here) | [#Label](#doc:id)
// Label @- harus diawali @, label #- harus diawali # (cegah false positive).
const TOKEN_RE =
  /\[(@[^\[\]\\]+|#[^\[\]\\]+)\]\(#(member:([^\)\s]+)|agent:([^\)\s]+)|here|doc:([^\)\s]+))\)/g;

function pushUnique(arr: string[], v: string): void {
  if (!arr.includes(v)) arr.push(v);
}

/**
 * Parse + stamp mention dari body composer (pure, server-side).
 *
 * Aturan (TRD §5):
 * 1. Hanya token link yang di-stamp. Bare `@word` / email = prose, NOL stamp.
 * 2. Di dalam code region (fenced/inline) = kutipan, NOL stamp.
 * 3. Label TIDAK PERNAH di-parse: `[@Finn](#agent:autonomous)` men-stamp
 *    `autonomous` (Geno), bukan Finn.
 * 4. Id divalidasi: agent harus ∈ roster; member/doc divalidasi bila
 *    allowlist diberikan. Unknown id = tampil apa adanya, stamp NOL.
 * 5. `#doc` = referensi (buka doc), notify NOL — masuk docRefs saja.
 */
export function parseSpaceMentions(
  body: unknown,
  opts: ParseSpaceMentionsOptions = {},
): ParsedSpaceMentions {
  const out: ParsedSpaceMentions = {
    agentTypes: [],
    memberIds: [],
    here: false,
    docRefs: [],
    hasAgent: false,
    tokens: [],
  };
  if (typeof body !== "string" || body.length === 0) return out;

  const validAgents = opts.validAgentTypes ?? AGENT_ROSTER.map((a) => a.type);
  const memberSet = opts.validMemberIds ? new Set(opts.validMemberIds) : null;
  const docSet = opts.validDocIds ? new Set(opts.validDocIds) : null;

  const masked = maskCodeRegions(body);
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(masked)) !== null) {
    // Ambil label asli dari body (bukan masked) dengan index yang sama.
    const label = body.slice(m.index + 1, m.index + 1 + m[1].length);
    const target = m[2];

    if (target === "here") {
      if (!/^@here$/i.test(label)) continue;
      out.here = true;
      out.tokens.push({ kind: "here", id: "here", label });
      continue;
    }
    if (target.startsWith("agent:")) {
      const agentType = m[4];
      if (!isAgentType(agentType)) continue;
      if (!(validAgents as readonly string[]).includes(agentType)) continue;
      pushUnique(out.agentTypes, agentType);
      out.tokens.push({ kind: "agent", id: agentType, label });
      continue;
    }
    if (target.startsWith("member:")) {
      const memberId = m[3];
      if (!memberId) continue;
      if (!label.startsWith("@")) continue;
      if (memberSet && !memberSet.has(memberId)) continue;
      pushUnique(out.memberIds, memberId);
      out.tokens.push({ kind: "member", id: memberId, label });
      continue;
    }
    if (target.startsWith("doc:")) {
      const docId = m[5];
      if (!docId) continue;
      if (!label.startsWith("#")) continue;
      if (docSet && !docSet.has(docId)) continue;
      pushUnique(out.docRefs, docId);
      out.tokens.push({ kind: "doc", id: docId, label });
      continue;
    }
  }

  out.hasAgent = out.agentTypes.length > 0;
  return out;
}

/** True bila pesan menyapa minimal satu agent (untuk enqueue agent_tasks). */
export function mentionsAgent(parsed: Pick<ParsedSpaceMentions, "agentTypes">): boolean {
  return parsed.agentTypes.length > 0;
}
