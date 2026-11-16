/**
 * What the UI and the server both need to know about each provider: its name,
 * the credentials a customer must supply, and whether Aivory can register the
 * webhook for them. Client-safe (no secrets handling).
 */
import type { Creds, ProviderId } from "./types"

export type FieldDef = { key: string; label: string; secret: boolean; placeholder: string; pattern: RegExp; hint: string; /** Allowed to be left empty (it enables an extra feature). */ optional?: boolean }
export type ProviderMeta = {
  id: ProviderId
  label: string
  blurb: string
  fields: FieldDef[]
  /** auto: Aivory registers the webhook with the provider. manual: the customer pastes it into the provider's console. */
  webhook: "auto" | "manual"
  /** Shown after connecting a manual provider. `secret` is the verify token Aivory generated. */
  steps: (url: string, secret: string) => string[]
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: "kapso",
    label: "Kapso",
    blurb: "A Kapso account with a connected WhatsApp number. Aivory sets up the webhook for you.",
    webhook: "auto",
    steps: () => [],
    fields: [
      { key: "api_key", label: "API key", secret: true, placeholder: "Kapso API key", pattern: /^\S{10,300}$/, hint: "Kapso → Integrations → API keys." },
      { key: "phone_number_id", label: "Phone number ID", secret: false, placeholder: "Phone number ID", pattern: /^\d{5,30}$/, hint: "The digits shown next to your number in Kapso." },
    ],
  },
  {
    id: "kirimdev",
    label: "KirimDev",
    blurb: "KirimDev, an Indonesian WhatsApp Business API platform. Aivory sets up the webhook for you.",
    webhook: "auto",
    steps: () => [],
    fields: [{ key: "api_key", label: "API key", secret: true, placeholder: "KirimDev API key", pattern: /^\S{10,300}$/, hint: "KirimDev dashboard → API keys." }],
  },
  {
    id: "meta",
    label: "Meta Cloud API",
    blurb: "WhatsApp Business Platform straight from Meta, with no middleman.",
    webhook: "manual",
    steps: (url, secret) => [
      "In Meta for Developers, open your app → WhatsApp → Configuration.",
      `Callback URL: ${url}`,
      `Verify token: ${secret}`,
      "Click Verify and save, then subscribe to the “messages” field.",
    ],
    fields: [
      { key: "access_token", label: "Access token", secret: true, placeholder: "Permanent access token", pattern: /^\S{20,600}$/, hint: "A system-user token with whatsapp_business_messaging." },
      { key: "phone_number_id", label: "Phone number ID", secret: false, placeholder: "Phone number ID", pattern: /^\d{5,30}$/, hint: "WhatsApp → API Setup → Phone number ID." },
      { key: "app_secret", label: "App secret", secret: true, placeholder: "App secret", pattern: /^[0-9a-fA-F]{16,64}$/, hint: "App settings → Basic. Used to check that webhooks really come from Meta." },
      { key: "waba_id", label: "WhatsApp Business Account ID", secret: false, placeholder: "Optional, needed for templates", pattern: /^\d{5,30}$/, hint: "WhatsApp → API Setup. Lets you send approved templates.", optional: true },
    ],
  },
  {
    id: "twilio",
    label: "Twilio",
    blurb: "Twilio’s WhatsApp sender or sandbox.",
    webhook: "manual",
    steps: (url) => ["In the Twilio Console, open your WhatsApp sender (or the sandbox settings).", `Set “When a message comes in” to: ${url}`, "Method: HTTP POST. Save."],
    fields: [
      { key: "account_sid", label: "Account SID", secret: false, placeholder: "AC…", pattern: /^AC[0-9a-fA-F]{32}$/, hint: "Twilio Console → Account info." },
      { key: "auth_token", label: "Auth token", secret: true, placeholder: "Auth token", pattern: /^\S{16,64}$/, hint: "Twilio Console → Account info. Also used to verify webhooks." },
      { key: "from_number", label: "WhatsApp number", secret: false, placeholder: "+14155238886", pattern: /^\+\d{7,15}$/, hint: "Your WhatsApp sender in international format." },
    ],
  },
]

export const providerMeta = (id: string): ProviderMeta | undefined => PROVIDERS.find((p) => p.id === id)

/** Only the declared fields, trimmed; the first problem as a sentence, or null when all are fine. */
export function checkCreds(id: ProviderId, raw: Record<string, unknown>): { creds: Creds; problem: string | null } {
  const meta = providerMeta(id)
  const creds: Creds = {}
  if (!meta) return { creds, problem: "Unknown WhatsApp provider." }
  for (const f of meta.fields) {
    const v = typeof raw[f.key] === "string" ? (raw[f.key] as string).trim() : ""
    creds[f.key] = v
    if (f.optional && v === "") continue
    if (!f.pattern.test(v)) return { creds, problem: `${meta.label}: the ${f.label.toLowerCase()} doesn’t look right. ${f.hint}` }
  }
  return { creds, problem: null }
}
