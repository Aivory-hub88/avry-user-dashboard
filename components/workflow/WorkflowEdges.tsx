'use client';

import React, { memo, useMemo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps,
  Position,
} from '@xyflow/react';
import styles from './WorkflowEdges.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// N8NAdaptiveEdge — single unified edge with adaptive curved/angular pathing
// and animated walking-ants dashed lines.
//
// Logic:
//   • If target is generally "in front of" source (dx >= 50) and the angle
//     isn't too steep (dy <= 100 or dx >= 150), use getBezierPath (smooth curve).
//   • Otherwise (sharp angle, target behind source, or very vertical),
//     use getSmoothStepPath with borderRadius 16 for clean 90° turns.
// ─────────────────────────────────────────────────────────────────────────────

const N8NAdaptiveEdge = memo((props: EdgeProps) => {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition = Position.Right,
    targetPosition = Position.Left,
    markerEnd,
    selected,
  } = props;

  const { setEdges } = useReactFlow();

  const [edgePath, labelX, labelY] = useMemo(() => {
    // Right → Left is the normal step-to-step case: one smooth cubic whose
    // handles scale with the gap, so forward links are gentle and links that
    // go back/around (stacked or looped layouts) swing out in a wide S instead
    // of snapping to right angles.
    if (sourcePosition === Position.Right && targetPosition === Position.Left) {
      const dx = targetX - sourceX;
      const dy = targetY - sourceY;
      const off = dx >= 0
        ? Math.min(Math.max(dx * 0.5, 48), 220)
        : Math.min(70 + Math.abs(dy) * 0.18, 150);
      const path = `M${sourceX},${sourceY} C${sourceX + off},${sourceY} ${targetX - off},${targetY} ${targetX},${targetY}`;
      return [path, (sourceX + targetX) / 2, (sourceY + targetY) / 2] as const;
    }
    return getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  }, [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition]);

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEdges((edges) => edges.filter((edge) => edge.id !== id));
  };

  return (
    <>
      {/* soft underlay gives the moving dashes a track to run on */}
      <path d={edgePath} className={styles.n8nEdgeTrack} />
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        className={`${styles.n8nEdge} ${selected ? styles.n8nEdgeSelected : ''}`}
        interactionWidth={20}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className={styles.edgeLabelContainer}
        >
          <button
            className={styles.deleteButton}
            onClick={handleDelete}
            onContextMenu={handleDelete}
            title="Delete edge"
          >
            ✕
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

N8NAdaptiveEdge.displayName = 'N8NAdaptiveEdge';

// ─────────────────────────────────────────────────────────────────────────────
// AiSubConnectionEdge — dashed, arrowless connector for LangChain sub-nodes
// (Chat Model / Memory / Tool feeding an AI Agent via ai_languageModel /
// ai_memory / ai_tool). Visually distinct from the main step-to-step flow.
// ─────────────────────────────────────────────────────────────────────────────

const AiSubConnectionEdge = memo((props: EdgeProps) => {
  const {
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition = Position.Right,
    targetPosition = Position.Left,
    selected,
  } = props;

  const [edgePath] = useMemo(
    () =>
      getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 12,
      }),
    [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition]
  );

  return (
    <BaseEdge
      path={edgePath}
      style={{
        stroke: selected ? '#a1a1aa' : '#6b6b68',
        strokeWidth: 1.5,
        strokeDasharray: '4 4',
      }}
      interactionWidth={16}
    />
  );
});

AiSubConnectionEdge.displayName = 'AiSubConnectionEdge';

export default N8NAdaptiveEdge;
export { N8NAdaptiveEdge, AiSubConnectionEdge };
