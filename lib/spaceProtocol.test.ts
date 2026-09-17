/**
 * Golden fixture Phase 0 — mention parser Team Space.
 *
 * Meliputi (PLAN Phase 0 + TRD §7):
 * - token valid men-stamp (per-agent, member, here, doc)
 * - code-block (fenced + inline) = kutipan, NOL stamp
 * - bare-word (@Geno tanpa link) = prose, NOL stamp
 * - label tidak pernah di-parse (id yang menang)
 * - unknown id = tampil apa adanya, stamp NOL
 * - dedupe + urutan kemunculan
 * - schema zod mini valid (Attribution / Stamps / Message / Topic / Proposal)
 */

import { describe, it, expect } from "vitest";
import {
  AttributionSchema,
  MentionStampsSchema,
  ProposalResultSchema,
  SpaceMessageSchema,
  SpaceTopicSchema,
  parseSpaceMentions,
} from "@/lib/spaceProtocol";

const MEMBERS = ["user-sarah", "user-john"] as const;
const DOCS = ["doc-launch", "doc-pricing"] as const;

describe("spaceProtocol mention tokens", () => {
  it("stamps per-agent token langsung (tanpa router)", () => {
    const p = parseSpaceMentions(
      "Tolong [@Geno](#agent:autonomous) cek queue",
    );
    expect(p.agentTypes).toEqual(["autonomous"]);
    expect(p.hasAgent).toBe(true);
    expect(p.here).toBe(false);
    expect(p.memberIds).toEqual([]);
  });

  it("LABEL tidak pernah di-parse — id yang menang", () => {
    // Label bilang Finn tapi id = autonomous → stamp autonomous (Geno).
    const p = parseSpaceMentions("[@Finn](#agent:autonomous) cek ini");
    expect(p.agentTypes).toEqual(["autonomous"]);
    expect(p.tokens[0]).toMatchObject({ kind: "agent", id: "autonomous", label: "@Finn" });
  });

  it("multi-agent dedupe + urutan kemunculan", () => {
    const p = parseSpaceMentions(
      "[@Geno](#agent:autonomous) lalu [@Finn](#agent:finance_invoice_ops) lalu [@Geno](#agent:autonomous)",
    );
    expect(p.agentTypes).toEqual(["autonomous", "finance_invoice_ops"]);
  });

  it("member + here + doc-ref ter-stamp ke slot yang benar", () => {
    const p = parseSpaceMentions(
      "Hai [@Sarah](#member:user-sarah), [@here](#here) lihat [#Launch](#doc:doc-launch)",
      { validMemberIds: MEMBERS, validDocIds: DOCS },
    );
    expect(p.memberIds).toEqual(["user-sarah"]);
    expect(p.here).toBe(true);
    expect(p.docRefs).toEqual(["doc-launch"]);
    expect(p.hasAgent).toBe(false);
  });

  it("#doc = referensi saja (notify NOL — tidak masuk agent/member/here)", () => {
    const p = parseSpaceMentions("[#Pricing](#doc:doc-pricing)");
    expect(p.docRefs).toEqual(["doc-pricing"]);
    expect(p.agentTypes).toEqual([]);
    expect(p.memberIds).toEqual([]);
    expect(p.here).toBe(false);
  });
});

describe("spaceProtocol code-block = kutipan", () => {
  it("token di dalam fenced block NOL stamp", () => {
    const p = parseSpaceMentions(
      "Contoh:\n```\n[@Geno](#agent:autonomous)\n```\nOke?",
    );
    expect(p.agentTypes).toEqual([]);
    expect(p.hasAgent).toBe(false);
    expect(p.tokens).toEqual([]);
  });

  it("token di dalam inline code NOL stamp, di luar tetap stamp", () => {
    const p = parseSpaceMentions(
      "Pakai `[@Geno](#agent:autonomous)` sebagai kutipan, tapi [@Finn](#agent:finance_invoice_ops) beneran",
    );
    expect(p.agentTypes).toEqual(["finance_invoice_ops"]);
  });

  it("fenced tanpa penutup tetap dianggap code sampai akhir", () => {
    const p = parseSpaceMentions("```\n[@Geno](#agent:autonomous)");
    expect(p.agentTypes).toEqual([]);
  });
});

describe("spaceProtocol bare-word = prose", () => {
  it("@Geno tanpa link mencapai NOL orang", () => {
    expect(parseSpaceMentions("@Geno cek queue").agentTypes).toEqual([]);
    expect(parseSpaceMentions("email a@b.com halo").tokens).toEqual([]);
    expect(parseSpaceMentions("").agentTypes).toEqual([]);
    expect(parseSpaceMentions(undefined).here).toBe(false);
  });

  it("@here tanpa link bukan broadcast", () => {
    expect(parseSpaceMentions("@here semua").here).toBe(false);
  });
});

describe("spaceProtocol unknown id", () => {
  it("agent di luar roster di-drop", () => {
    const p = parseSpaceMentions("[@Ghost](#agent:ghost_type)");
    expect(p.agentTypes).toEqual([]);
  });

  it("member/doc di luar allowlist di-drop", () => {
    const p = parseSpaceMentions(
      "[@X](#member:unknown-user) [#Y](#doc:unknown-doc)",
      { validMemberIds: MEMBERS, validDocIds: DOCS },
    );
    expect(p.memberIds).toEqual([]);
    expect(p.docRefs).toEqual([]);
  });

  it("label salah bentuk (@ untuk doc, # untuk member) di-drop", () => {
    // Label @ untuk target doc → bukan referensi valid.
    const p = parseSpaceMentions("[@Launch](#doc:doc-launch)", { validDocIds: DOCS });
    expect(p.docRefs).toEqual([]);
  });
});

describe("spaceProtocol zod schemas", () => {
  it("Attribution agent wajib bawa agentName + agentType", () => {
    expect(
      AttributionSchema.safeParse({ memberId: "u1", actingMode: "user" }).success,
    ).toBe(true);
    expect(
      AttributionSchema.safeParse({
        memberId: "agent-autonomous",
        actingMode: "agent",
        agentName: "Geno",
        agentType: "autonomous",
      }).success,
    ).toBe(true);
    expect(
      AttributionSchema.safeParse({ memberId: "x", actingMode: "agent" }).success,
    ).toBe(false);
  });

  it("MentionStamps konsisten (hasAgent = agentTypes > 0)", () => {
    expect(
      MentionStampsSchema.safeParse({
        agentTypes: ["autonomous"],
        memberIds: [],
        here: false,
        docRefs: [],
        hasAgent: true,
      }).success,
    ).toBe(true);
    expect(
      MentionStampsSchema.safeParse({
        agentTypes: [],
        memberIds: [],
        here: false,
        docRefs: [],
        hasAgent: true,
      }).success,
    ).toBe(false);
  });

  it("Message flat: reply menempel ke root id", () => {
    const base = {
      id: "m2",
      spaceId: "space-1",
      threadRoot: "m1",
      author: { memberId: "agent-autonomous", actingMode: "agent", agentName: "Geno", agentType: "autonomous" },
      body: "Siap, dikerjakan.",
      stamps: { agentTypes: [], memberIds: [], here: false, docRefs: [], hasAgent: false },
      createdAt: new Date().toISOString(),
    };
    expect(SpaceMessageSchema.safeParse(base).success).toBe(true);
    expect(SpaceMessageSchema.safeParse({ ...base, threadRoot: "" }).success).toBe(false);
  });

  it("Topic: 1 thread 1 judul goal + archived flag", () => {
    const t = {
      id: "t1",
      threadRoot: "m1",
      title: "Decide: launch cut Jumat",
      archived: false,
      docId: null,
      createdBy: "user-sarah",
      createdAt: new Date().toISOString(),
    };
    expect(SpaceTopicSchema.safeParse(t).success).toBe(true);
  });

  it("ProposalResult: applied/merged/conflict dengan reason wajib", () => {
    expect(
      ProposalResultSchema.safeParse({ outcome: "applied", threadRootId: "m1", reason: "ok" }).success,
    ).toBe(true);
    expect(
      ProposalResultSchema.safeParse({ outcome: "applied", threadRootId: "m1" }).success,
    ).toBe(false);
    expect(
      ProposalResultSchema.safeParse({
        outcome: "conflict",
        threadRootId: "m1",
        reason: "wave doc changed",
        currentContent: "cur",
        history: ["h1"],
      }).success,
    ).toBe(true);
  });
});
