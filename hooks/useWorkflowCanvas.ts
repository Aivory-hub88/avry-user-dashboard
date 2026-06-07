import { useState, useCallback } from 'react';
import { WorkflowNode, WorkflowEdge, XYPosition, Connection } from '@/types/workflow';
import {
  generateNodeId,
  generateEdgeId,
  createAppNodeFromApp,
  isValidConnection,
} from '@/lib/workflowBuilder';
import { fetchConnectionsForApp, autoAttachConnection } from '@/lib/connectionManager';

/**
 * Custom hook for managing workflow canvas state
 * Handles nodes, edges, and selection state
 * Provides operations for creating, updating, and deleting nodes and edges
 */
export const useWorkflowCanvas = () => {
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  /**
   * Creates an app node with auto-connection attachment
   * Fetches connections for the app and auto-attaches if exactly one exists
   */
  const createAppNode = useCallback(
    async (
      appId: string,
      appName: string,
      position: XYPosition,
      appIcon?: string
    ): Promise<WorkflowNode> => {
      // Fetch connections for the app
      const connections = await fetchConnectionsForApp(appId);

      // Auto-attach connection if exactly one exists
      const autoConnection = autoAttachConnection(connections);

      // Create the node
      const node = createAppNodeFromApp(
        appId,
        appName,
        position,
        autoConnection?.id,
        appIcon
      );

      // Update node data with connection name if available
      if (autoConnection) {
        node.data = {
          ...node.data,
          connectionName: autoConnection.displayName,
        };
      }

      // Add to nodes array
      setNodes((prevNodes) => [...prevNodes, node]);

      return node;
    },
    []
  );

  /**
   * Creates an edge between two nodes with validation
   * Validates that the connection is valid (no circular, valid handles)
   */
  const createEdge = useCallback(
    (sourceId: string, targetId: string): WorkflowEdge | null => {
      // Find the nodes
      const sourceNode = nodes.find((n) => n.id === sourceId);
      const targetNode = nodes.find((n) => n.id === targetId);

      if (!sourceNode || !targetNode) {
        console.error('[useWorkflowCanvas] Source or target node not found');
        return null;
      }

      // Validate connection
      if (!isValidConnection(sourceNode, targetNode, edges)) {
        console.warn('[useWorkflowCanvas] Invalid connection attempted');
        return null;
      }

      // Create edge
      const edge: WorkflowEdge = {
        id: generateEdgeId(),
        source: sourceId,
        target: targetId,
      };

      // Add to edges array
      setEdges((prevEdges) => [...prevEdges, edge]);

      return edge;
    },
    [nodes, edges]
  );

  /**
   * Deletes a node and all connected edges
   */
  const deleteNode = useCallback((nodeId: string) => {
    // Remove node
    setNodes((prevNodes) => prevNodes.filter((n) => n.id !== nodeId));

    // Remove all edges connected to this node
    setEdges((prevEdges) =>
      prevEdges.filter((e) => e.source !== nodeId && e.target !== nodeId)
    );

    // Clear selection if this node was selected
    setSelectedNodeId((prevId) => (prevId === nodeId ? null : prevId));
  }, []);

  /**
   * Deletes an edge
   */
  const deleteEdge = useCallback((edgeId: string) => {
    setEdges((prevEdges) => prevEdges.filter((e) => e.id !== edgeId));
  }, []);

  /**
   * Updates a node's properties
   */
  const updateNode = useCallback(
    (nodeId: string, updates: Partial<WorkflowNode>) => {
      setNodes((prevNodes) =>
        prevNodes.map((n) => (n.id === nodeId ? { ...n, ...updates } : n))
      );
    },
    []
  );

  /**
   * Updates multiple nodes' positions (for drag operations)
   */
  const updateNodesPositions = useCallback(
    (updates: Array<{ id: string; position: XYPosition }>) => {
      setNodes((prevNodes) => {
        const updateMap = new Map(updates.map((u) => [u.id, u.position]));
        return prevNodes.map((n) =>
          updateMap.has(n.id) ? { ...n, position: updateMap.get(n.id)! } : n
        );
      });
    },
    []
  );

  return {
    nodes,
    edges,
    selectedNodeId,
    setNodes,
    setEdges,
    setSelectedNodeId,
    createAppNode,
    createEdge,
    deleteNode,
    deleteEdge,
    updateNode,
    updateNodesPositions,
  };
};
