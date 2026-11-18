/** Provider-neutral WhatsApp types. Nothing here touches a secret. */
export type ProviderId = "kapso" | "meta" | "twilio" | "kirimdev"
export type Creds = Record<string, string>

/** Media fields are set only for non-text messages; the agent path needs them, the CRM does not. */
export type Inbound = { id: string; from: string; name: string | null; text: string; at: string; kind?: string; mediaId?: string; mime?: string; filename?: string }

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; status: number; code: "window_closed" | "bad_key" | "rejected" | "unavailable"; message: string }

/** `secret` is set when the provider chooses the webhook signing secret itself (we must store theirs). */
export type RegisterResult = { ok: true; secret?: string } | { ok: false; code: "bad_key" | "rejected" | "unavailable"; message: string }

/** What a webhook delivery looks like to a provider: the exact raw body, headers, and the public URL it was sent to. */
export type InboundCtx = { raw: string; headers: Headers; url: string }

export const MAX_TEXT = 4096

/** An approved WhatsApp template a person can send outside the 24-hour window. */
export type WaTemplate = {
  name: string
  language: string
  category: string
  /** BODY text with its {{1}}, {{2}} placeholders. */
  body: string
  /** How many positional variables the body takes. */
  params: number
  /** False for templates that need media, buttons with variables, etc., which we can't fill from a text box. */
  usable: boolean
}

export type TemplateList = { ok: true; templates: WaTemplate[] } | { ok: false; code: "unsupported" | "bad_key" | "unavailable" | "rejected"; message: string }
