import { useState, useCallback, useEffect } from 'react';
import { WorkflowNode, Connection } from '@/types/workflow';
import { fetchConnectionsForApp, autoAttachConnection } from '@/lib/connectionManager';

/**
 * Custom hook for managing node configuration state
 * Handles action, connection, and parameters for a selected node
 */
export const useNodeConfiguration = (node: WorkflowNode | null) => {
  const [action, setAction] = useState<string>('');
  const [connectionId, setConnectionId] = useState<string>('');
  const [parameters, setParameters] = useState<Record<string, any>>({});
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Fetches connections for the node's app
   */
  const fetchConnections = useCallback(async (appId: string) => {
    if (!appId) return;

    setLoading(true);
    setError(null);

    try {
      const fetchedConnections = await fetchConnectionsForApp(appId);
      setConnections(fetchedConnections);

      // Auto-attach if exactly one connection exists
      const autoConnection = autoAttachConnection(fetchedConnections);
      if (autoConnection) {
        setConnectionId(autoConnection.id);
      }
    } catch (err) {
      console.error('[useNodeConfiguration] Error fetching connections:', err);
      setError('Failed to load connections');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Initializes configuration from node data
   */
  useEffect(() => {
    if (!node) {
      setAction('');
      setConnectionId('');
      setParameters({});
      setConnections([]);
      return;
    }

    // Set action and connection from node
    setAction(node.action || '');
    setConnectionId(node.connectionId || '');
    setParameters(node.config || {});

    // Fetch connections if app node
    if (node.type === 'app' && node.appId) {
      fetchConnections(node.appId);
    }
  }, [node, fetchConnections]);

  /**
   * Saves configuration back to the node
   */
  const saveConfiguration = useCallback(
    (onUpdate: (node: WorkflowNode) => void) => {
      if (!node) return;

      const updatedNode: WorkflowNode = {
        ...node,
        action,
        connectionId,
        config: parameters,
      };

      onUpdate(updatedNode);
    },
    [node, action, connectionId, parameters]
  );

  /**
   * Updates a single parameter
   */
  const updateParameter = useCallback((key: string, value: any) => {
    setParameters((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  /**
   * Resets configuration to node's current state
   */
  const resetConfiguration = useCallback(() => {
    if (!node) return;

    setAction(node.action || '');
    setConnectionId(node.connectionId || '');
    setParameters(node.config || {});
  }, [node]);

  return {
    action,
    connectionId,
    parameters,
    connections,
    loading,
    error,
    setAction,
    setConnectionId,
    setParameters,
    updateParameter,
    fetchConnections,
    saveConfiguration,
    resetConfiguration,
  };
};
