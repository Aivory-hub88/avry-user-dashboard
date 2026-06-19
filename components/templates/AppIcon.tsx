import { asset } from "@/lib/asset";
import React from "react";

const ICON_MAP: Record<string, string> = {
  whatsapp: "/integrations/whatsapp.svg",
  slack: "/integrations/slack.svg",
  salesforce: "/integrations/salesforce.svg",
  github: "/integrations/github.dark.svg",
  discord: "/integrations/discord.svg",
  notion: "/integrations/notion.dark.svg",
  openai: "/integrations/openAi.dark.svg",
  caption: "/integrations/markdown.dark.svg",
};

export default function AppIcon({ app }: { app: string }) {
  const iconUrl = ICON_MAP[app.toLowerCase()];
  
  if (iconUrl) {
    return (
      <img 
        src={asset(iconUrl)} 
        alt={app} 
        className="w-[22px] h-[22px] object-contain" 
      />
    );
  }

  // Use inline SVGs for the ones that don't easily map to n8n urls
  if (app.toLowerCase() === "instagram") {
    return (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#E1306C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
    );
  }

  if (app.toLowerCase() === "ai-agent") {
    return (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#e0e0e0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M8 10h.01" />
        <path d="M12 10h.01" />
        <path d="M16 10h.01" />
      </svg>
    );
  }

  if (app.toLowerCase() === "database") {
    return (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
        <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
      </svg>
    );
  }

  if (app.toLowerCase() === "analytics") {
    return (
      <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" />
        <path d="M18 17V9" />
        <path d="M13 17V5" />
        <path d="M8 17v-3" />
      </svg>
    );
  }

  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
