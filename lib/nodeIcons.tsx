import React from 'react';

export function getNodeIcon(label: string): React.ReactNode {
  const l = label?.toLowerCase() || '';

  // AI / LLM
  if (l.includes('ai') || l.includes('llm') || l.includes('agent') || l.includes('analyze') || l.includes('generate') || l.includes('aira')) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round">
        <path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 0 6h-1v1a4 4 0 0 1-8 0v-1H7a3 3 0 0 1 0-6h1V6a4 4 0 0 1 4-4z" />
        <circle cx="9" cy="10" r="1" fill="#a78bfa" />
        <circle cx="15" cy="10" r="1" fill="#a78bfa" />
      </svg>
    );
  }

  // Email / Send
  if (l.includes('email') || l.includes('send') || l.includes('mail') || l.includes('notify') || l.includes('alert')) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <polyline points="2,4 12,13 22,4" />
      </svg>
    );
  }

  // Webhook / HTTP / Trigger
  if (l.includes('webhook') || l.includes('trigger') || l.includes('http') || l.includes('request') || l.includes('capture') || l.includes('receive')) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
      </svg>
    );
  }

  // Database / Storage / Log / Update
  if (l.includes('data') || l.includes('database') || l.includes('log') || l.includes('store') || l.includes('update') || l.includes('inventory') || l.includes('record')) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth="1.5" strokeLinecap="round">
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
        <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
      </svg>
    );
  }

  // Decision / Condition / Determine / Check
  if (l.includes('decision') || l.includes('condition') || l.includes('determine') || l.includes('check') || l.includes('probability') || l.includes('if')) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round">
        <path d="M12 2l10 18H2z" />
      </svg>
    );
  }

  // Schedule / Time / Wait
  if (l.includes('schedule') || l.includes('wait') || l.includes('delay') || l.includes('time') || l.includes('cron')) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    );
  }

  // Slack / Communication
  if (l.includes('slack') || l.includes('message') || l.includes('chat') || l.includes('telegram') || l.includes('discord')) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    );
  }

  // Transform / Process / Code
  if (l.includes('transform') || l.includes('process') || l.includes('code') || l.includes('format') || l.includes('convert') || l.includes('parse')) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="1.5" strokeLinecap="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    );
  }

  // Default fallback
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}
