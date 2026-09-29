"use client"

/**
 * Agent access: mint and revoke the tokens an agent (Lex) uses to reach this
 * CRM over MCP. The token is shown once; only its hash is stored server-side.
 */
import { useCallback, useEffect, useState } from "react"
import { Button, fieldClass } from "@/components/requests/requestUi"
import { crmApi, type CreatedGrant, type Grant } from "@/lib/crmClient"

const MCP_URL = "https://api.aivory.id/crm/mcp"

function status(g: Grant): { label: string; tone: string } {
  if (g.revoked_at) return { label: "Revoked", tone: "text-white/30" }
  if (new Date(g.expires_at).getTime() <= Date.now()) return { label: "Expired", tone: "text-amber-300/80" }
  return { label: "Active", tone: "text-emerald-300/90" }
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

export default function AgentAccess({ onError }: { onError: (m: string | null) => void }) {
  const [grants, setGrants] = useState<Grant[] | null>(null)
  const [label, setLabel] = useState("Lex")
  const [readOnly, setReadOnly] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fresh, setFresh] = useState<CreatedGrant | null>(null)
  const [copied, setCopied] = useState<"token" | "url" | null>(null)

  const load = useCallback(async () => {
    try {
      setGrants(await crmApi.grants.list())
    } catch (e) {
      onError((e as Error).message)
    }
  }, [onError])

  useEffect(() => {
    // Fetch on mount; load() only sets state after its await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const create = async () => {
    if (busy) return
    setBusy(true)
    onError(null)
    try {
      const g = await crmApi.grants.create({
        label: label.trim() || "Lex",
        scopes: readOnly ? ["crm.read"] : ["crm.read", "crm.write"],
      })
      setFresh(g)
      await load()
    } catch (e) {
      onError((e as Error).message)
    }
    setBusy(false)
  }

  const revoke = async (id: string) => {
    onError(null)
    try {
      await crmApi.grants.revoke(id)
      if (fresh?.id === id) setFresh(null)
      await load()
    } catch (e) {
      onError((e as Error).message)
    }
  }

  const copy = async (what: "token" | "url", value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(what)
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 1500)
    } catch {
      onError("Couldn't copy. Select the text and copy it manually.")
    }
  }

  return (
    <div className="mx-auto max-w-[760px] space-y-6">
      <div>
        <div className="text-[13px] font-medium text-white/80">Let an agent use your CRM</div>
        <div className="mt-1 text-[12px] leading-relaxed text-white/40">
          Give Lex a token so it can look up, create and update companies, contacts and deals, and log follow-ups. Records it
          creates are marked as created by the agent. An agent can never delete anything. Revoke a token any time.
        </div>
      </div>

      <div className="rounded-2xl border border-line p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} aria-label="Token name" placeholder="Token name" className={`w-[200px] ${fieldClass}`} />
          <label className="flex items-center gap-2 text-[12px] text-white/55">
            <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />
            Read only
          </label>
          <Button tone="primary" type="submit" disabled={busy}>
            Generate token
          </Button>
        </form>

        {fresh && (
          <div className="mt-4 rounded-xl border border-[#b7cba6]/30 bg-[#b7cba6]/[0.06] p-4">
            <div className="text-[12px] font-medium text-[#b7cba6]">Copy this token now. It won&apos;t be shown again.</div>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 select-all break-all rounded-lg bg-black/30 px-3 py-2 text-[12px] text-white/85">{fresh.token}</code>
              <Button onClick={() => copy("token", fresh.token)}>{copied === "token" ? "Copied" : "Copy"}</Button>
            </div>
            <ol className="mt-3 list-decimal space-y-1 pl-4 text-[12px] leading-relaxed text-white/50">
              <li>Open Agents, then Lex, then Customise, then the MCP tab.</li>
              <li>Add MCP server and pick Aivory CRM.</li>
              <li>
                Paste the token under Advanced settings as the auth value. The server URL is{" "}
                <button onClick={() => copy("url", MCP_URL)} className="text-white/75 underline decoration-white/20 underline-offset-2 hover:text-white">
                  {copied === "url" ? "copied" : MCP_URL}
                </button>
                .
              </li>
            </ol>
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 text-[12px] font-medium text-white/60">Tokens</div>
        {grants === null ? (
          <div className="h-16 animate-pulse rounded-2xl bg-white/[0.03]" />
        ) : grants.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-[12px] text-white/35">No tokens yet.</div>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {grants.map((g) => {
              const st = status(g)
              const live = st.label === "Active"
              return (
                <li key={g.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-white/85">
                      {g.label}
                      <span className="ml-2 text-[11px] text-white/35">{g.scopes.includes("crm.write") ? "read & write" : "read only"}</span>
                    </div>
                    <div className="truncate text-[11px] text-white/40">
                      <span className={st.tone}>{st.label}</span>
                      {" · "}created {day(g.created_at)}
                      {" · "}expires {day(g.expires_at)}
                      {" · "}
                      {g.last_used_at ? `last used ${day(g.last_used_at)}` : "never used"}
                    </div>
                  </div>
                  {live && (
                    <Button tone="danger" onClick={() => revoke(g.id)} aria-label={`Revoke ${g.label}`}>
                      Revoke
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
