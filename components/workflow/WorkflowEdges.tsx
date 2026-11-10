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

const BACK_PAD = 63;     // how far a backward link sticks out of each handle
const BACK_RADIUS = 20; // corner rounding

/** Polyline with rounded corners (quadratic fillet, radius clamped to half of each segment). */
function roundedPath(pts: number[][], radius: number): string {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const inLen = Math.hypot(cx - px, cy - py);
    const outLen = Math.hypot(nx - cx, ny - cy);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r < 1) { d += ` L${cx},${cy}`; continue; }
    const ax = cx - ((cx - px) / inLen) * r;
    const ay = cy - ((cy - py) / inLen) * r;
    const bx = cx + ((nx - cx) / outLen) * r;
    const by = cy + ((ny - cy) / outLen) * r;
    d += ` L${ax},${ay} Q${cx},${cy} ${bx},${by}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${last[0]},${last[1]}`;
}

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

  const { edgePath, labelX, labelY, backArrow } = useMemo(() => {
    if (sourcePosition === Position.Right && targetPosition === Position.Left) {
      // n8n routing. Forward link: xyflow's own bezier — dead straight on the
      // same row, a clean S with horizontal tangents otherwise.
      if (targetX >= sourceX) {
        const [path, lx, ly] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
        return { edgePath: path, labelX: lx, labelY: ly, backArrow: null };
      }
      // Backward link: leave right, drop into the gap between the two rows,
      // run left, then come down and enter from the left. Right-angled with
      // rounded corners; on one row it runs underneath the nodes + labels.
      const dy = Math.abs(targetY - sourceY);
      const midY = dy > 110 ? (sourceY + targetY) / 2 : Math.max(sourceY, targetY) + 110;
      const x1 = sourceX + BACK_PAD;
      const x2 = targetX - BACK_PAD;
      const path = roundedPath(
        [[sourceX, sourceY], [x1, sourceY], [x1, midY], [x2, midY], [x2, targetY], [targetX, targetY]],
        BACK_RADIUS,
      );
      const mx = (x1 + x2) / 2;
      return { edgePath: path, labelX: mx, labelY: midY, backArrow: { x: mx, y: midY } };
    }
    const [path, lx, ly] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
    return { edgePath: path, labelX: lx, labelY: ly, backArrow: null };
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
      {backArrow && (
        <polygon
          points={`${backArrow.x + 5},${backArrow.y - 5} ${backArrow.x - 5},${backArrow.y} ${backArrow.x + 5},${backArrow.y + 5}`}
          className={styles.n8nBackArrow}
        />
      )}
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
