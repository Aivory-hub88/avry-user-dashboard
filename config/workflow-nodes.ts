// src/config/workflow-nodes.ts
export type NodeDefinition = {
  type: string
  label: string
  category: "Triggers" | "Logic" | "Data" | "HTTP & API" | "AI & LLM" | "Email" | "Messaging" | "Database" | "CRM" | "Utility"
  color: string        // hex, used for node header accent
  description: string  // one-line tooltip text
  defaultParams?: Record<string, unknown>
}

export const NODE_PALETTE: NodeDefinition[] = [
  // TRIGGERS (color: "#F59E0B")
  { type: "n8n-nodes-base.webhook", label: "Webhook", category: "Triggers", color: "#F59E0B", description: "Trigger workflow via HTTP request" },
  { type: "n8n-nodes-base.scheduleTrigger", label: "Schedule", category: "Triggers", color: "#F59E0B", description: "Run workflow on a time schedule" },
  { type: "n8n-nodes-base.manualTrigger", label: "Manual Trigger", category: "Triggers", color: "#F59E0B", description: "Run workflow manually" },
  { type: "n8n-nodes-base.gmailTrigger", label: "Gmail Trigger", category: "Triggers", color: "#F59E0B", description: "Trigger on new Gmail email" },

  // LOGIC (color: "#8B5CF6")
  { type: "n8n-nodes-base.if", label: "IF Condition", category: "Logic", color: "#8B5CF6", description: "Branch based on condition" },
  { type: "n8n-nodes-base.switch", label: "Switch", category: "Logic", color: "#8B5CF6", description: "Multi-branch routing" },
  { type: "n8n-nodes-base.merge", label: "Merge", category: "Logic", color: "#8B5CF6", description: "Combine data from multiple branches" },
  { type: "n8n-nodes-base.wait", label: "Wait / Delay", category: "Logic", color: "#8B5CF6", description: "Pause execution for a set time" },
  { type: "n8n-nodes-base.filter", label: "Filter", category: "Logic", color: "#8B5CF6", description: "Filter items by condition" },

  // DATA (color: "#10B981")
  { type: "n8n-nodes-base.set", label: "Set Fields", category: "Data", color: "#10B981", description: "Set or transform data fields" },
  { type: "n8n-nodes-base.code", label: "Code", category: "Data", color: "#10B981", description: "Run custom JavaScript or Python" },
  { type: "n8n-nodes-base.aggregate", label: "Aggregate", category: "Data", color: "#10B981", description: "Combine items into one" },
  { type: "n8n-nodes-base.splitOut", label: "Split Out", category: "Data", color: "#10B981", description: "Split array into individual items" },
  { type: "n8n-nodes-base.dateTime", label: "Date & Time", category: "Data", color: "#10B981", description: "Parse and format dates" },

  // HTTP & API (color: "#3B82F6")
  { type: "n8n-nodes-base.httpRequest", label: "HTTP Request", category: "HTTP & API", color: "#3B82F6", description: "Call any external API" },
  { type: "n8n-nodes-base.respondToWebhook", label: "Respond to Webhook", category: "HTTP & API", color: "#3B82F6", description: "Send HTTP response back to caller" },
  { type: "n8n-nodes-base.graphql", label: "GraphQL", category: "HTTP & API", color: "#3B82F6", description: "Query a GraphQL API" },

  // AI & LLM (color: "#EC4899")
  { type: "@n8n/n8n-nodes-langchain.agent", label: "AI Agent", category: "AI & LLM", color: "#EC4899", description: "Autonomous AI agent with tools" },
  { type: "@n8n/n8n-nodes-langchain.lmChain", label: "LLM Chain", category: "AI & LLM", color: "#EC4899", description: "Simple LLM prompt chain" },
  { type: "@n8n/n8n-nodes-langchain.lmChatOpenAi", label: "OpenAI Chat", category: "AI & LLM", color: "#EC4899", description: "GPT-4o and OpenAI models" },
  { type: "@n8n/n8n-nodes-langchain.lmChatAnthropic", label: "Claude (Anthropic)", category: "AI & LLM", color: "#EC4899", description: "Claude Sonnet and Opus models" },
  { type: "@n8n/n8n-nodes-langchain.lmChatOllama", label: "Ollama (Local)", category: "AI & LLM", color: "#EC4899", description: "Run local LLM via Ollama" },

  // EMAIL (color: "#F97316")
  { type: "n8n-nodes-base.emailSend", label: "Send Email", category: "Email", color: "#F97316", description: "Send email via SMTP" },
  { type: "n8n-nodes-base.gmail", label: "Gmail", category: "Email", color: "#F97316", description: "Read and send Gmail" },
  { type: "n8n-nodes-base.microsoftOutlook", label: "Outlook", category: "Email", color: "#F97316", description: "Read and send Outlook email" },

  // MESSAGING (color: "#06B6D4")
  { type: "n8n-nodes-base.slack", label: "Slack", category: "Messaging", color: "#06B6D4", description: "Post messages to Slack" },
  { type: "n8n-nodes-base.telegram", label: "Telegram", category: "Messaging", color: "#06B6D4", description: "Send Telegram messages" },
  { type: "n8n-nodes-base.whatsApp", label: "WhatsApp", category: "Messaging", color: "#06B6D4", description: "Send WhatsApp Business messages" },
  { type: "n8n-nodes-base.discord", label: "Discord", category: "Messaging", color: "#06B6D4", description: "Post to Discord channels" },
  { type: "n8n-nodes-base.microsoftTeams", label: "Microsoft Teams", category: "Messaging", color: "#06B6D4", description: "Post to Teams channels" },

  // DATABASE (color: "#14B8A6")
  { type: "n8n-nodes-base.googleSheets", label: "Google Sheets", category: "Database", color: "#14B8A6", description: "Read and write Google Sheets" },
  { type: "n8n-nodes-base.postgres", label: "PostgreSQL", category: "Database", color: "#14B8A6", description: "Query PostgreSQL database" },
  { type: "n8n-nodes-base.mySql", label: "MySQL", category: "Database", color: "#14B8A6", description: "Query MySQL database" },
  { type: "n8n-nodes-base.mongoDb", label: "MongoDB", category: "Database", color: "#14B8A6", description: "Query MongoDB collections" },
  { type: "n8n-nodes-base.airtable", label: "Airtable", category: "Database", color: "#14B8A6", description: "CRUD Airtable records" },
  { type: "n8n-nodes-base.notion", label: "Notion", category: "Database", color: "#14B8A6", description: "Read and write Notion pages" },
  { type: "n8n-nodes-base.redis", label: "Redis", category: "Database", color: "#14B8A6", description: "Get and set Redis keys" },

  // CRM (color: "#F43F5E")
  { type: "n8n-nodes-base.hubspot", label: "HubSpot", category: "CRM", color: "#F43F5E", description: "CRM contacts, deals, tickets" },
  { type: "n8n-nodes-base.salesforce", label: "Salesforce", category: "CRM", color: "#F43F5E", description: "Salesforce CRM operations" },
  { type: "n8n-nodes-base.erpnext", label: "ERPNext", category: "CRM", color: "#F43F5E", description: "ERPNext ERP integration" },
  { type: "n8n-nodes-base.odoo", label: "Odoo", category: "CRM", color: "#F43F5E", description: "Odoo ERP and CRM" },

  // UTILITY (color: "#6B7280")
  { type: "n8n-nodes-base.stickyNote", label: "Sticky Note", category: "Utility", color: "#6B7280", description: "Add annotation to canvas" },
  { type: "n8n-nodes-base.noOp", label: "No Operation", category: "Utility", color: "#6B7280", description: "Pass-through placeholder node" }
]

export const QUICK_ACCESS = [
  "n8n-nodes-base.webhook",
  "n8n-nodes-base.httpRequest",
  "n8n-nodes-base.emailSend",
  "n8n-nodes-base.if",
  "n8n-nodes-base.code",
  "@n8n/n8n-nodes-langchain.agent",
  "n8n-nodes-base.scheduleTrigger",
  "n8n-nodes-base.respondToWebhook",
  "n8n-nodes-base.slack",
  "n8n-nodes-base.set"
]