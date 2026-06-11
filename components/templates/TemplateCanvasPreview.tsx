"use client";

import React, { useMemo } from "react";
import { ReactFlow, Background, Controls, useNodesState, useEdgesState } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import AppIcon from "./AppIcon";
import { Template } from "./template-data";

// --- Custom Nodes ---

// n8n Node Mock
const N8nNode = ({ data }: { data: any }) => {
  return (
    <div className="bg-[#1e1e1e] border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3 min-w-[200px] shadow-lg relative">
      {/* Input/Output Handles Mock (visual only) */}
      {!data.isTrigger && <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#444] border-2 border-[#1e1e1e] rounded-full z-10" />}
      <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-[#444] border-2 border-[#1e1e1e] rounded-full z-10" />

      {/* Quick Add Button (+) Mock */}
      <div className="absolute -right-10 top-1/2 -translate-y-1/2 w-6 h-6 border border-white/20 rounded flex items-center justify-center text-white/50 text-xs">
        +
      </div>

      <div className="w-8 h-8 rounded-lg bg-[#2a2a26] flex items-center justify-center">
        <AppIcon app={data.icon} />
      </div>
      <div className="flex flex-col">
        <span className="text-white text-xs font-semibold">{data.label}</span>
        {data.subtitle && <span className="text-white/40 text-[9px]">{data.subtitle}</span>}
      </div>

      {data.hasError && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[#1e1e1e]" />
      )}
    </div>
  );
};

// Sticky Note Mock
const StickyNode = ({ data }: { data: any }) => {
  const lines = data.content?.split('\n') || [];

  return (
    <div className="bg-[#181816]/20 backdrop-blur-2xl border border-white/10 p-5 rounded-xl w-[320px] shadow-[0_8px_32px_rgba(0,0,0,0.5)] relative z-0 ring-1 ring-white/5">
      <h4 className="font-bold text-[14px] mb-3 text-white/90">{data.title}</h4>
      <div className="text-[12px] leading-relaxed text-white/70 font-medium space-y-1.5">
        {lines.map((line: string, i: number) => {
          // Check if line starts with a number like "1. "
          const match = line.match(/^(\d+\.)\s+(.*)/);
          if (match) {
            return (
              <div key={i} className="flex gap-2 items-start">
                <span className="font-semibold text-white/90 shrink-0">{match[1]}</span>
                <span>{match[2]}</span>
              </div>
            );
          }
          return <p key={i}>{line}</p>;
        })}
      </div>
    </div>
  );
};

// --- Main Canvas Component ---

export default function TemplateCanvasPreview({ template }: { template: Template }) {
  const nodeTypes = useMemo(() => ({ n8nNode: N8nNode, stickyNode: StickyNode }), []);

  if (!template.flowData) {
    return (
      <div className="w-full h-full flex items-center justify-center text-white/30">
        No preview available.
      </div>
    );
  }

  const [nodes, setNodes, onNodesChange] = useNodesState(template.flowData.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(template.flowData.edges);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      panOnDrag={true}
      zoomOnScroll={true}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#ffffff" gap={24} size={1} style={{ opacity: 0.05 }} />
      <Controls showInteractive={false} className="opacity-50" />
    </ReactFlow>
  );
}
