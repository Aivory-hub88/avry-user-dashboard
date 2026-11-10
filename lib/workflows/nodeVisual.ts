// Resolves which icon a canvas node should show — n8n style: the icon follows
// the app the step actually talks to (Google Drive step → Google Drive logo),
// and built-in nodes get a glyph that matches what they do (Schedule → clock).
//
// Signals, strongest first: explicit `app` id, the raw n8n node type
// (n8n-nodes-base.googleDrive), then the words in the step's own title/text.

export const APP_ICON_MAP: Record<string, string> = {
  hubspot: '/icons/integrations/hubspot.svg',
  airtable: '/icons/integrations/airtable.svg',
  'amazon s3': '/icons/integrations/amazon-s3.svg',
  asana: '/icons/integrations/asana.svg',
  dropbox: '/icons/integrations/dropbox.svg',
  gmail: '/icons/integrations/gmail.svg',
  'google sheets': '/icons/integrations/google-sheets.svg',
  'google calendar': '/icons/integrations/google-calendar.svg',
  'google drive': '/icons/integrations/google-drive.svg',
  http: '/icons/integrations/http.svg',
  intercom: '/icons/integrations/intercom.svg',
  linear: '/icons/integrations/linear.svg',
  mailchimp: '/icons/integrations/mailchimp.svg',
  'microsoft teams': '/icons/integrations/microsoft-teams.svg',
  outlook: '/icons/integrations/outlook.svg',
  notion: '/icons/integrations/notion.svg',
  openai: '/icons/integrations/openai.svg',
  salesforce: '/icons/integrations/salesforce.svg',
  sendgrid: '/icons/integrations/sendgrid.svg',
  shopify: '/icons/integrations/shopify.svg',
  slack: '/icons/integrations/slack.svg',
  stripe: '/icons/integrations/stripe.svg',
  twilio: '/icons/integrations/twilio.svg',
  zendesk: '/icons/integrations/zendesk.svg',
  telegram: '/icons/integrations/telegram.svg',
  whatsapp: '/icons/integrations/whatsapp.svg',
  discord: '/icons/integrations/discord.svg',
  postgres: '/icons/integrations/postgresql.svg',
  postgresql: '/icons/integrations/postgresql.svg',
  mysql: '/icons/integrations/mysql.svg',
  mongodb: '/icons/integrations/mongodb.svg',
  redis: '/icons/integrations/redis.svg',
  graphql: '/icons/integrations/graphql.svg',
  anthropic: '/icons/integrations/claude.svg',
  claude: '/icons/integrations/claude.svg',
  ollama: '/icons/integrations/ollama.svg',
  odoo: '/icons/integrations/odoo.svg',
  erpnext: '/icons/integrations/erpnext.svg',
};

// Aliases the generator / n8n emit that don't read as a brand name.
const ALIASES: Record<string, string> = {
  'google-sheets': 'google sheets', googlesheets: 'google sheets', sheets: 'google sheets',
  'google-drive': 'google drive', googledrive: 'google drive', drive: 'google drive',
  'google-calendar': 'google calendar', googlecalendar: 'google calendar',
  'microsoft-teams': 'microsoft teams', microsoftteams: 'microsoft teams', teams: 'microsoft teams',
  email: 'gmail', gmail: 'gmail',
  s3: 'amazon s3', awss3: 'amazon s3', amazons3: 'amazon s3',
  httprequest: 'http', 'http request': 'http',
  openai: 'openai', 'open ai': 'openai',
  postgres: 'postgres', mysql: 'mysql', mongodb: 'mongodb', 'mongo db': 'mongodb',
  hubspot: 'hubspot', 'hub spot': 'hubspot',
  sendgrid: 'sendgrid', 'send grid': 'sendgrid',
};

export type NodeGlyph =
  | 'clock' | 'webhook' | 'code' | 'pencil' | 'timer' | 'merge' | 'filter'
  | 'mail' | 'reply' | 'repeat' | 'click' | 'branch' | 'bot' | 'globe' | 'database';

// Built-in (non-app) nodes: what they do decides the glyph. Checked against the
// raw n8n type first, then against the step's own words.
const GLYPH_RULES: [RegExp, NodeGlyph][] = [
  [/schedule|cron|interval|every (day|hour|week|minute|month)/i, 'clock'],
  [/respondtowebhook|respond to webhook/i, 'reply'],
  [/webhook/i, 'webhook'],
  [/manualtrigger|manual trigger|when clicking|test workflow/i, 'click'],
  [/\.code$|function|javascript|python|run code|\bcode\b/i, 'code'],
  [/\.set$|editfields|edit fields|set field|\bmap\b|transform/i, 'pencil'],
  [/\.wait$|\bwait\b|delay|\bsleep\b/i, 'timer'],
  [/\.merge$|\bmerge\b|\bjoin\b|combine/i, 'merge'],
  [/\.filter$|\bfilter\b/i, 'filter'],
  [/splitinbatches|loop|iterate|each item/i, 'repeat'],
  [/\.(if|switch)$|\bswitch\b|\bcondition|\bbranch\b|\brouter?\b/i, 'branch'],
  [/emailsend|send email|\bsmtp\b|\bimap\b|email/i, 'mail'],
  [/agent|\bai\b|llm|chat ?model|langchain|summar|classif/i, 'bot'],
  [/postgres|mysql|database|\bsql\b|mongo|redis/i, 'database'],
  [/httprequest|http request|\bapi\b|\bfetch\b/i, 'globe'],
];

/** Shortened n8n type: "n8n-nodes-base.googleDrive" → "google drive" (Trigger/Tool suffix dropped). */
function humanType(type?: string): string {
  const short = (type || '').split('.').pop() || '';
  return short
    .replace(/(Trigger|Tool)$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .trim();
}

function lookupBrand(raw: string): string | null {
  const key = raw.toLowerCase().trim();
  if (!key) return null;
  const alias = ALIASES[key] ?? ALIASES[key.replace(/[\s_]+/g, '')] ?? ALIASES[key.replace(/[\s_]+/g, '-')];
  if (alias && APP_ICON_MAP[alias]) return APP_ICON_MAP[alias];
  if (APP_ICON_MAP[key]) return APP_ICON_MAP[key];
  const squashed = key.replace(/[\s_-]+/g, '');
  for (const [name, path] of Object.entries(APP_ICON_MAP)) {
    if (name.replace(/\s+/g, '') === squashed) return path;
  }
  return null;
}

// Brand names, longest first so "google drive" wins over a bare "drive".
const BRAND_NAMES = [...Object.keys(APP_ICON_MAP), 'google drive', 'google sheets', 'google calendar']
  .filter((v, i, a) => a.indexOf(v) === i)
  .sort((a, b) => b.length - a.length);

function brandInText(text: string): string | null {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  for (const name of BRAND_NAMES) {
    // `http` as a bare word in prose is too noisy; only the exact "http request" phrase counts here.
    if (name === 'http' || name === 'linear' || name === 'claude') continue;
    if (t.includes(` ${name} `) || t.includes(` ${name}s `)) return APP_ICON_MAP[name];
  }
  return null;
}

export interface NodeVisualInput {
  app?: string;
  appIcon?: string;
  label?: string;
  description?: string;
  rawType?: string;
}

export interface NodeVisual {
  /** Brand logo (public path) when the step talks to a known app. */
  svg: string | null;
  /** Built-in glyph for nodes that are not an app (schedule, code, wait…). */
  glyph: NodeGlyph | null;
}

export function resolveNodeVisual(input: NodeVisualInput): NodeVisual {
  const { app, appIcon, label = '', description = '', rawType } = input;

  const svg =
    lookupBrand(app || '') ??
    lookupBrand(humanType(rawType)) ??
    lookupBrand(typeof appIcon === 'string' && !appIcon.startsWith('/') && !appIcon.startsWith('http') ? appIcon : '') ??
    brandInText(`${label} ${description}`);
  if (svg) return { svg, glyph: null };

  const typeText = `${rawType || ''} ${humanType(rawType)}`;
  for (const [re, glyph] of GLYPH_RULES) if (re.test(typeText)) return { svg: null, glyph };
  const words = `${app || ''} ${label} ${description}`;
  for (const [re, glyph] of GLYPH_RULES) if (re.test(words)) return { svg: null, glyph };
  return { svg: null, glyph: null };
}
