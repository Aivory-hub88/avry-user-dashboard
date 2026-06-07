import { Connection } from '@/types/workflow';

// Simple in-memory cache for connections
const connectionCache: Record<string, { data: Connection[]; timestamp: number }> = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches connections for a specific app from the API
 * Filters for only connected status connections
 * Implements caching to avoid repeated API calls
 * @param appId - The application ID to fetch connections for
 * @returns Array of connected connections for the app
 */
export const fetchConnectionsForApp = async (appId: string): Promise<Connection[]> => {
  try {
    // Check cache first
    const cached = connectionCache[appId];
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    // Fetch from API
    const response = await fetch(`/api/integrations/connections?appId=${appId}`);
    if (!response.ok) {
      console.error(`[connectionManager] Failed to fetch connections for app ${appId}:`, response.statusText);
      return [];
    }

    const connections = await response.json();

    // Filter for connected status only
    const connectedConnections = connections.filter(
      (c: Connection) => c.status === 'connected'
    );

    // Cache the result
    connectionCache[appId] = {
      data: connectedConnections,
      timestamp: Date.now(),
    };

    return connectedConnections;
  } catch (error) {
    console.error(`[connectionManager] Error fetching connections for app ${appId}:`, error);
    return [];
  }
};

/**
 * Auto-attaches a connection to a node if exactly one connection exists
 * Returns the connection if exactly 1 exists, null otherwise
 * @param connections - Array of available connections
 * @returns The connection to auto-attach, or null if 0 or multiple connections exist
 */
export const autoAttachConnection = (connections: Connection[]): Connection | null => {
  if (connections.length === 1) {
    return connections[0];
  }
  return null;
};

/**
 * Gets the display name for a connection
 * Returns the connection's display name or a warning message
 * @param connection - The connection object (optional)
 * @returns Display name or warning message
 */
export const getConnectionDisplayName = (connection: Connection | undefined): string => {
  if (!connection) {
    return '⚠ No connection';
  }
  return connection.displayName;
};

/**
 * Clears the connection cache
 * Useful for testing or when connections are updated
 */
export const clearConnectionCache = (): void => {
  Object.keys(connectionCache).forEach((key) => {
    delete connectionCache[key];
  });
};
