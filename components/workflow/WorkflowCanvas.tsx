// =============================================================================
// CANONICAL WORKFLOW CANVAS — all workflow graphs must use this component.
// Node types: standardNode (default), appNode (app drops), workflowStep (legacy n8n).
// Stylesheet: @/styles/workflow-nodes.css — single source of truth for node visuals.
// =============================================================================
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection as RFConnection,
  Background,
  Controls,
  MiniMap,
  ConnectionLineType,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
// workflow-nodes.css is imported globally in app/layout.tsx
import { StepAiraEditModal } from './StepAiraEditModal';
import { WorkflowAiraRefineModal } from './WorkflowAiraRefineModal';
import { AddWithAiraPanel } from './AddWithAiraPanel';
import { ExplainPathModal } from './ExplainPathModal';
import { AgentConfigPanel } from './AgentConfigPanel';
import { WorkflowNode } from './WorkflowNode';
import AppNode from './AppNode';
import TriggerNode from './TriggerNode';
import StandardNode from './StandardNode';
import AgentNode from './AgentNode';
import { N8NAdaptiveEdge } from './WorkflowEdges';
import NodeInspectorPanel from './inspector/NodeInspectorPanel';
import { n8nToReactFlow, reactFlowToN8n } from '@/lib/n8nMapper';
import { loadCanvasState, fetchCanvasState, useCanvasAutosave } from '@/hooks/useCanvasPersistence';
import type { WorkflowNodeData } from '@/types/workflow-node';
import type { SavedWorkflow } from '@/hooks/useWorkflows';
import type { WorkflowStep, AivoryWorkflowSpec } from '@/types/workflows';
import { detectNodeIntent } from '@/lib/workflows/nodeMapper';

type Props = {
  workflowId: string;
  isActive?: boolean;
  n8nWorkflowId?: string;
  fallbackSteps?: Array<{ step: number; action: string; tool: string; output: string; type?: string }>;
  onInjectNodes?: (inject: (nodes: Node[], edges: Edge[]) => void) => void;
};

type SyncState = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

// ── Shared header bar style — matches canvasHeader in workflows.module.css ──
const innerHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: 52,
  padding: '0 16px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  background: 'rgba(255,255,255,0.025)',
  flexShrink: 0,
  gap: 12,
};

// FIXED: STRICT MODE SAFE — removed duplicate 'border' property that caused object literal error
const pillStyle = (active: boolean): React.CSSProperties => ({
  borderRadius: 6,
  padding: '3px 9px',
  fontSize: 11,
  fontWeight: 500,
  cursor: active ? 'pointer' : 'default',
  background: active ? '#282827' : 'rgba(255,255,255,0.04)',
  color: active ? '#dddac5' : '#a8a6a2',
  border: `1px solid ${active ? '#666864' : 'rgba(255,255,255,0.06)'}`,
  transition: 'all 0.15s',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap' as const,
});

/** Normalize edges loaded from any external source to use canonical n8nAdaptive type + marker. */
function normalizeEdges(edges: Edge[], nodes?: Node[]): Edge[] {
  return edges.map((e) => ({
    ...e,
    type: 'n8nAdaptive',
    animated: false,
    markerEnd: (e.markerEnd as any) || { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#9ca3af' },
  }));
}

/**
 * Re-attach callback functions to nodes loaded from persistence (localStorage / backend).
 * Functions like onAddStep are stripped during JSON serialization — this restores them.
 */
function rehydrateNodeCallbacks(
  nodes: Node[],
  setAiraSourceStepId: (id: string) => void,
  setShowAddWithAiraPanel: (show: boolean) => void,
  setAgentConfigNodeId: (id: string) => void,
  setShowAgentConfigPanel: (show: boolean) => void,
  setExplainTargetStep: (step: WorkflowStep) => void,
  setShowExplainModal: (show: boolean) => void,
): Node[] {
  return nodes.map((n) => ({
    ...n,
    data: {
      ...n.data,
      onAddStep: () => {
        setAiraSourceStepId(n.id);
        setShowAddWithAiraPanel(true);
      },
      ...((n.data as any)?.category === 'agent' ? {
        onConfigureAgent: () => {
          setAgentConfigNodeId(n.id);
          setShowAgentConfigPanel(true);
        },
      } : {}),
      ...((n.type === 'appNode') ? {
        onExplainPath: () => {
          const step: WorkflowStep = {
            id: n.id,
            appId: (n.data as any)?.appId || '',
            actionId: '',
            connectionId: '',
            inputs: {},
            position: { x: 0, y: 0 },
            type: 'action',
          };
          setExplainTargetStep(step);
          setShowExplainModal(true);
        },
      } : {}),
    },
  }));
}

export function WorkflowCanvas({ workflowId, isActive = false, n8nWorkflowId, fallbackSteps, onInjectNodes }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<WorkflowNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [rawWorkflow, setRawWorkflow] = useState<any>(null);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isEmpty, setIsEmpty] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'canvas' | 'executions'>('canvas');
  const [executions, setExecutions] = useState<any[]>([]);
  const [execLoading, setExecLoading] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);
  // AIRA modals state
  const [showStepAiraModal, setShowStepAiraModal] = useState(false);
  const [stepAiraIndex, setStepAiraIndex] = useState<number | null>(null);
  const [showWorkflowAiraModal, setShowWorkflowAiraModal] = useState(false);
  const [currentWorkflow, setCurrentWorkflow] = useState<SavedWorkflow | null>(null);
  const [airaLoading, setAiraLoading] = useState(false);
  // Add with Aivory panel state
  const [showAddWithAiraPanel, setShowAddWithAiraPanel] = useState(false);
  const [airaSourceStepId, setAiraSourceStepId] = useState<string | null>(null);
  // Explain path modal state
  const [showExplainModal, setShowExplainModal] = useState(false);
  const [explainTargetStep, setExplainTargetStep] = useState<WorkflowStep | null>(null);
  // Agent config panel state
  const [showAgentConfigPanel, setShowAgentConfigPanel] = useState(false);
  const [agentConfigNodeId, setAgentConfigNodeId] = useState<string | null>(null);

  /** Re-attach callbacks lost during JSON serialization (localStorage / backend). */
  const rehydrate = useCallback((loadedNodes: Node[]): Node<WorkflowNodeData>[] => {
    return rehydrateNodeCallbacks(
      loadedNodes,
      setAiraSourceStepId,
      setShowAddWithAiraPanel,
      setAgentConfigNodeId,
      setShowAgentConfigPanel,
      setExplainTargetStep,
      setShowExplainModal,
    ) as Node<WorkflowNodeData>[];
  }, []);

  // ── Listen for edit-node events from BaseWorkflowNode edit button ──
  useEffect(() => {
    const handler = (e: Event) => {
      const nodeId = (e as CustomEvent).detail?.nodeId;
      if (nodeId) { setSelectedNodeId(nodeId); setInspectorOpen(true); }
    };
    window.addEventListener('aivory:edit-node', handler);
    return () => window.removeEventListener('aivory:edit-node', handler);
  }, []);

  // ── Connect handler ──────────────────────────────────────
  const onConnect = useCallback(
    (params: RFConnection) => setEdges((eds) => addEdge({
      ...params,
      animated: false,
      type: 'n8nAdaptive',
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#9ca3af' },
    }, eds)),
    [setEdges]
  );

  // ── Inject nodes from outside (Aivory generation) ──────────
  useEffect(() => {
    if (!onInjectNodes) return;
    onInjectNodes((newNodes: Node[], newEdges: Edge[]) => {
      setNodes((nds) => {
        const offsetY = nds.length > 0 ? (nds.length * 160) : 0;
        const positioned = newNodes.map((n, i) => ({
          ...n,
          position: { x: 0, y: offsetY + i * 160 },
        })) as Node<WorkflowNodeData>[];
        return [...nds, ...rehydrate(positioned)];
      });
      setEdges((eds) => [...eds, ...normalizeEdges(newEdges)]);
      setIsEmpty(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onInjectNodes]);

  // ── Drag and drop support ────────────────────────────────
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      // ── Standard node drop ──────────────────────────────
      const stdData = event.dataTransfer.getData('application/aivory-standard-node');
      if (stdData) {
        try {
          const nodeDef = JSON.parse(stdData);
          const reactFlowBounds = (event.target as HTMLElement).getBoundingClientRect();
          const position = {
            x: event.clientX - reactFlowBounds.left,
            y: event.clientY - reactFlowBounds.top,
          };
          const newId = `std-${Date.now()}`;

          // Handle agent node type specially
          if (nodeDef.type === 'agent') {
            const newNode: Node<WorkflowNodeData> = {
              id: newId,
              type: 'standardNode',
              position,
              data: {
                label: nodeDef.label,
                category: 'agent',
                title: nodeDef.label,
                agentId: undefined,
                agentName: undefined,
                onConfigureAgent: () => {
                  setAgentConfigNodeId(newId);
                  setShowAgentConfigPanel(true);
                },
                onAddStep: () => {
                  setAiraSourceStepId(newId);
                  setShowAddWithAiraPanel(true);
                },
              } as any,
            };
            setNodes((nds) => [...nds, newNode]);
          } else {
            const newNode: Node<WorkflowNodeData> = {
              id: newId,
              type: 'standardNode',
              position,
              data: {
                label: nodeDef.label,
                icon: nodeDef.icon,
                category: nodeDef.category,
                title: nodeDef.label,
                onAddStep: () => {
                  setAiraSourceStepId(newId);
                  setShowAddWithAiraPanel(true);
                },
              } as any,
            };
            setNodes((nds) => [...nds, newNode]);
          }
        } catch (err) {
          console.error('[onDrop standard]', err);
        }
        return;
      }

      // ── Dynamic node drop ──────────────────────────────
      const nodeData = event.dataTransfer.getData('application/aivory-node');
      if (nodeData) {
        try {
          const nodeDef = JSON.parse(nodeData);
          const reactFlowBounds = (event.target as HTMLElement).getBoundingClientRect();
          const position = {
            x: event.clientX - reactFlowBounds.left,
            y: event.clientY - reactFlowBounds.top,
          };
          const newId = `node-${Date.now()}`;
          const newNode: Node<WorkflowNodeData> = {
            id: newId,
            type: 'standardNode',
            position,
            data: {
              label: nodeDef.label,
              icon: nodeDef.type, // Use type as icon key for now
              category: nodeDef.category,
              title: nodeDef.label,
              description: nodeDef.description,
              color: nodeDef.color,
              onAddStep: () => {
                setAiraSourceStepId(newId);
                setShowAddWithAiraPanel(true);
              },
            } as any,
          };
          setNodes((nds) => [...nds, newNode]);
        } catch (err) {
          console.error('[onDrop dynamic]', err);
        }
        return;
      }

      // ── App node drop ───────────────────────────────────
      const appData = event.dataTransfer.getData('application/aivory-app');
      if (!appData) return;

      try {
        const app = JSON.parse(appData);
        const reactFlowBounds = (event.target as HTMLElement).getBoundingClientRect();
        const position = {
          x: event.clientX - reactFlowBounds.left,
          y: event.clientY - reactFlowBounds.top,
        };

        // Extract app name - handle both direct name and nested structure
        const appName = app.name || app.title || 'App';
        const appIcon = app.icon || '';
        const iconPath = app.iconPath || '';
        const appId = app.id || `app-${Date.now()}`;

        // FIXED: Capture node ID at creation time to use in callbacks
        const nodeId = `app-${Date.now()}`;

        // Create new app node with workflow builder
        const newNode: Node<WorkflowNodeData> = {
          id: nodeId,
          type: 'appNode',
          position,
          data: {
            title: appName,
            label: appName,
            category: 'app',
            appName: appName,
            appIcon: appIcon,
            iconPath: iconPath,
            appId: appId,
            action: undefined,
            connectionId: undefined,
            connectionName: undefined,
            onAddStep: () => {
              setAiraSourceStepId(nodeId);
              setShowAddWithAiraPanel(true);
            },
            onExplainPath: () => {
              const step: WorkflowStep = {
                id: nodeId,
                appId: appId,
                actionId: '',
                connectionId: '',
                inputs: {},
                position: { x: 0, y: 0 },
                type: 'action',
              };
              setExplainTargetStep(step);
              setShowExplainModal(true);
            },
          } as any,
        };

        setNodes((nds) => [...nds, newNode]);
      } catch (err) {
        console.error('[onDrop]', err);
      }
    },
    [setNodes]
  );

  // ── Fetch workflow ───────────────────────────────────────
  const applyFallbackSteps = useCallback((steps: NonNullable<Props['fallbackSteps']>) => {
    if (steps.length > 0) {
      const iconMap: Record<string, string> = {
        ingestion: 'http', ai_processing: 'code', decision: 'branch',
        execution: 'edit', notification: 'respond', human_review: 'manual',
      };
      const categoryMap: Record<string, WorkflowNodeData['category']> = {
        ingestion: 'action', ai_processing: 'ai', decision: 'condition',
        execution: 'action', notification: 'channel', human_review: 'system',
      };
      const rfNodes = steps.map((s, i) => ({
        id: `step-${i}`,
        type: 'standardNode' as const,
        position: { x: 0, y: i * 160 },
        data: {
          label: s.action || `Step ${i + 1}`,
          icon: iconMap[s.type || ''] ?? 'http',
          category: categoryMap[s.type || ''] ?? 'action',
          title: s.action || `Step ${i + 1}`,
          description: s.output || s.tool || '',
        } as WorkflowNodeData,
      }));
      const rfEdges = steps.slice(0, -1).map((_, i) => ({
        id: `e-${i}-${i + 1}`,
        source: `step-${i}`,
        target: `step-${i + 1}`,
        animated: false,
        type: 'n8nAdaptive' as const,
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#9ca3af' },
      }));
      setNodes(rehydrate(rfNodes));
      setEdges(normalizeEdges(rfEdges, rfNodes));
      setIsEmpty(false);
    } else {
      setIsEmpty(true);
    }
    setSyncState('idle');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setNodes, setEdges, rehydrate]);

  useEffect(() => {
    if (!isActive) {
      // ── Load order: backend → localStorage → fallbackSteps ──
      let cancelled = false;
      const loadLocal = () => {
        const persisted = loadCanvasState(workflowId);
        if (persisted && persisted.nodes.length > 0) {
          setNodes(rehydrate(persisted.nodes) as Node<WorkflowNodeData>[]);
          setEdges(normalizeEdges(persisted.edges, persisted.nodes));
          setIsEmpty(false);
          setSyncState('idle');
          return true;
        }
        return false;
      };

      // Optimistic: show localStorage immediately while backend loads
      loadLocal();

      fetchCanvasState(workflowId).then((remote) => {
        if (cancelled) return;
        if (remote && remote.nodes.length > 0) {
          setNodes(rehydrate(remote.nodes) as Node<WorkflowNodeData>[]);
          setEdges(normalizeEdges(remote.edges, remote.nodes));
          setIsEmpty(false);
          setSyncState('idle');
          return;
        }
        // Backend had nothing — fall through to fallbackSteps if localStorage also empty
        if (!loadLocal()) {
          const steps = Array.isArray(fallbackSteps) ? fallbackSteps : [];
          applyFallbackSteps(steps);
        }
      }).catch(() => {
        if (cancelled) return;
        if (!loadLocal()) {
          const steps = Array.isArray(fallbackSteps) ? fallbackSteps : [];
          applyFallbackSteps(steps);
        }
      });

      return () => { cancelled = true; };
    }

    const fetchId = n8nWorkflowId || workflowId;
    if (!fetchId) return;
    let cancelled = false;

    const load = async () => {
      setSyncState('loading');
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/n8n/workflow/${fetchId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const wf = await res.json();
        if (cancelled) return;
        setRawWorkflow(wf);
        if (!wf.nodes || wf.nodes.length === 0) {
          setNodes([]); setEdges([]); setIsEmpty(true); setSyncState('idle'); return;
        }
        const { nodes: rfNodes, edges: rfEdges } = n8nToReactFlow(wf);
        setNodes(rehydrate(rfNodes) as any); setEdges(normalizeEdges(rfEdges, rfNodes)); setIsEmpty(false); setSyncState('idle');
      } catch (err: any) {
        if (!cancelled) { setErrorMsg(err?.message ?? 'Failed to load workflow'); setSyncState('error'); }
      }
    };
    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, n8nWorkflowId, workflowId, JSON.stringify(fallbackSteps)]);

  // ── Save to n8n ──────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!rawWorkflow || !isActive) return;
    const saveId = n8nWorkflowId || workflowId;
    setSyncState('saving'); setErrorMsg(null);
    try {
      const payload = reactFlowToN8n(nodes, edges, rawWorkflow);
      const res = await fetch(`/api/n8n/workflow/${saveId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || body?.error || `HTTP ${res.status}`);
      }
      const updated = await res.json();
      setRawWorkflow(updated); setSyncState('saved');
      setTimeout(() => setSyncState('idle'), 1500);
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Save failed'); setSyncState('error');
    }
  }, [rawWorkflow, nodes, edges, workflowId]);

  const handleInspectorChange = useCallback(
    (nodeId: string, updates: Partial<WorkflowNodeData>) => {
      setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n));
    },
    [setNodes]
  );

  const handleInspectorDelete = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNodeId(null);
      setInspectorOpen(false);
    },
    [setNodes, setEdges]
  );

  const loadExecutions = useCallback(async () => {
    const fetchId = n8nWorkflowId || workflowId;
    setExecLoading(true); setExecError(null);
    try {
      const res = await fetch(`/api/n8n/workflow/${fetchId}/executions?limit=20`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setExecutions(data.data || []);
    } catch (err: any) {
      setExecError(err?.message ?? 'Failed to load executions');
    } finally {
      setExecLoading(false);
    }
  }, [n8nWorkflowId, workflowId]);

  const nodeTypes = useMemo(() => ({
    standardNode:  WorkflowNode as any,
    appNode:       WorkflowNode as any,
    agentNode:     WorkflowNode as any,
    workflowStep:  WorkflowNode as any,
    triggerNode:   WorkflowNode as any,
    agent:         WorkflowNode as any,
    // Legacy fallbacks
    appNodeLegacy: AppNode as any,
    standardNodeLegacy: StandardNode as any,
  }), []);
  const defaultEdgeOptions = useMemo(() => ({
    type: 'n8nAdaptive' as const,
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#9ca3af' },
  }), []);
  const edgeTypes = useMemo(() => ({
    n8nAdaptive: N8NAdaptiveEdge,
    // Legacy type fallbacks — all route through N8NAdaptiveEdge
    curved: N8NAdaptiveEdge,
    angular: N8NAdaptiveEdge,
    default: N8NAdaptiveEdge,
    smoothstep: N8NAdaptiveEdge,
    straight: N8NAdaptiveEdge,
    step: N8NAdaptiveEdge,
    simplebezier: N8NAdaptiveEdge,
  }), []);
  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);

  // ── Auto-save canvas to localStorage for non-n8n workflows ──
  useCanvasAutosave(workflowId, nodes, edges, !isActive);

  const syncLabel =
    syncState === 'loading' ? 'Loading…' :
    syncState === 'saving'  ? 'Saving…' :
    syncState === 'saved'   ? 'Saved' :
    syncState === 'error'   ? `Error: ${errorMsg}` : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* ── Inner canvas header bar ── */}
      <div style={innerHeaderStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          {/* Sync status */}
          {syncLabel && (
            <span style={{ fontSize: 11, color: syncState === 'error' ? '#f87171' : syncState === 'saved' ? '#dddac5' : '#5a5a58', whiteSpace: 'nowrap' }}>
              {syncLabel}
            </span>
          )}
          {/* Mode pill — neutral, not high-contrast */}
          {!isActive && (
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 5,
              background: 'rgba(255,255,255,0.04)', color: '#a8a6a2',
              border: '1px solid rgba(255,255,255,0.07)', letterSpacing: '0.2px', whiteSpace: 'nowrap',
            }}>
              Preview
            </span>
          )}
          {/* Tab pills */}
          <div style={{ display: 'flex', gap: 4, marginLeft: 4 }}>
            <button type="button" style={pillStyle(activeTab === 'canvas')} onClick={() => setActiveTab('canvas')}>
              Canvas
            </button>
            <button
              type="button"
              style={{ ...pillStyle(activeTab === 'executions'), opacity: !isActive ? 0.4 : 1, cursor: !isActive ? 'not-allowed' : 'pointer' }}
              onClick={() => { if (!isActive) return; setActiveTab('executions'); if (!executions.length) loadExecutions(); }}
              title={!isActive ? 'Available after activation' : undefined}
            >
              Execution Logs
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isActive && (
            <>
              <button
                type="button"
                onClick={() => {
                  const workflowData: SavedWorkflow = {
                    workflow_id: workflowId,
                    title: 'Workflow',
                    trigger: 'Manual',
                    steps: nodes.map((n, i) => ({
                      step: i + 1,
                      action: n.data?.title || `Step ${i + 1}`,
                      tool: n.data?.subtitle || '',
                      output: n.data?.description || '',
                    })),
                    integrations: [],
                    status: 'draft',
                    source: 'n8n',
                    company_name: '',
                    created_at: new Date().toISOString(),
                    estimated_time: '0',
                    automation_percentage: '0',
                  }
                  setCurrentWorkflow(workflowData)
                  setShowWorkflowAiraModal(true)
                }}
                disabled={airaLoading || isEmpty}
                style={{
                  borderRadius: 7, background: '#282827', padding: '5px 14px',
                  fontSize: 11, fontWeight: 600, color: '#dddac5',
                  border: '1px solid #666864', cursor: airaLoading || isEmpty ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  opacity: (airaLoading || isEmpty) ? 0.5 : 1,
                  transition: 'all 0.15s',
                }}
                title={isEmpty ? 'Add steps to refine workflow' : 'Refine workflow with Aivory'}
              >
                Refine with Aivory
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={syncState === 'saving' || syncState === 'loading'}
                style={{
                  borderRadius: 7, background: '#282827', padding: '5px 14px',
                  fontSize: 11, fontWeight: 600, color: '#dddac5',
                  border: '1px solid #666864', cursor: 'pointer', fontFamily: 'inherit',
                  opacity: (syncState === 'saving' || syncState === 'loading') ? 0.5 : 1,
                  transition: 'all 0.15s',
                }}
              >
                Save changes
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Canvas */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
          {/* ── Inspector toggle button — right edge ── */}
          <button
            type="button"
            onClick={() => setInspectorOpen((prev) => !prev)}
            title={inspectorOpen ? 'Close panel' : 'Open panel'}
            aria-label={inspectorOpen ? 'Close inspector panel' : 'Open inspector panel'}
            style={{
              position: 'absolute',
              right: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 10,
              width: 20,
              height: 48,
              background: 'var(--surface-secondary, #353531)',
              border: '1px solid var(--border-subtle, rgba(255,255,255,0.07))',
              borderRight: 'none',
              borderRadius: '6px 0 0 6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--text-secondary, #a8a6a2)',
              transition: 'background 0.15s ease, color 0.15s ease',
              padding: 0,
              fontFamily: 'inherit',
              fontSize: 14,
              lineHeight: 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--surface-tertiary, #262520)';
              e.currentTarget.style.color = 'var(--text-primary, #e8e6e3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--surface-secondary, #353531)';
              e.currentTarget.style.color = 'var(--text-secondary, #a8a6a2)';
            }}
          >
            {inspectorOpen ? '›' : '‹'}
          </button>
          {activeTab === 'canvas' ? (
            <div style={{ position: 'absolute', inset: 0 }}>
              {syncState === 'loading' ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 13, color: '#a8a6a2' }}>Loading workflow…</span>
                </div>
              ) : syncState === 'error' ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 13, color: '#f87171', marginBottom: 8 }}>
                      {errorMsg?.includes('502') || errorMsg?.includes('404')
                        ? 'Workflow graph not available in preview mode'
                        : errorMsg}
                    </p>
                    {!errorMsg?.includes('502') && !errorMsg?.includes('404') && (
                      <button onClick={() => window.location.reload()} style={{ fontSize: 11, color: '#a8a6a2', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              ) : isEmpty ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 13, color: '#a8a6a2', marginBottom: 4 }}>This workflow has no steps yet</p>
                    <p style={{ fontSize: 11, color: '#5a5a58' }}>Edit the workflow to add nodes.</p>
                  </div>
                </div>
              ) : (
                <ReactFlow
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  defaultEdgeOptions={defaultEdgeOptions}
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  nodesConnectable
                  deleteKeyCode={['Delete', 'Backspace']}
                  onNodeClick={(_, node) => {
                    // Single click: select only, do NOT open inspector
                  }}
                  onNodeDoubleClick={(_, node) => {
                    setSelectedNodeId(node.id);
                    setInspectorOpen(true);
                  }}
                  onPaneClick={() => { setSelectedNodeId(null); setInspectorOpen(false); }}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  connectionLineType={ConnectionLineType.Bezier}
                  proOptions={{ hideAttribution: true }}
                  fitView
                  fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
                >
                  <Background color="rgba(255,255,255,0.06)" gap={24} size={1} />
                  <Controls />
                  <MiniMap
                    pannable
                    zoomable
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8 }}
                    maskColor="rgba(0,0,0,0.4)"
                    nodeColor="rgba(255,255,255,0.08)"
                  />
                </ReactFlow>
              )}
            </div>
          ) : (
            <div style={{ height: '100%', overflowY: 'auto', padding: 16 }}>
              {execLoading ? (
                <p style={{ fontSize: 13, color: '#a8a6a2' }}>Loading executions…</p>
              ) : execError ? (
                <p style={{ fontSize: 13, color: '#f87171' }}>{execError}</p>
              ) : executions.length === 0 ? (
                <p style={{ fontSize: 13, color: '#a8a6a2' }}>No executions found.</p>
              ) : (
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      {['ID', 'Status', 'Started', 'Stopped'].map(h => (
                        <th key={h} style={{ padding: '6px 12px', textAlign: 'left', color: '#5a5a58', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {executions.map((exec: any) => (
                      <tr key={exec.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '7px 12px', fontFamily: 'monospace', fontSize: 11, color: '#a8a6a2' }}>{exec.id}</td>
                        <td style={{ padding: '7px 12px' }}>
                          <span style={{
                            display: 'inline-block', borderRadius: 5, padding: '2px 8px', fontSize: 10, fontWeight: 600,
                            background: exec.status === 'success' ? '#282827' : exec.status === 'error' ? 'rgba(248,113,113,0.1)' : 'rgba(251,191,36,0.1)',
                            color: exec.status === 'success' ? '#dddac5' : exec.status === 'error' ? '#f87171' : '#fbbf24',
                            border: `1px solid ${exec.status === 'success' ? '#666864' : exec.status === 'error' ? 'rgba(248,113,113,0.2)' : 'rgba(251,191,36,0.2)'}`,
                          }}>
                            {exec.status}
                          </span>
                        </td>
                        <td style={{ padding: '7px 12px', fontSize: 11, color: '#a8a6a2' }}>{new Date(exec.startedAt || exec.startTime).toLocaleString()}</td>
                        <td style={{ padding: '7px 12px', fontSize: 11, color: '#a8a6a2' }}>{exec.stoppedAt || exec.endTime ? new Date(exec.stoppedAt || exec.endTime).toLocaleString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

      </div>

      {/* ── Node Inspector Panel ── */}
      {inspectorOpen && (
        <NodeInspectorPanel
          selectedNode={selectedNode}
          onChange={handleInspectorChange}
          onDelete={handleInspectorDelete}
          onClose={() => { setSelectedNodeId(null); setInspectorOpen(false); }}
        />
      )}

      {/* ── AIRA Modals ── */}
      {showWorkflowAiraModal && currentWorkflow && (
        <WorkflowAiraRefineModal
          workflow={currentWorkflow}
          onClose={() => setShowWorkflowAiraModal(false)}
          onApply={(updatedWorkflow) => {
            // Update nodes and edges based on updated workflow
            const updatedNodes = updatedWorkflow.steps.map((step, i) => {
              const intentToIcon: Record<string, string> = {
                email: 'mail', messaging: 'send', http: 'http', respond: 'respond',
                filter: 'branch', transform: 'edit', schedule: 'schedule', ai: 'sparkles',
              }
              const intent = detectNodeIntent(step.action || '', step.tool || '')
              return {
              id: `step-${i}`,
              type: 'standardNode' as const,
              position: { x: 0, y: i * 160 },
              data: {
                label: step.action || `Step ${i + 1}`,
                title: step.action || `Step ${i + 1}`,
                subtitle: step.tool || undefined,
                description: step.output || undefined,
                category: 'action' as const,
                icon: intentToIcon[intent] ?? 'http',
              } as WorkflowNodeData,
            }
            })
            const updatedEdges = updatedNodes.slice(0, -1).map((_, i) => ({
              id: `e-${i}-${i + 1}`,
              source: `step-${i}`,
              target: `step-${i + 1}`,
              animated: false,
              type: 'n8nAdaptive' as const,
              markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#9ca3af' },
            }))
            setNodes(updatedNodes)
            setEdges(normalizeEdges(updatedEdges, updatedNodes))
            setShowWorkflowAiraModal(false)
          }}
        />
      )}

      {/* ── Add with Aivory Panel ── */}
      {showAddWithAiraPanel && airaSourceStepId && nodes.find(n => n.id === airaSourceStepId) && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowAddWithAiraPanel(false)} />
          <div style={{ position: 'relative', zIndex: 1001 }}>
            <AddWithAiraPanel
              workflow={rawWorkflow}
              sourceStep={nodes.find(n => n.id === airaSourceStepId)?.data as any}
              onApply={(result) => {
                // Add new steps and edges to canvas
                const newSteps = result.newSteps.map((step, i) => ({
                  id: `${airaSourceStepId}-ext-${i}`,
                  type: 'appNode' as const,
                  position: { x: 0, y: (i + 1) * 180 },
                  data: {
                    title: step.actionId,
                    category: 'app' as const,
                    appName: step.appId,
                    appIcon: '',
                    appId: step.appId,
                    action: step.actionId,
                    connectionId: step.connectionId,
                    connectionName: step.connectionId,
                    onAddStep: () => {
                      setAiraSourceStepId(`${airaSourceStepId}-ext-${i}`);
                      setShowAddWithAiraPanel(true);
                    },
                  } as any,
                }));
                const newEdges = result.newEdges.map((edge, i) => ({
                  id: `e-${edge.from}-${edge.to}`,
                  source: edge.from,
                  target: edge.to,
                  animated: false,
                  type: 'n8nAdaptive' as const,
                  markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#9ca3af' },
                }));
                setNodes((nds) => [...nds, ...newSteps]);
                setEdges((eds) => [...eds, ...normalizeEdges(newEdges, newSteps)]);
                setShowAddWithAiraPanel(false);
              }}
              onCancel={() => setShowAddWithAiraPanel(false)}
              onManualAdd={() => {
                // TODO: Open manual step addition UI
                setShowAddWithAiraPanel(false);
              }}
            />
          </div>
        </div>
      )}

      {/* ── Explain Path Modal ── */}
      {showExplainModal && explainTargetStep && rawWorkflow && (
        <ExplainPathModal
          workflow={rawWorkflow as AivoryWorkflowSpec}
          targetStep={explainTargetStep}
          onClose={() => {
            setShowExplainModal(false);
            setExplainTargetStep(null);
          }}
        />
      )}

      {/* ── Agent Config Panel ── */}
      {showAgentConfigPanel && agentConfigNodeId && (
        <AgentConfigPanel
          nodeId={agentConfigNodeId}
          agentId={nodes.find(n => n.id === agentConfigNodeId)?.data?.agentId}
          agentName={nodes.find(n => n.id === agentConfigNodeId)?.data?.agentName}
          onSave={(agentId, agentName) => {
            setNodes((nds) =>
              nds.map((n) =>
                n.id === agentConfigNodeId
                  ? {
                      ...n,
                      data: {
                        ...n.data,
                        agentId,
                        agentName,
                      },
                    }
                  : n
              )
            );
            setShowAgentConfigPanel(false);
            setAgentConfigNodeId(null);
          }}
          onClose={() => {
            setShowAgentConfigPanel(false);
            setAgentConfigNodeId(null);
          }}
        />
      )}
    </div>
  );
}
