export interface Template {
  id: string;
  title: string;
  description: string;
  uses: number;
  apps: string[];
  category: string;
  author?: {
    name: string;
    avatar?: string;
  };
  lastUpdated?: string;
  flowData?: {
    nodes: any[];
    edges: any[];
  };
  nodesList?: { name: string; icon: string }[];
}

export const TEMPLATE_CATEGORIES = [
  "All Categories",
  "AI",
  "API",
  "Analytics",
  "Automation",
  "Building Blocks",
  "Cloud",
  "Communication",
  "Community",
  "Content Creation",
  "Crypto",
  "Customer",
];

export const TEMPLATES: Template[] = [
  {
    id: "t1",
    title: "Simple WhatsApp Auto Reply (AI)",
    description: "Automatically respond to incoming WhatsApp messages using predefined context and Aivory AI.",
    uses: 841,
    apps: ["whatsapp"],
    category: "Communication",
    author: {
      name: "Aivory Tech Lab",
      avatar: "/aivory-tech-lab-v2.svg"
    },
    lastUpdated: "June 10 05:15",
    nodesList: [
      { name: "WhatsApp Trigger", icon: "whatsapp" },
      { name: "Aivory AI Agent", icon: "ai-agent" },
      { name: "Send WhatsApp Reply", icon: "whatsapp" }
    ],
    flowData: {
      nodes: [
        { id: "1", type: "n8nNode", position: { x: 50, y: 350 }, data: { label: "WhatsApp Trigger", icon: "whatsapp", isTrigger: true } },
        { id: "2", type: "n8nNode", position: { x: 350, y: 350 }, data: { label: "Aivory AI Agent", icon: "ai-agent", subtitle: "Horizon Bots" } },
        { id: "3", type: "n8nNode", position: { x: 650, y: 350 }, data: { label: "Send WhatsApp Reply", icon: "whatsapp" } },
        { id: "note", type: "stickyNode", position: { x: 200, y: 50 }, data: { title: "How to setup", content: "1. Connect your WhatsApp Business API\n2. Add the Aivory AI knowledge base\n3. Map the AI response to the reply message" } }
      ],
      edges: [
        { id: "e1-2", source: "1", target: "2", type: "smoothstep" },
        { id: "e2-3", source: "2", target: "3", type: "smoothstep" }
      ]
    }
  },
  {
    id: "t2",
    title: "Customer Support Escalation",
    description: "Automatically extract sentiment from support tickets and escalate angry customers to a human agent.",
    uses: 575,
    apps: ["zendesk", "slack"],
    category: "Customer"
  },
  {
    id: "t3",
    title: "(Simple) Instagram Auto-Reply: Comments & Private...",
    description: "Automatically respond to Instagram comments with an AI generated reply, or send a DM.",
    uses: 485,
    apps: ["instagram"],
    category: "Communication"
  },
  {
    id: "t4",
    title: "WA Chatbot With Image Generation",
    description: "Allow users to generate images directly from WhatsApp chats using Midjourney or DALL-E.",
    uses: 284,
    apps: ["whatsapp", "ai-agent"],
    category: "AI"
  },
  {
    id: "t5",
    title: "Smart Sales Follow-Up Workflow",
    description: "This automation runs on a daily schedule to follow up with sales leads that went cold.",
    uses: 171,
    apps: ["salesforce", "hubspot", "email"],
    category: "Automation"
  },
  {
    id: "t6",
    title: "(Whatsapp) AI-Powered Business Data Assistant",
    description: "Powered by AI, the assistant connects to your internal data warehouse to answer metrics queries.",
    uses: 138,
    apps: ["whatsapp", "database", "analytics"],
    category: "AI"
  },
  {
    id: "t7",
    title: "Instagram Auto Reply + Smart DM Responder",
    description: "Automatically respond to Instagram post comments using sentiment analysis.",
    uses: 127,
    apps: ["instagram", "ai-agent"],
    category: "Communication"
  },
  {
    id: "t8",
    title: "AI-Powered WhatsApp Lead Qualifier",
    description: "Automatically qualify inbound leads from WhatsApp using an intelligent agent and sync to CRM.",
    uses: 92,
    apps: ["whatsapp", "salesforce"],
    category: "Customer"
  }
];
