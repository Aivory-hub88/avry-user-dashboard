/** Provider-neutral WhatsApp types. Nothing here touches a secret. */
export type ProviderId = "kapso" | "meta" | "twilio" | "kirimdev"
export type Creds = Record<string, string>

export type Inbound = { id: string; from: string; name: string | null; text: string; at: string }

export type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; status: number; code: "window_closed" | "bad_key" | "rejected" | "unavailable"; message: string }

/** `secret` is set when the provider chooses the webhook signing secret itself (we must store theirs). */
export type RegisterResult = { ok: true; secret?: string } | { ok: false; code: "bad_key" | "rejected" | "unavailable"; message: string }

/** What a webhook delivery looks like to a provider: the exact raw body, headers, and the public URL it was sent to. */
export type InboundCtx = { raw: string; headers: Headers; url: string }

export const MAX_TEXT = 4096
