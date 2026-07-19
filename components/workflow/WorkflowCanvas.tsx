// =============================================================================
// CANONICAL WORKFLOW CANVAS — all workflow graphs must use this component.
// Node types: standardNode (default), appNode (app drops), workflowStep (legacy n8n).
// Stylesheet: @/styles/workflow-nodes.css — single source of truth for node visuals.
// =============================================================================
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection as RFConnection,
  type ReactFlowInstance,
  Background,
  Controls,
  MiniMap,
  ConnectionLineType,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
// workflow-nodes.css is imported globally in app/layout.tsx
import { StepCopilotEditModal } from './StepCopilotEditModal';
import { WorkflowCopilotRefineModal } from './WorkflowCopilotRefineModal';
import { AddWithCopilotPanel } from './AddWithCopilotPanel';
import { ExplainPathModal } from './ExplainPathModal';
import { AgentConfigPanel } from './AgentConfigPanel';
import { WorkflowNode } from './WorkflowNode';
import AppNode from './AppNode';
import TriggerNode from './TriggerNode';
import StandardNode from './StandardNode';
import AgentNode from './AgentNode';
import { N8NAdaptiveEdge, AiSubConnectionEdge } from './WorkflowEdges';
import NodeInspectorPanel from './inspector/NodeInspectorPanel';
import { n8nToReactFlow, reactFlowToN8n } from '@/lib/n8nMapper';
import { loadCanvasState, fetchCanvasState, useCanvasAutosave } from '@/hooks/useCanvasPersistence';
import type { WorkflowNodeData } from '@/types/workflow-node';
import type { SavedWorkflow } from '@/hooks/useWorkflows';
import type { WorkflowStep, AivoryWorkflowSpec } from '@/types/workflows';
import { detectNodeIntent } from '@/lib/workflows/nodeMapper';
import { asset } from '@/lib/asset'

type Props = {
  workflowId: string;
  isActive?: boolean;
  n8nWorkflowId?: string;
  fallbackSteps?: Array<{ step: number; action: string; tool: string; output: string; type?: string }>;
  onInjectNodes?: (inject: (nodes: Node[], edges: Edge[]) => void) => void;
  onHistoryChange?: (canUndo: boolean) => void;
  registerUndo?: (undoFn: () => void) => void;
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

/** Normalize edges loaded from any external source to use canonical n8nAdaptive type + marker.
 * `aiSubConnection` edges (LangChain Chat Model/Memory/Tool -> Agent) are left
 * alone — they're not part of the main flow and use their own styling. */
function normalizeEdges(edges: Edge[], nodes?: Node[]): Edge[] {
  return edges.map((e) => {
    if (e.type === 'aiSubConnection') return e;
    return {
      ...e,
      type: 'n8nAdaptive',
      animated: false,
      markerEnd: (e.markerEnd as any) || { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#9ca3af' },
    };
  });
}

/**
 * Re-attach callback functions to nodes loaded from persistence (localStorage / backend).
 * Functions like onAddStep are stripped during JSON serialization — this restores them.
 */
function rehydrateNodeCallbacks(
  nodes: Node[],
  setCopilotSourceStepId: (id: string) => void,
  setShowAddWithCopilotPanel: (show: boolean) => void,
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
        setCopilotSourceStepId(n.id);
        setShowAddWithCopilotPanel(true);
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

export function WorkflowCanvas({ workflowId, isActive = false, n8nWorkflowId, fallbackSteps, onInjectNodes, onHistoryChange, registerUndo }: Props) {
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
  // Aivory modals state
  const [showStepCopilotModal, setShowStepCopilotModal] = useState(false);
  const [stepCopilotIndex, setStepCopilotIndex] = useState<number | null>(null);
  const [showWorkflowCopilotModal, setShowWorkflowCopilotModal] = useState(false);
  const [currentWorkflow, setCurrentWorkflow] = useState<SavedWorkflow | null>(null);
  const [copilotLoading, setCopilotLoading] = useState(false);
  // Add with Aivory panel state
  const [showAddWithCopilotPanel, setShowAddWithCopilotPanel] = useState(false);
  const [copilotSourceStepId, setCopilotSourceStepId] = useState<string | null>(null);
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
      setCopilotSourceStepId,
      setShowAddWithCopilotPanel,
      setAgentConfigNodeId,
      setShowAgentConfigPanel,
      setExplainTargetStep,
      setShowExplainModal,
    ) as Node<WorkflowNodeData>[];
  }, []);

  // ── History tracking ─────────────────────────────────────
  const [past, setPast] = useState<{nodes: Node<WorkflowNodeData>[], edges: Edge[]}[]>([]);

  // NOTE: notify the parent (onHistoryChange) outside the setPast updater —
  // React runs updaters during render, so setState calls inside them trigger
  // "Cannot update a component while rendering a different component".
  const pushHistory = useCallback((currentNodes: Node<WorkflowNodeData>[], currentEdges: Edge[]) => {
    setPast(p => [...p.slice(-19), { nodes: currentNodes, edges: currentEdges }]);
    if (onHistoryChange) onHistoryChange(true);
  }, [onHistoryChange]);

  const popHistory = useCallback(() => {
    if (past.length === 0) return;
    const last = past[past.length - 1];
    const newPast = past.slice(0, -1);

    setPast(newPast);
    setNodes(rehydrate(last.nodes));
    setEdges(normalizeEdges(last.edges, last.nodes));

    if (onHistoryChange) onHistoryChange(newPast.length > 0);
  }, [past, setNodes, setEdges, rehydrate, onHistoryChange]);

  useEffect(() => {
    if (registerUndo) registerUndo(popHistory);
  }, [registerUndo, popHistory]);

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
    (params: RFConnection) => {
      pushHistory(nodes, edges);
      setEdges((eds) => addEdge({
        ...params,
        animated: false,
        type: 'n8nAdaptive',
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#9ca3af' },
      }, eds));
    },
    [setEdges, pushHistory, nodes, edges]
  );

  // ── Inject nodes from outside (Aivory generation) ──────────
  useEffect(() => {
    if (!onInjectNodes) return;
    onInjectNodes((newNodes: Node[], newEdges: Edge[]) => {
      pushHistory(nodes, edges);
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
  const rfInstanceRef = useRef<ReactFlowInstance<Node<WorkflowNodeData>, Edge> | null>(null);

  // Map StandardNodePalette iconKeys to real n8n node types so dropped nodes
  // get a typed config (inspector forms + setup copilot checklist).
  const STANDARD_ICON_TO_N8N: Record<string, string> = {
    webhook: 'n8n-nodes-base.webhook',
    schedule: 'n8n-nodes-base.scheduleTrigger',
    manual: 'n8n-nodes-base.manualTrigger',
    branch: 'n8n-nodes-base.if',
    edit: 'n8n-nodes-base.set',
    http: 'n8n-nodes-base.httpRequest',
    respond: 'n8n-nodes-base.respondToWebhook',
  };

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // Convert a drop event's screen coordinates to flow coordinates.
  // Falls back to coordinates relative to the drop container when the
  // ReactFlow instance isn't mounted yet (empty-canvas state).
  const dropPosition = useCallback((event: React.DragEvent) => {
    const instance = rfInstanceRef.current;
    if (instance) {
      return instance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    }
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      // ── Standard node drop ──────────────────────────────
      const stdData = event.dataTransfer.getData('application/aivory-standard-node');
      if (stdData) {
        pushHistory(nodes, edges);
        try {
          const nodeDef = JSON.parse(stdData);
          const position = dropPosition(event);
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
                  setCopilotSourceStepId(newId);
                  setShowAddWithCopilotPanel(true);
                },
              } as any,
            };
            setNodes((nds) => [...nds, newNode]);
          } else {
            const n8nType = STANDARD_ICON_TO_N8N[nodeDef.icon];
            const newNode: Node<WorkflowNodeData> = {
              id: newId,
              type: 'standardNode',
              position,
              data: {
                label: nodeDef.label,
                icon: nodeDef.icon,
                category: nodeDef.category,
                title: nodeDef.label,
                ...(n8nType ? { rawN8n: { type: n8nType, parameters: {} } } : {}),
                onAddStep: () => {
                  setCopilotSourceStepId(newId);
                  setShowAddWithCopilotPanel(true);
                },
              } as any,
            };
            setNodes((nds) => [...nds, newNode]);
          }
          setIsEmpty(false);
        } catch (err) {
          console.error('[onDrop standard]', err);
        }
        return;
      }

      // ── Dynamic node drop ──────────────────────────────
      const nodeData = event.dataTransfer.getData('application/aivory-node');
      if (nodeData) {
        pushHistory(nodes, edges);
        try {
          const nodeDef = JSON.parse(nodeData);
          const position = dropPosition(event);
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
              // Palette defs carry the real n8n type — keep it so the node
              // gets a typed config (inspector forms + setup copilot).
              ...(typeof nodeDef.type === 'string' && nodeDef.type.includes('.')
                ? { rawN8n: { type: nodeDef.type, parameters: {} } }
                : {}),
              onAddStep: () => {
                setCopilotSourceStepId(newId);
                setShowAddWithCopilotPanel(true);
              },
            } as any,
          };
          setNodes((nds) => [...nds, newNode]);
          setIsEmpty(false);
        } catch (err) {
          console.error('[onDrop dynamic]', err);
        }
        return;
      }

      // ── App node drop ───────────────────────────────────
      const appData = event.dataTransfer.getData('application/aivory-app');
      if (!appData) return;

      pushHistory(nodes, edges);
      try {
        const app = JSON.parse(appData);
        const position = dropPosition(event);

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
              setCopilotSourceStepId(nodeId);
              setShowAddWithCopilotPanel(true);
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
        setIsEmpty(false);
      } catch (err) {
        console.error('[onDrop]', err);
      }
    },
    [setNodes, nodes, edges, pushHistory, dropPosition]
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
        const res = await fetch(asset(`/api/n8n/workflow/${fetchId}`));
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
      const res = await fetch(asset(`/api/n8n/workflow/${saveId}`), {
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
      pushHistory(nodes, edges);
      setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n));
    },
    [setNodes, pushHistory, nodes, edges]
  );

  const handleInspectorDelete = useCallback(
    (nodeId: string) => {
      pushHistory(nodes, edges);
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      setSelectedNodeId(null);
      setInspectorOpen(false);
    },
    [setNodes, setEdges, pushHistory, nodes, edges]
  );

  const loadExecutions = useCallback(async () => {
    const fetchId = n8nWorkflowId || workflowId;
    setExecLoading(true); setExecError(null);
    try {
      const res = await fetch(asset(`/api/n8n/workflow/${fetchId}/executions?limit=20`));
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
    // LangChain sub-node connections (Chat Model/Memory/Tool -> Agent) —
    // dashed, arrowless, not part of the main step flow.
    aiSubConnection: AiSubConnectionEdge,
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
                  setShowWorkflowCopilotModal(true)
                }}
                disabled={copilotLoading || isEmpty}
                style={{
                  borderRadius: 7, background: '#282827', padding: '5px 14px',
                  fontSize: 11, fontWeight: 600, color: '#dddac5',
                  border: '1px solid #666864', cursor: copilotLoading || isEmpty ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  opacity: (copilotLoading || isEmpty) ? 0.5 : 1,
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
        <div style={{
          flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative',
          background: [
            'radial-gradient(ellipse 70% 60% at 20% 10%, rgba(183,203,166,0.035) 0%, transparent 55%)',
            'radial-gradient(ellipse 60% 50% at 90% 90%, rgba(221,218,197,0.03) 0%, transparent 55%)',
          ].join(', '),
        }}>
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
            <div style={{ position: 'absolute', inset: 0 }} onDragOver={onDragOver} onDrop={onDrop}>
              {syncState === 'loading' ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 13, color: '#a8a6a2' }}>Loading workflow…</span>
                </div>
              ) : syncState === 'error' ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{
                    textAlign: 'center', padding: '28px 32px', borderRadius: 16, maxWidth: 360,
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(248,113,113,0.15)',
                    boxShadow: '0 16px 40px rgba(0,0,0,0.3)',
                  }}>
                    <p style={{ fontSize: 13, color: '#f2a2a2', marginBottom: 8, lineHeight: 1.5 }}>
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
                  <div style={{
                    textAlign: 'center', padding: '32px 40px', borderRadius: 16,
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                    boxShadow: '0 16px 40px rgba(0,0,0,0.25)',
                  }}>
                    <p style={{ fontSize: 13, color: '#c8c6c2', marginBottom: 4, fontWeight: 500 }}>This workflow has no steps yet</p>
                    <p style={{ fontSize: 11.5, color: '#8b8985' }}>Drag nodes from the side panel onto the canvas to get started.</p>
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
                  onNodesDelete={() => pushHistory(nodes, edges)}
                  onEdgesDelete={() => pushHistory(nodes, edges)}
                  onNodeDragStart={() => pushHistory(nodes, edges)}
                  onNodeClick={(_, node) => {
                    // Single click: select only, do NOT open inspector
                  }}
                  onNodeDoubleClick={(_, node) => {
                    setSelectedNodeId(node.id);
                    setInspectorOpen(true);
                  }}
                  onPaneClick={() => { setSelectedNodeId(null); setInspectorOpen(false); }}
                  onInit={(instance) => { rfInstanceRef.current = instance; }}
                  connectionLineType={ConnectionLineType.Bezier}
                  proOptions={{ hideAttribution: true }}
                  fitView
                  fitViewOptions={{ maxZoom: 1, padding: 0.2 }}
                >
                  <Background color="rgba(255,255,255,0.08)" gap={24} size={1} />
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

      {/* ── Aivory Modals ── */}
      {showWorkflowCopilotModal && currentWorkflow && (
        <WorkflowCopilotRefineModal
          workflow={currentWorkflow}
          onClose={() => setShowWorkflowCopilotModal(false)}
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
            setShowWorkflowCopilotModal(false)
          }}
        />
      )}

      {/* ── Aivory Node Copilot Panel ── */}
      {showAddWithCopilotPanel && copilotSourceStepId && nodes.find(n => n.id === copilotSourceStepId) && (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }} onClick={() => setShowAddWithCopilotPanel(false)} />
          <div style={{ position: 'relative', zIndex: 1001 }}>
            <AddWithCopilotPanel
              workflow={rawWorkflow}
              sourceNode={nodes.find(n => n.id === copilotSourceStepId)!}
              onApplyConfig={(config) => {
                handleInspectorChange(copilotSourceStepId, { config });
              }}
              onOpenInspector={() => {
                setShowAddWithCopilotPanel(false);
                setSelectedNodeId(copilotSourceStepId);
                setInspectorOpen(true);
              }}
              onApply={(result) => {
                // Add new steps and edges to canvas
                const newSteps = result.newSteps.map((step, i) => ({
                  id: `${copilotSourceStepId}-ext-${i}`,
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
                      setCopilotSourceStepId(`${copilotSourceStepId}-ext-${i}`);
                      setShowAddWithCopilotPanel(true);
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
                setShowAddWithCopilotPanel(false);
              }}
              onCancel={() => setShowAddWithCopilotPanel(false)}
              onManualAdd={() => {
                // TODO: Open manual step addition UI
                setShowAddWithCopilotPanel(false);
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
