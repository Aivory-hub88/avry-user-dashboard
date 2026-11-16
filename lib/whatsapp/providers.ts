/**
 * The provider registry: one adapter per WhatsApp vendor behind a single interface,
 * so the CRM never branches on the vendor. To add one: write its adapter, add it
 * here, and describe its credentials in providerMeta.ts. SERVER-ONLY.
 */
import { INBOUND_EVENT, kapsoListTemplates, kapsoSendTemplate, parseInbound, registerWebhook, sendText, verifySignature } from "../kapso"
import { kirimParse, kirimRegister, kirimSend, kirimVerify, kirimWanted } from "./kirimdev"
import { metaChallenge, metaListTemplates, metaParse, metaSend, metaSendTemplate, metaVerify } from "./meta"
import { twilioParse, twilioSend, twilioVerify } from "./twilio"
import type { Creds, InboundCtx, Inbound, ProviderId, RegisterResult, SendResult, TemplateList } from "./types"

export interface Provider {
  id: ProviderId
  send(c: Creds, toDigits: string, text: string): Promise<SendResult>
  /** Providers Aivory can wire up itself (webhook: "auto" in providerMeta). */
  autoRegister?(c: Creds, url: string, secret: string): Promise<RegisterResult>
  /** `secret` is the webhook secret Aivory generated; some providers sign with a credential instead. */
  verify(ctx: InboundCtx, c: Creds, secret: string): boolean
  /** Whether this delivery is an inbound-message event at all (Kapso names the event in a header). */
  wanted?(ctx: InboundCtx): boolean
  parse(ctx: InboundCtx): Inbound[]
  /** Setup handshake for providers that do one over GET. */
  challenge?(params: URLSearchParams, secret: string): string | null
  /** Approved templates, for starting a chat outside the 24-hour window. Absent when the adapter does not support them yet. */
  templates?: {
    list(c: Creds): Promise<TemplateList>
    send(c: Creds, toDigits: string, name: string, language: string, params: string[]): Promise<SendResult>
  }
  /** What to answer a delivery with (Twilio expects TwiML). */
  ack?: { body: string; type: string }
}

const kapso: Provider = {
  id: "kapso",
  send: (c, to, text) => sendText({ apiKey: c.api_key, phoneNumberId: c.phone_number_id }, to, text),
  autoRegister: (c, url, secret) => registerWebhook({ apiKey: c.api_key, phoneNumberId: c.phone_number_id }, url, secret),
  verify: (ctx, _c, secret) => verifySignature(ctx.raw, ctx.headers.get("x-webhook-signature"), secret),
  wanted: (ctx) => {
    const e = ctx.headers.get("x-webhook-event")
    return !e || e === INBOUND_EVENT
  },
  parse: (ctx) => parseInbound(JSON.parse(ctx.raw)),
  templates: {
    list: (c) => kapsoListTemplates({ apiKey: c.api_key, phoneNumberId: c.phone_number_id }),
    send: (c, to, name, lang, params) => kapsoSendTemplate({ apiKey: c.api_key, phoneNumberId: c.phone_number_id }, to, name, lang, params),
  },
}

const meta: Provider = {
  id: "meta",
  send: (c, to, text) => metaSend(c, to, text),
  verify: (ctx, c) => metaVerify(ctx, c),
  parse: metaParse,
  challenge: metaChallenge,
  templates: { list: (c) => metaListTemplates(c), send: (c, to, name, lang, params) => metaSendTemplate(c, to, name, lang, params) },
}

const twilio: Provider = {
  id: "twilio",
  send: (c, to, text) => twilioSend(c, to, text),
  verify: (ctx, c) => twilioVerify(ctx, c),
  parse: twilioParse,
  ack: { body: "<Response/>", type: "text/xml" },
}

const kirimdev: Provider = {
  id: "kirimdev",
  send: (c, to, text) => kirimSend(c, to, text),
  autoRegister: (c, url) => kirimRegister(c, url),
  verify: (ctx, _c, secret) => kirimVerify(ctx, secret),
  wanted: kirimWanted,
  parse: kirimParse,
}

const REGISTRY: Record<ProviderId, Provider> = { kapso, meta, twilio, kirimdev }

export function getProvider(id: string): Provider | null {
  return (REGISTRY as Record<string, Provider | undefined>)[id] ?? null
}
