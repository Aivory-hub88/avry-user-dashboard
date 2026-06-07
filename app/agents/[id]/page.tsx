'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Agent, UpdateAgentRequest, AgentProvider, AgentRuntime, AgentStatus } from '@/types/agents';

const PROVIDERS: AgentProvider[] = ['openrouter', 'openai', 'anthropic', 'other'];
const RUNTIMES: AgentRuntime[] = ['zeroclaw', 'direct', 'n8n'];
const STATUSES: AgentStatus[] = ['draft', 'active', 'disabled'];
const MODELS = [
  { value: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4' },
  { value: 'anthropic/claude-3-5-haiku', label: 'Claude 3.5 Haiku' },
  { value: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B' },
  { value: 'qwen/qwen-2.5-7b-instruct', label: 'Qwen 2.5 7B' },
  { value: 'openai/gpt-4o', label: 'GPT-4o' },
  { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash' },
];

const getProviderLabel = (provider: string): string => {
  if (provider === 'zeroclaw') return 'Aivory Agent';
  if (provider === 'direct') return 'Direct (OpenRouter)';
  if (provider === 'n8n') return 'n8n Workflow';
  return provider;
};

export default function AgentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = (params?.id as string) || '';

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<UpdateAgentRequest>({});

  // Fetch agent
  useEffect(() => {
    const fetchAgent = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/agents/${id}`);
        if (!res.ok) throw new Error('Failed to fetch agent');
        const data = await res.json();
        setAgent(data);
        setFormData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    if (id) fetchAgent();
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update agent');
      }

      const updated = await res.json();
      setAgent(updated);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this agent? This action cannot be undone.')) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/agents/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete agent');
      }

      router.push('/agents');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#353531] p-8 flex items-center justify-center overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        <div className="text-center">
          <div className="inline-block animate-spin mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-[#00e59e]">
              <circle cx="12" cy="12" r="10" opacity="0.3" />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          </div>
          <p className="text-zinc-400">Loading agent...</p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-[#353531] p-8 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        <div className="max-w-2xl mx-auto overflow-x-hidden">
          <Link href="/agents" className="text-[#00e59e] hover:text-[#00f5b0] text-sm font-medium mb-4 inline-block">
            ← Back to Agents
          </Link>
          <div className="text-center py-12 bg-white/5 border border-white/10 rounded-lg">
            <p className="text-zinc-400">Agent not found</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#353531] p-8 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
      <div className="max-w-2xl mx-auto overflow-x-hidden">
        {/* Header */}
        <div className="mb-8">
          <Link href="/agents" className="text-[#00e59e] hover:text-[#00f5b0] text-sm font-medium mb-4 inline-block">
            ← Back to Agents
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-zinc-100">{agent.name}</h1>
              <p className="text-zinc-400 mt-2">{agent.description}</p>
            </div>
            <span className={`px-3 py-1 rounded-lg text-sm font-medium ${
              agent.status === 'active'
                ? 'bg-green-500/20 text-green-400'
                : agent.status === 'disabled'
                ? 'bg-red-500/20 text-red-400'
                : 'bg-yellow-500/20 text-yellow-400'
            }`}>
              {agent.status}
            </span>
          </div>
        </div>

        {/* Error state */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="bg-white/5 border border-white/10 rounded-lg p-6 space-y-6">
          {!isEditing ? (
            // View mode
            <>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">Model</p>
                  <p className="text-zinc-100">{agent.model}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">Provider</p>
                  <p className="text-zinc-100">{agent.provider}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">Runtime</p>
                  <p className="text-zinc-100">{agent.runtime}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-1">Created</p>
                  <p className="text-zinc-100">{new Date(agent.createdAt).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 flex gap-3">
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex-1 px-4 py-2 bg-[#353532] text-[#f7f7f7] font-semibold rounded-[20px] border border-[#666864] hover:bg-[#444440] transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-red-500/20 text-red-400 font-semibold rounded-lg hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </>
          ) : (
            // Edit mode
            <>
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name || ''}
                  onChange={handleChange}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-zinc-100 focus:outline-none focus:border-[#00e59e] transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-2">Description</label>
                <textarea
                  name="description"
                  value={formData.description || ''}
                  onChange={handleChange}
                  rows={3}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-zinc-100 focus:outline-none focus:border-[#00e59e] transition-colors resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Model</label>
                  <select
                    name="model"
                    value={formData.model || ''}
                    onChange={handleChange}
                    className="w-full px-3 py-2 bg-[#2E2E2A] border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-white/30 transition-colors"
                  >
                    {MODELS.map(m => (
                      <option key={m.value} value={m.value} className="bg-[#2a2a26]">
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Provider</label>
                  <select
                    name="provider"
                    value={formData.provider || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-zinc-100 focus:outline-none focus:border-[#00e59e] transition-colors"
                  >
                    {PROVIDERS.map(p => (
                      <option key={p} value={p} className="bg-[#2a2a26]">
                        {getProviderLabel(p)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Runtime</label>
                  <select
                    name="runtime"
                    value={formData.runtime || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-zinc-100 focus:outline-none focus:border-[#00e59e] transition-colors"
                  >
                    {RUNTIMES.map(r => (
                      <option key={r} value={r} className="bg-[#2a2a26]">
                        {getProviderLabel(r)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Status</label>
                  <select
                    name="status"
                    value={formData.status || ''}
                    onChange={handleChange}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-zinc-100 focus:outline-none focus:border-[#00e59e] transition-colors"
                  >
                    {STATUSES.map(s => (
                      <option key={s} value={s} className="bg-[#2a2a26]">
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 flex gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-[#353532] text-[#f7f7f7] font-semibold rounded-[20px] border border-[#666864] hover:bg-[#444440] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setFormData(agent);
                  }}
                  className="flex-1 px-4 py-2 bg-white/5 border border-white/10 text-zinc-300 font-semibold rounded-lg hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>

        {/* Info box */}
        <div className="mt-6 p-4 bg-white/5 border border-white/10 rounded-lg">
          <p className="text-sm text-zinc-400">
            <strong className="text-zinc-300">Future:</strong> Advanced configuration like custom prompts, tool definitions, and execution policies will be available in upcoming updates.
          </p>
        </div>
      </div>
    </div>
  );
}
