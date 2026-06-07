/**
 * WorkflowNodeComponent
 * 
 * Wrapper component for rendering generated workflow nodes on the canvas.
 * Adapts AivoryWorkflowSpec steps to React Flow node format.
 */

'use client'

import React, { useMemo } from 'react'
import { Node, Edge, MarkerType } from '@xyflow/react'
import { WorkflowStep, AivoryWorkflowEdge } from '@/types/workflows'

export interface WorkflowNodeData {
  [key: string]: unknown
  title: string
  appId: string
  actionId: string
  connectionId?: string
  inputs?: Record<string, any>
  type: 'trigger' | 'action' | 'ai' | 'filter'
}

/**
 * Convert workflow steps to React Flow nodes
 */
export function stepsToNodes(steps: WorkflowStep[]): Node<WorkflowNodeData>[] {
  return steps.map((step, index) => ({
    id: step.id,
    type: 'standardNode', // Use standardNode so BaseWorkflowNode handles are present
    position: step.position || { x: 0, y: index * 160 },
    data: {
      label: step.actionId || step.appId || `Step ${index + 1}`,
      icon: step.type === 'trigger' ? 'webhook' : step.type === 'ai' ? 'code' : 'http',
      category: step.type === 'trigger' ? 'trigger' : step.type === 'ai' ? 'transform' : 'utility',
      title: step.actionId || step.appId || `Step ${index + 1}`,
      // Keep original data accessible
      appId: step.appId,
      actionId: step.actionId,
      connectionId: step.connectionId,
      inputs: step.inputs,
    } as any,
  }))
}

/**
 * Convert workflow edges to React Flow edges
 */
export function edgesToReactFlowEdges(edges: AivoryWorkflowEdge[]): Edge[] {
  return edges.map((edge, index) => ({
    id: `edge-${edge.from}-${edge.to}`,
    source: edge.from,
    target: edge.to,
    label: edge.label,
    animated: false,
    type: 'n8nAdaptive',
    markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color: '#9ca3af' },
  }))
}

/**
 * Hook to convert workflow spec to React Flow nodes and edges
 */
export function useWorkflowNodes(
  steps: WorkflowStep[] | undefined,
  edges: AivoryWorkflowEdge[] | undefined
) {
  return useMemo(() => {
    const nodes = steps ? stepsToNodes(steps) : []
    const rfEdges = edges ? edgesToReactFlowEdges(edges) : []
    return { nodes, edges: rfEdges }
  }, [steps, edges])
}

/**
 * WorkflowNodeComponent
 * 
 * Renders a single workflow node with app icon and action name.
 * Used as a node type in React Flow canvas.
 */
export const WorkflowNodeComponent: React.FC<{
  data: WorkflowNodeData
  isConnecting?: boolean
  selected?: boolean
}> = ({ data, isConnecting, selected }) => {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'trigger':
        return '▶'
      case 'action':
        return '○'
      case 'ai':
        return '◈'
      case 'filter':
        return '⋈'
      default:
        return '□'
    }
  }

  return (
    <div
      style={{
        padding: '12px 14px',
        background: 'rgba(255, 255, 255, 0.08)',
        border: selected
          ? '2px solid rgba(0, 229, 158, 0.6)'
          : isConnecting
            ? '2px solid rgba(0, 229, 158, 0.3)'
            : '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '8px',
        minWidth: '140px',
        textAlign: 'center',
        cursor: 'pointer',
        transition: 'all 0.15s',
        boxShadow: selected ? '0 0 12px rgba(0, 229, 158, 0.2)' : 'none',
      }}
    >
      <div style={{ fontSize: '18px', marginBottom: '6px' }}>
        {getTypeIcon(data.type)}
      </div>
      <div
        style={{
          fontSize: '12px',
          fontWeight: 600,
          color: '#e8e6e1',
          marginBottom: '4px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {data.title}
      </div>
      <div
        style={{
          fontSize: '10px',
          color: '#5a5a58',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {data.actionId}
      </div>
    </div>
  )
}
