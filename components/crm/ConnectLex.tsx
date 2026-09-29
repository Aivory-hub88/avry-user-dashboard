"use client"

/**
 * One-click "Connect Lex": mints a CRM token and registers the Aivory CRM MCP
 * server on Lex for the user, so the token never has to be copied around.
 */
import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import { Button } from "@/components/requests/requestUi"
import { asset } from "@/lib/asset"
import { crmApi, type Grant } from "@/lib/crmClient"
import { AUTO_GRANT_LABEL, CRM_SERVER_NAME, LEX_AGENT, connectAgent, disconnectAgent, type ConnectDeps } from "@/lib/crmConnect"
import { deleteTenantMcpServer, listTenantMcpServers, registerTenantMcpServer, type TenantMcpServer } from "@/lib/tenantMcpServers"

const deps: ConnectDeps = {
  createGrant: () => crmApi.grants.create({ label: AUTO_GRANT_LABEL, scopes: ["crm.read", "crm.write"] }),
  revokeGrant: (id) => crmApi.grants.revoke(id),
  register: registerTenantMcpServer,
  deleteServer: deleteTenantMcpServer,
}

export default function ConnectLex({ grants, onGrantsChanged }: { grants: Grant[] | null; onGrantsChanged: () => void }) {
  // undefined = still loading, null = Lex has no Aivory CRM server yet.
  const [server, setServer] = useState<TenantMcpServer | null | undefined>(undefined)
  const [busy, setBusy] = useState<"connect" | "disconnect" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const all = await listTenantMcpServers(LEX_AGENT)
      setServer(all.find((s) => s.name === CRM_SERVER_NAME) ?? null)
    } catch (e) {
      setServer(null)
      setError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    // Fetch on mount; load() only sets state after its await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  // Evaluated inside the handlers (not during render) because it reads the clock.
  const autoGrantIds = () =>
    (grants ?? [])
      .filter((g) => g.label === AUTO_GRANT_LABEL && !g.revoked_at && new Date(g.expires_at).getTime() > Date.now())
      .map((g) => g.id)

  const connect = async () => {
    if (busy) return
    setBusy("connect")
    setError(null)
    try {
      setServer(await connectAgent(deps, { existingServerId: server?.id, oldGrantIds: autoGrantIds() }))
    } catch (e) {
      setError((e as Error).message)
      await load()
    }
    onGrantsChanged()
    setBusy(null)
  }

  const disconnect = async () => {
    if (busy || !server) return
    setBusy("disconnect")
    setError(null)
    try {
      await disconnectAgent(deps, server.id, autoGrantIds())
      setServer(null)
    } catch (e) {
      setError((e as Error).message)
    }
    onGrantsChanged()
    setBusy(null)
  }

  const connected = server?.status === "verified"

  return (
    <div className="rounded-2xl border border-line p-5">
      <div className="flex items-start gap-3">
        <Image src={asset("/integrations/icons/aivory-crm.svg?v=20260929b")} alt="" width={28} height={28} className="mt-0.5 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-white/85">
            Connect Lex
            {server !== undefined && server !== null && (
              <span className={`ml-2 text-[11px] font-normal ${connected ? "text-emerald-300/90" : "text-amber-300/90"}`}>
                {connected ? `Connected · ${server.tool_count ?? 0} tools` : "Needs attention"}
              </span>
            )}
          </div>
          <div className="mt-1 text-[12px] leading-relaxed text-white/40">
            {connected
              ? "Lex can look up, create and update your companies, contacts and deals, and log follow-ups. It can never delete anything."
              : "One click: we create a token and add Aivory CRM to Lex's tools for you. You never handle the token."}
          </div>
          {server && !connected && server.last_verify_error && (
            <div className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">{server.last_verify_error}</div>
          )}
          {error && <div className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">{error}</div>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button tone={server ? "secondary" : "primary"} disabled={busy !== null || server === undefined} onClick={connect}>
              {busy === "connect" ? "Connecting…" : server ? "Reconnect with a new token" : "Connect Lex"}
            </Button>
            {server && (
              <Button tone="danger" disabled={busy !== null} onClick={disconnect}>
                {busy === "disconnect" ? "Disconnecting…" : "Disconnect"}
              </Button>
            )}
            {!server && <span className="text-[11px] text-white/30">Needs a paid plan and Lex running on Aivory Cerveau.</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
