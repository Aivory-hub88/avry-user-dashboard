'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Agent } from '@/types/agents';

interface AgentConfigPanelProps {
  nodeId: string;
  agentId?: string;
  agentName?: string;
  onSave: (agentId: string, agentName: string) => void;
  onClose: () => void;
}

export function AgentConfigPanel({
  nodeId,
  agentId,
  agentName,
  onSave,
  onClose,
}: AgentConfigPanelProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(agentId || null);

  // Fetch active agents
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/agents?status=active');
        if (!res.ok) throw new Error('Failed to fetch agents');
        const data = await res.json();
        setAgents(data.agents || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchAgents();
  }, []);

  const handleSave = () => {
    if (!selectedAgentId) return;
    const selected = agents.find((a) => a.id === selectedAgentId);
    if (selected) {
      onSave(selectedAgentId, selected.name);
    }
  };

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
        }}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 1001,
          background: '#1a1a18',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12,
          padding: 24,
          maxWidth: 500,
          width: '90%',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#e8e6e3', margin: 0 }}>
            Configure Agent
          </h2>
          <p style={{ fontSize: 13, color: '#a8a6a2', margin: '4px 0 0 0' }}>
            Select an active agent for this node
          </p>
        </div>

        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ color: '#00e59e' }}
              >
                <circle cx="12" cy="12" r="10" opacity="0.3" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
            </div>
            <p style={{ fontSize: 13, color: '#a8a6a2', marginTop: 8 }}>Loading agents...</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div
            style={{
              padding: 12,
              background: 'rgba(248,113,113,0.1)',
              border: '1px solid rgba(248,113,113,0.2)',
              borderRadius: 8,
              color: '#f87171',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && agents.length === 0 && (
          <div
            style={{
              padding: 20,
              textAlign: 'center',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <p style={{ fontSize: 13, color: '#a8a6a2', margin: 0 }}>
              No active agents found
            </p>
            <p style={{ fontSize: 12, color: '#5a5a58', margin: '4px 0 0 0' }}>
              Create an agent in the{' '}
              <Link href="/agents" style={{ color: '#00e59e', textDecoration: 'none' }}>
                Agents
              </Link>{' '}
              section first
            </p>
          </div>
        )}

        {/* Agent list */}
        {!loading && !error && agents.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                maxHeight: 300,
                overflowY: 'auto',
              }}
            >
              {agents.map((agent) => (
                <label
                  key={agent.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: 12,
                    background:
                      selectedAgentId === agent.id
                        ? 'rgba(0,229,158,0.1)'
                        : 'rgba(255,255,255,0.02)',
                    border:
                      selectedAgentId === agent.id
                        ? '1px solid rgba(0,229,158,0.3)'
                        : '1px solid rgba(255,255,255,0.05)',
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (selectedAgentId !== agent.id) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedAgentId !== agent.id) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                    }
                  }}
                >
                  <input
                    type="radio"
                    name="agent"
                    value={agent.id}
                    checked={selectedAgentId === agent.id}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    style={{
                      marginTop: 2,
                      cursor: 'pointer',
                      accentColor: '#00e59e',
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: '#e8e6e3',
                        marginBottom: 2,
                      }}
                    >
                      {agent.name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: '#a8a6a2',
                        marginBottom: 4,
                      }}
                    >
                      {agent.description}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: '#5a5a58',
                        display: 'flex',
                        gap: 8,
                      }}
                    >
                      <span>{agent.model}</span>
                      <span>•</span>
                      <span>{agent.provider}</span>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Selected agent preview */}
        {selectedAgent && (
          <div
            style={{
              padding: 12,
              background: 'rgba(0,229,158,0.05)',
              border: '1px solid rgba(0,229,158,0.2)',
              borderRadius: 8,
              marginBottom: 20,
            }}
          >
            <div style={{ fontSize: 11, color: '#5a5a58', marginBottom: 4 }}>
              Selected:
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#00e59e' }}>
              {selectedAgent.name}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleSave}
            disabled={!selectedAgentId}
            style={{
              flex: 1,
              padding: '8px 16px',
              background: selectedAgentId ? '#353532' : 'rgba(53,53,50,0.5)',
              color: selectedAgentId ? '#f7f7f7' : '#5a5a58',
              border: '1px solid #666864',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 600,
              cursor: selectedAgentId ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              if (selectedAgentId) {
                e.currentTarget.style.background = '#444440';
              }
            }}
            onMouseLeave={(e) => {
              if (selectedAgentId) {
                e.currentTarget.style.background = '#353532';
              }
            }}
          >
            Save
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '8px 16px',
              background: 'rgba(255,255,255,0.05)',
              color: '#a8a6a2',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
              e.currentTarget.style.color = '#e8e6e3';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              e.currentTarget.style.color = '#a8a6a2';
            }}
          >
            Cancel
          </button>
        </div>

        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
