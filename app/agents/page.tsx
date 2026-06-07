'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Agent } from '@/types/agents';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/agents');
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

  return (
    <div className="min-h-screen bg-[#353531] p-8 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
      <div className="max-w-6xl mx-auto overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-zinc-100 mb-2">Agents</h1>
            <p className="text-zinc-400">Configure and manage AI agents for your workflows</p>
          </div>
          <Link
            href="/agents/new"
            className="btn-style-a"
          >
            + New Agent
          </Link>
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#00e59e]">
                <circle cx="12" cy="12" r="10" opacity="0.3" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
            </div>
            <p className="text-zinc-400 mt-2">Loading agents...</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && agents.length === 0 && (
          <div className="text-center py-12 bg-white/5 border border-white/10 rounded-lg">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="mx-auto text-zinc-500 mb-4">
              <circle cx="12" cy="12" r="1" />
              <path d="M12 1v6m0 6v6" />
              <path d="M4.22 4.22l4.24 4.24m5.08 5.08l4.24 4.24" />
              <path d="M1 12h6m6 0h6" />
              <path d="M4.22 19.78l4.24-4.24m5.08-5.08l4.24-4.24" />
            </svg>
            <p className="text-zinc-400 mb-4">No agents yet</p>
            <Link
              href="/agents/new"
              className="inline-block btn-style-b"
            >
              Create your first agent
            </Link>
          </div>
        )}

        {/* Agents table */}
        {!loading && agents.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02]">
                  <th className="px-6 py-3 text-left text-sm font-semibold text-zinc-300">Name</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-zinc-300">Model</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-zinc-300">Provider</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-zinc-300">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-zinc-300">Updated</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-zinc-300">Action</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                    <td className="px-6 py-4">
                      <Link
                        href={`/agents/${agent.id}`}
                        className="text-[#00e59e] hover:text-[#00f5b0] font-medium"
                      >
                        {agent.name}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-zinc-400 text-sm">{agent.model}</td>
                    <td className="px-6 py-4 text-zinc-400 text-sm">{agent.provider}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        agent.status === 'active'
                          ? 'bg-green-500/20 text-green-400'
                          : agent.status === 'disabled'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {agent.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-zinc-400 text-sm">
                      {new Date(agent.updatedAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/agents/${agent.id}`}
                        className="text-zinc-400 hover:text-zinc-100 text-sm font-medium"
                      >
                        Edit →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
