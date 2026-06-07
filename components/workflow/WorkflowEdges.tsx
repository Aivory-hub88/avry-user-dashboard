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
    const dx = targetX - sourceX;
    const dy = Math.abs(targetY - sourceY);

    // Sharp angle: target is behind source, or very steep vertical drop
    const isSharpAngle = dx < 50 || (dy > 100 && dx < 150);

    if (isSharpAngle) {
      return getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 16,
      });
    }

    return getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
    });
  }, [sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition]);

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEdges((edges) => edges.filter((edge) => edge.id !== id));
  };

  return (
    <>
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

export default N8NAdaptiveEdge;
export { N8NAdaptiveEdge };
