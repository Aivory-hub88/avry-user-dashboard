import { WorkflowNode, WorkflowEdge, XYPosition } from '@/types/workflow';

/**
 * Generates a unique node ID
 * @returns A unique node identifier
 */
export const generateNodeId = (): string => {
  return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Generates a unique edge ID
 * @returns A unique edge identifier
 */
export const generateEdgeId = (): string => {
  return `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Creates an app node from app data
 * @param appId - The application ID
 * @param appName - The application name
 * @param position - Canvas position for the node
 * @param connectionId - Optional connection ID to attach
 * @param appIcon - Optional app icon
 * @returns A new WorkflowNode
 */
export const createAppNodeFromApp = (
  appId: string,
  appName: string,
  position: XYPosition,
  connectionId?: string,
  appIcon?: string
): WorkflowNode => {
  return {
    id: generateNodeId(),
    type: 'app',
    appId,
    action: undefined,
    connectionId,
    position,
    config: {},
    label: appName,
    data: {
      appName,
      appIcon,
      connectionName: undefined,
    },
  };
};

/**
 * Validates if a connection between two nodes is valid
 * Checks for:
 * - Trigger nodes cannot receive input
 * - No circular connections
 * @param sourceNode - The source node
 * @param targetNode - The target node
 * @param edges - Current edges in the workflow
 * @returns True if connection is valid, false otherwise
 */
export const isValidConnection = (
  sourceNode: WorkflowNode,
  targetNode: WorkflowNode,
  edges: WorkflowEdge[]
): boolean => {
  // Trigger nodes cannot receive input
  if (targetNode.type === 'trigger') {
    return false;
  }

  // Prevent circular connections
  if (wouldCreateCircle(sourceNode.id, targetNode.id, edges)) {
    return false;
  }

  return true;
};

/**
 * Detects if creating an edge would create a circular connection
 * Uses BFS to check if target node can reach source node
 * @param sourceId - ID of the source node
 * @param targetId - ID of the target node
 * @param edges - Current edges in the workflow
 * @returns True if creating edge would create a circle, false otherwise
 */
export const wouldCreateCircle = (
  sourceId: string,
  targetId: string,
  edges: WorkflowEdge[]
): boolean => {
  // Build adjacency list from edges
  const adjacencyList: Record<string, string[]> = {};
  edges.forEach((edge) => {
    if (!adjacencyList[edge.source]) {
      adjacencyList[edge.source] = [];
    }
    adjacencyList[edge.source].push(edge.target);
  });

  // BFS to check if targetId can reach sourceId
  const queue: string[] = [targetId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current === sourceId) {
      return true; // Circle detected
    }

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);

    if (adjacencyList[current]) {
      queue.push(...adjacencyList[current]);
    }
  }

  return false; // No circle
};

/**
 * Calculates the execution order of nodes based on edges
 * Uses topological sort to determine the order
 * @param nodes - All nodes in the workflow
 * @param edges - All edges in the workflow
 * @returns Array of node IDs in execution order
 */
export const getExecutionOrder = (
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): string[] => {
  // Build adjacency list and in-degree map
  const adjacencyList: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};

  // Initialize
  nodes.forEach((node) => {
    adjacencyList[node.id] = [];
    inDegree[node.id] = 0;
  });

  // Build graph
  edges.forEach((edge) => {
    adjacencyList[edge.source].push(edge.target);
    inDegree[edge.target]++;
  });

  // Kahn's algorithm for topological sort
  const queue: string[] = [];
  const result: string[] = [];

  // Find all nodes with no incoming edges
  nodes.forEach((node) => {
    if (inDegree[node.id] === 0) {
      queue.push(node.id);
    }
  });

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    // Process all neighbors
    adjacencyList[current].forEach((neighbor) => {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    });
  }

  return result;
};
