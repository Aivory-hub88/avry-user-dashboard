'use client';

import React, { memo } from 'react';
import { WorkflowNode, Connection } from '@/types/workflow';
import { useNodeConfiguration } from '@/hooks/useNodeConfiguration';
import styles from './NodeConfigPanel.module.css';

/**
 * Props for the NodeConfigPanel component
 */
interface NodeConfigPanelProps {
  node: WorkflowNode | null;
  connections: Connection[];
  onUpdate: (node: WorkflowNode) => void;
  onDelete: (nodeId: string) => void;
  onClose: () => void;
}

/**
 * NodeConfigPanel Component
 * Right-side panel for configuring selected nodes
 * Displays action selector, connection selector, and action-specific parameters
 */
const NodeConfigPanel = memo(
  ({ node, connections, onUpdate, onDelete, onClose }: NodeConfigPanelProps) => {
    const {
      action,
      connectionId,
      parameters,
      loading,
      setAction,
      setConnectionId,
      updateParameter,
      saveConfiguration,
    } = useNodeConfiguration(node);

    // Memoized save handler to prevent infinite loops
    const handleSave = React.useCallback(() => {
      if (node) {
        saveConfiguration(onUpdate);
      }
    }, [node, saveConfiguration, onUpdate]);

    if (!node) {
      return null;
    }

    const appIcon = node.data?.appIcon || '';
    const appName = node.data?.appName || 'Node';

    return (
      <div className={styles.panel}>
        {/* Panel Header */}
        <div className={styles.panelHeader}>
          <div className={styles.headerContent}>
            <div className={styles.headerIcon}>{appIcon}</div>
            <div className={styles.headerInfo}>
              <div className={styles.headerTitle}>{appName}</div>
              <div className={styles.headerType}>{node.type}</div>
            </div>
          </div>
          <button className={styles.closeButton} onClick={onClose} title="Close panel">
            ✕
          </button>
        </div>

        {/* Panel Divider */}
        <div className={styles.divider} />

        {/* Panel Content */}
        <div className={styles.panelContent}>
          {/* Action Selector */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>Action</label>
            <select
              className={styles.select}
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
              }}
            >
              <option value="">Select Action</option>
              <option value="send_message">Send Message</option>
              <option value="create_item">Create Item</option>
              <option value="update_item">Update Item</option>
              <option value="delete_item">Delete Item</option>
            </select>
          </div>

          {/* Connection Selector */}
          {node.type === 'app' && (
            <div className={styles.section}>
              <label className={styles.sectionLabel}>Connection</label>
              {connections.length > 0 ? (
                <select
                  className={styles.select}
                  value={connectionId}
                  onChange={(e) => {
                    setConnectionId(e.target.value);
                  }}
                >
                  <option value="">Select Connection</option>
                  {connections.map((conn) => (
                    <option key={conn.id} value={conn.id}>
                      {conn.displayName}
                    </option>
                  ))}
                </select>
              ) : (
                <div className={styles.warning}>
                  No connections available
                  <a href="/integrations" target="_blank" rel="noopener noreferrer">
                    Connect App
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Action-Specific Parameters */}
          {action && (
            <div className={styles.section}>
              <label className={styles.sectionLabel}>Parameters</label>
              <div className={styles.parametersContainer}>
                {action === 'send_message' && (
                  <>
                    <div className={styles.parameterField}>
                      <label className={styles.parameterLabel}>Channel</label>
                      <input
                        type="text"
                        className={styles.input}
                        placeholder="e.g., #alerts"
                        value={parameters.channel || ''}
                        onChange={(e) => updateParameter('channel', e.target.value)}
                      />
                    </div>
                    <div className={styles.parameterField}>
                      <label className={styles.parameterLabel}>Message</label>
                      <textarea
                        className={styles.textarea}
                        placeholder="Enter message text"
                        value={parameters.message || ''}
                        onChange={(e) => updateParameter('message', e.target.value)}
                        rows={3}
                      />
                    </div>
                  </>
                )}
                {action === 'create_item' && (
                  <>
                    <div className={styles.parameterField}>
                      <label className={styles.parameterLabel}>Item Name</label>
                      <input
                        type="text"
                        className={styles.input}
                        placeholder="Enter item name"
                        value={parameters.itemName || ''}
                        onChange={(e) => updateParameter('itemName', e.target.value)}
                      />
                    </div>
                    <div className={styles.parameterField}>
                      <label className={styles.parameterLabel}>Item Data</label>
                      <textarea
                        className={styles.textarea}
                        placeholder="Enter item data (JSON)"
                        value={parameters.itemData || ''}
                        onChange={(e) => updateParameter('itemData', e.target.value)}
                        rows={3}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Panel Footer */}
        <div className={styles.panelFooter}>
          <button
            className={styles.deleteButton}
            onClick={() => {
              onDelete(node.id);
              onClose();
            }}
          >
            Delete Node
          </button>
          <button className={styles.closeButtonFooter} onClick={() => {
            handleSave();
            onClose();
          }}>
            Done
          </button>
        </div>
      </div>
    );
  }
);

NodeConfigPanel.displayName = 'NodeConfigPanel';

export default NodeConfigPanel;
