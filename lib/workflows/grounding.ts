/**
 * Generate-time grounding.
 *
 * The bridge's generate prompt only says "use real app names". With nothing to
 * check against, the model invents triggers (a HubSpot trigger for "when a
 * lead signs up", a webhook for "click a button") and skips utility steps
 * (Wait, Set). This builds a short block listing what the plan -> n8n mapper
 * can actually build, so the model picks from real options.
 *
 * Everything here is derived from lib/workflows/appNodes.ts (whose entries are
 * themselves validated against the real n8n node catalog by appNodes.test.ts),
 * so the block cannot drift from what the mapper emits. The block never echoes
 * user text: only canonical app keys, so it cannot carry an injection.
 */
import { KNOWN_APP_KEYS, TRIGGER_APP_KEYS, normalizeApp } from '@/lib/workflows/appNodes'

/** Keys that are building blocks, not apps a user would name as an integration. */
const UTILITY_KEYS = new Set([
  'http', 'respond', 'code', 'set', 'compression', 'wait', 'schedule', 'webhook', 'manual', 'cleanup', 'ai',
])

/** Aliases that are ordinary words in a prompt, so they do not count as the user naming an app. */
const GENERIC_WORDS = new Set([
  'git', 'db', 'sql', 'database', 'pg', 'wa', 'sms', 'drive', 'calendar', 'sheets', 'spreadsheet', 'spreadsheets',
  'feed', 'mail', 'agent', 'form', 'forms', 'api', 'request', 'rest', 'response', 'function', 'script', 'js',
])

/** What each app trigger means, so "email" is not read as "any flow that sends an email". Keys must match TRIGGER_APP_KEYS (grounding.test.ts). */
export const TRIGGER_EVENTS: Record<string, string> = {
  gmail: 'a new Gmail message arrives',
  aivorymail: 'a new Aivory Mail message arrives; urgency, intent and entities from Aivory Mail\'s own analysis are available in the trigger data, so do not add an AI step just to classify urgency',
  email: 'a new email arrives in an IMAP inbox — only when the user names Zoho Mail, Outlook or IMAP',
  stripe: 'a Stripe payment/refund/invoice event',
  github: 'a GitHub issue/PR/push event',
  slack: 'a new Slack message',
  shopify: 'a new Shopify order/product/customer',
  telegram: 'a Telegram bot receives a message',
  hubspot: 'a HubSpot contact/deal/company is created',
  airtable: 'an Airtable record changes',
  notion: 'a Notion page/database changes',
  googlesheets: 'a Google Sheets row is added or changed',
}

const NATIVE_APPS = KNOWN_APP_KEYS.filter((k) => !UTILITY_KEYS.has(k))

/** Canonical keys of the integrations the prompt names, in order of first mention. */
export function detectApps(prompt: string): string[] {
  const words = (prompt || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const found: string[] = []
  const add = (k: string | null) => { if (k && !UTILITY_KEYS.has(k) && !found.includes(k)) found.push(k) }
  for (let i = 0; i < words.length; i++) {
    // "google sheets", "google drive": try the 2-word phrase before the single word.
    if (i + 1 < words.length) {
      const two = words[i] + words[i + 1]
      const k = normalizeApp(two)
      if (k && !GENERIC_WORDS.has(two)) { add(k); i++; continue }
    }
    if (!GENERIC_WORDS.has(words[i])) add(normalizeApp(words[i]))
  }
  return found
}

/** The grounding block appended to the generate request. */
export function buildGroundingBlock(prompt: string): string {
  const mentioned = detectApps(prompt)
  const triggerApps = TRIGGER_APP_KEYS.map((k) => `${k} (${TRIGGER_EVENTS[k] ?? 'app event'})`).join('; ')
  const lines = [
    '\n\n[BUILDING BLOCKS — pick "app" from these exact lowercase values:',
    `- Triggers (first step): "webhook" = an HTTP call, a form submission, or an event like "when a lead signs up / a deal is won / a ticket comes in" where the user did NOT name the app that emits it. "schedule" = recurring or time-based. "manual" = the user clicks a button or runs it by hand. An app trigger is allowed ONLY when the user named that app as the thing that starts the flow — an app used later in the flow (e.g. "wait 2 days, then email them") never makes it the trigger. App triggers: ${triggerApps}.`,
    '- Utility steps: "set" = rename, reformat, map or compute fields (prefer it for simple data reshaping); "code" = custom JavaScript, only when "set" cannot do it; "wait" = pause before continuing (a delay, or waiting for an approval/reply; put the duration in "action", e.g. "2 days"); "http" = call any REST API; "ai" = summarize, classify or draft text (when it must run for every row/lead/item, say "each" or "every" in its description; otherwise it runs once); "respond" = reply to the webhook caller; "compression" = zip/unzip files.',
    `- Apps with a native node: ${NATIVE_APPS.join(', ')}. For any other service use "http". For email, use "gmail" unless the user names Zoho Mail, Aivory Mail, Outlook, SMTP or IMAP (then "email", which sends over SMTP and reads over IMAP).`,
    'Rules: use only apps the user named plus utility steps — never add a CRM, chat or email app the user did not mention. Give every app and action the user asked for its own step.',
  ]
  if (mentioned.length) {
    lines.push(
      'Apps in this request: ' +
        mentioned
          .map((k) => `${k} (${TRIGGER_APP_KEYS.includes(k) ? 'native node, can trigger' : 'native node, action only'})`)
          .join('; ') +
        '.',
    )
  }
  lines[lines.length - 1] += ']'
  return lines.join('\n')
}

const MAIL_EVENT = /\b(?:zoho|aivory) ?mail\b|\b(incoming|inbox|receiv(?:e|es|ed|ing)|arriv(?:e|es|ed|ing)|new (?:e-?mail|mail|message)s?|e-?mail (?:masuk|baru)|ada e-?mail|(?:dapat|menerima|terima) e-?mail|masuk)\b/i

/**
 * Post-generation check that the trigger is something the user asked for.
 * An app trigger (HubSpot, Shopify, IMAP email, ...) the request never
 * mentions is an invention — "when a deal is won" does not say which CRM — and
 * would build a node the user has no credentials for. It becomes a plain
 * webhook. Email triggers also need email-arrival wording, because "email
 * finance" only names the app used later in the flow.
 */
export function groundTrigger<T extends { type?: string; app?: string }>(steps: T[], userRequest: string | undefined): { steps: T[]; fixes: string[] } {
  const first = steps[0]
  if (!userRequest || !first || first.type !== 'trigger') return { steps, fixes: [] }
  const key = normalizeApp(first.app)
  if (!key || !TRIGGER_APP_KEYS.includes(key)) return { steps, fixes: [] }

  const named = detectApps(userRequest).includes(key)
  const mailArrival = MAIL_EVENT.test(userRequest)
  const ok = key === 'email' ? mailArrival : key === 'gmail' ? named || mailArrival : named
  if (ok) return { steps, fixes: [] }

  const next = steps.slice()
  next[0] = { ...first, app: 'webhook' }
  return { steps: next, fixes: [`trigger "${first.app}" is not named in the request; using a webhook trigger`] }
}
