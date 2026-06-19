'use client';
import { asset } from "@/lib/asset";

import React, { memo, useState } from 'react';
import { Handle, Position, useReactFlow, useNodeId } from '@xyflow/react';
import { WorkflowNode } from '@/types/workflow';
import styles from './AgentNode.module.css';

interface AgentNodeProps {
  data: WorkflowNode['data'] & {
    agentName: string;
    agentIcon?: string;
    model: string;
    provider: string;
    runtime: string;
    promptSummary: string;
    inputVariables: string[];
    outputVariable: string;
    status?: 'default' | 'running' | 'error' | 'disabled';
    errorMessage?: string;
    onDelete?: () => void;
    onAddStep?: () => void;
    onExplainPath?: () => void;
  };
  selected: boolean;
  isConnecting: boolean;
}

const AgentNode = memo(({ data, selected, isConnecting }: AgentNodeProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const {
    agentName = 'Agent',
    agentIcon = '',
    model = '',
    provider = '',
    runtime = '',
    promptSummary = '',
    inputVariables = [],
    outputVariable = '',
    status = 'default',
    errorMessage = '',
    onDelete,
    onAddStep,
    onExplainPath,
  } = data;

  const { setNodes, setEdges } = useReactFlow();
  const nodeId = useNodeId();

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete();
    } else if (nodeId) {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    }
  };

  const truncate = (text: string, max = 80) =>
    text.length <= max ? text : text.substring(0, max) + '...';

  return (
    <div
      className={`${styles.agentNode} ${status ? styles[status] || status : ''} ${selected ? styles.selected : ''} ${isConnecting ? styles.connecting : ''}`}
      role="article"
      aria-label={`Agent node: ${agentName}`}
    >
      <Handle type="target" position={Position.Left} className={styles.handle} isConnectable={!isConnecting} />

      {/* TOP — always visible */}
      <div className={`${styles.header} ${isExpanded ? styles.headerExpanded : ''}`}>
        <div className={styles.iconContainer}>
          {agentIcon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={agentIcon} alt="" width={48} height={48} className={styles.icon} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={asset("/icons/ai-agent.svg")} alt="AI Agent" width={48} height={48} className={styles.icon} />
          )}
        </div>
        <div className={styles.agentName}>{agentName}</div>
        {status && <span className={styles.badge}>{status === 'default' ? 'Agent' : status}</span>}
        <button
          className={`${styles.expandChevron} ${isExpanded ? styles.expanded : ''}`}
          onClick={(e) => { e.stopPropagation(); setIsExpanded(prev => !prev); }}
          title={isExpanded ? 'Collapse' : 'Expand'}
          aria-label={isExpanded ? 'Collapse node' : 'Expand node'}
        >
          &#8963;
        </button>
      </div>

      {/* BOTTOM — only in DOM when expanded */}
      {isExpanded && (
        <div className={styles.expandedContent}>
          {/* Meta */}
          <div className={styles.metaRow}>
            {model && (
              <div className={styles.metaLine}>
                <span className={styles.metaLabel}>Model:</span>
                <span className={styles.metaValue}>{model}</span>
                {provider && (
                  <>
                    <span className={styles.metaSeparator}>via</span>
                    <span className={styles.metaValue}>{provider}</span>
                  </>
                )}
              </div>
            )}
            {runtime && (
              <div className={styles.metaLine}>
                <span className={styles.metaLabel}>Runtime:</span>
                <span className={styles.metaValue}>{runtime}</span>
              </div>
            )}
          </div>

          {/* Prompt summary */}
          {promptSummary && (
            <div className={styles.description}>
              <div className={styles.promptSummary} title={promptSummary}>
                "{truncate(promptSummary)}"
              </div>
            </div>
          )}

          {/* I/O chips */}
          {(inputVariables.length > 0 || outputVariable) && (
            <div className={styles.chipsContainer}>
              {inputVariables.length > 0 && (
                <div className={styles.chipsRow}>
                  {inputVariables.map((v, i) => (
                    <div key={i} className={styles.chip} title={`Input: ${v}`}>
                      <span className={styles.chipLabel}>In:</span>
                      <span className={styles.chipValue}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
              {outputVariable && (
                <div className={styles.chipsRow}>
                  <div className={styles.chip} title={`Output: ${outputVariable}`}>
                    <span className={styles.chipLabel}>Out:</span>
                    <span className={styles.chipValue}>{outputVariable}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {status === 'error' && errorMessage && (
            <div className={styles.errorMessage}>{truncate(errorMessage, 80)}</div>
          )}
        </div>
      )}

      {/* Hover action buttons */}
      <button className={styles.infoButton} onClick={onExplainPath} title="Explain workflow path to this step" aria-label="Explain path">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </button>
      <button className={styles.addButton} onClick={onAddStep} title="Add follow-up step with Aivory" aria-label="Add step">+</button>
      <button className={styles.deleteButton} onClick={handleDelete} title="Delete node" aria-label="Delete node">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      <Handle type="source" position={Position.Right} className={styles.handle} isConnectable={!isConnecting} />
    </div>
  );
});

AgentNode.displayName = 'AgentNode';
export default AgentNode;
