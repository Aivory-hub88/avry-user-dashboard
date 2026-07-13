// src/config/node-icons.tsx
//
// Palette icon system, two tiers:
//   1. BRAND_NODE_ICONS — integration nodes get their real brand SVG from
//      public/icons/integrations/ (same set the canvas WorkflowNode uses).
//   2. NODE_ICONS — core/logic/utility nodes get a lucide-react line icon.
// getPaletteNodeIcon(type) picks the right one.
import React from 'react';
import { asset } from '@/lib/asset';
import {
  Webhook, CalendarClock, MousePointerClick, GitFork, Split, Merge, Timer,
  Filter, SlidersHorizontal, Code2, Combine, Ungroup, CalendarDays, Globe,
  Reply, Bot, Link2, Send, StickyNote, CircleSlash2,
} from 'lucide-react';

const line = (Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>) => (
  <Icon size={20} strokeWidth={1.5} />
);

export const NODE_ICONS: Record<string, React.ReactNode> = {
  // Triggers
  'n8n-nodes-base.webhook': line(Webhook),
  'n8n-nodes-base.scheduleTrigger': line(CalendarClock),
  'n8n-nodes-base.manualTrigger': line(MousePointerClick),
  // Logic
  'n8n-nodes-base.if': line(GitFork),
  'n8n-nodes-base.switch': line(Split),
  'n8n-nodes-base.merge': line(Merge),
  'n8n-nodes-base.wait': line(Timer),
  'n8n-nodes-base.filter': line(Filter),
  // Data
  'n8n-nodes-base.set': line(SlidersHorizontal),
  'n8n-nodes-base.code': line(Code2),
  'n8n-nodes-base.aggregate': line(Combine),
  'n8n-nodes-base.splitOut': line(Ungroup),
  'n8n-nodes-base.dateTime': line(CalendarDays),
  // HTTP & API
  'n8n-nodes-base.httpRequest': line(Globe),
  'n8n-nodes-base.respondToWebhook': line(Reply),
  // AI & LLM (non-brand)
  '@n8n/n8n-nodes-langchain.agent': line(Bot),
  '@n8n/n8n-nodes-langchain.lmChain': line(Link2),
  // Email (generic SMTP)
  'n8n-nodes-base.emailSend': line(Send),
  // Utility
  'n8n-nodes-base.stickyNote': line(StickyNote),
  'n8n-nodes-base.noOp': line(CircleSlash2),
};

// ── Brand icons ──────────────────────────────────────────────
// Integration nodes use the same brand SVG set as the canvas
// (components/workflow/WorkflowNode.tsx APP_ICON_MAP) so the side panel and
// canvas stay visually consistent. simple-icons-sourced marks (postgresql,
// mysql, mongodb, redis, graphql, claude, ollama, odoo, erpnext) carry an
// inline brand-color fill so they read on both dark and light surfaces.
const BRAND_NODE_ICONS: Record<string, string> = {
  'n8n-nodes-base.gmailTrigger': '/icons/integrations/gmail.svg',
  'n8n-nodes-base.gmail': '/icons/integrations/gmail.svg',
  'n8n-nodes-base.microsoftOutlook': '/icons/integrations/outlook.svg',
  'n8n-nodes-base.slack': '/icons/integrations/slack.svg',
  'n8n-nodes-base.telegram': '/icons/integrations/telegram.svg',
  'n8n-nodes-base.whatsApp': '/icons/integrations/whatsapp.svg',
  'n8n-nodes-base.discord': '/icons/integrations/discord.svg',
  'n8n-nodes-base.microsoftTeams': '/icons/integrations/microsoft-teams.svg',
  'n8n-nodes-base.googleSheets': '/icons/integrations/google-sheets.svg',
  'n8n-nodes-base.airtable': '/icons/integrations/airtable.svg',
  'n8n-nodes-base.notion': '/icons/integrations/notion.svg',
  'n8n-nodes-base.hubspot': '/icons/integrations/hubspot.svg',
  'n8n-nodes-base.salesforce': '/icons/integrations/salesforce.svg',
  'n8n-nodes-base.postgres': '/icons/integrations/postgresql.svg',
  'n8n-nodes-base.mySql': '/icons/integrations/mysql.svg',
  'n8n-nodes-base.mongoDb': '/icons/integrations/mongodb.svg',
  'n8n-nodes-base.redis': '/icons/integrations/redis.svg',
  'n8n-nodes-base.graphql': '/icons/integrations/graphql.svg',
  'n8n-nodes-base.erpnext': '/icons/integrations/erpnext.svg',
  'n8n-nodes-base.odoo': '/icons/integrations/odoo.svg',
  '@n8n/n8n-nodes-langchain.lmChatOpenAi': '/icons/integrations/openai.svg',
  '@n8n/n8n-nodes-langchain.lmChatAnthropic': '/icons/integrations/claude.svg',
  '@n8n/n8n-nodes-langchain.lmChatOllama': '/icons/integrations/ollama.svg',
};

export const DefaultIcon = () => line(CircleSlash2);

/** Palette icon: brand SVG when available, lucide line icon otherwise. */
export function getPaletteNodeIcon(type: string): React.ReactNode {
  const brand = BRAND_NODE_ICONS[type];
  if (brand) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={asset(brand)}
        alt=""
        width={20}
        height={20}
        style={{ objectFit: 'contain' }}
        draggable={false}
      />
    );
  }
  return NODE_ICONS[type] || <DefaultIcon />;
}
