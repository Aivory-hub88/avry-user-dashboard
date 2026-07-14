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
    <div className="bg-gradient-to-b from-[#232320] to-[#1c1c19] border border-white/[0.09] rounded-lg px-3 py-2 flex items-center gap-2 min-w-[150px] shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_4px_12px_rgba(0,0,0,0.4)] relative">
      {/* Input/Output Handles Mock (visual only) */}
      {!data.isTrigger && <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-[#4a4a44] border-2 border-[#1c1c19] rounded-full z-10" />}
      <div className="absolute -right-1 top-1/2 -translate-y-1/2 w-2 h-2 bg-[#4a4a44] border-2 border-[#1c1c19] rounded-full z-10" />

      {/* Quick Add Button (+) Mock */}
      <div className="absolute -right-7 top-1/2 -translate-y-1/2 w-4 h-4 border border-white/[0.14] rounded bg-white/[0.03] flex items-center justify-center text-white/50 text-[9px]">
        +
      </div>

      <div className="w-6 h-6 rounded-md bg-white/[0.06] ring-1 ring-white/[0.06] flex items-center justify-center shrink-0 [&_img]:w-3.5 [&_img]:h-3.5 [&_svg]:w-3.5 [&_svg]:h-3.5">
        <AppIcon app={data.icon} />
      </div>
      <div className="flex flex-col">
        <span className="text-white/95 text-[10.5px] font-semibold">{data.label}</span>
        {data.subtitle && <span className="text-white/40 text-[8px]">{data.subtitle}</span>}
      </div>

      {data.hasError && (
        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-[#1c1c19]" />
      )}
    </div>
  );
};

// Sticky Note Mock
const StickyNode = ({ data }: { data: any }) => {
  const lines = data.content?.split('\n') || [];

  return (
    <div className="bg-[#1e1e1b]/60 backdrop-blur-2xl border border-white/[0.1] p-3.5 rounded-lg w-[250px] shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_10px_28px_rgba(0,0,0,0.5)] relative z-0 ring-1 ring-white/[0.04]">
      <h4 className="font-semibold text-[11.5px] mb-2 text-white/95">{data.title}</h4>
      <div className="text-[10.5px] leading-relaxed text-white/65 font-medium space-y-1.5">
        {lines.map((line: string, i: number) => {
          // Check if line starts with a number like "1. "
          const match = line.match(/^(\d+\.)\s+(.*)/);
          if (match) {
            return (
              <div key={i} className="flex gap-2 items-start">
                <span className="shrink-0 w-3.5 h-3.5 rounded-full bg-[#b7cba6]/15 text-[#c9dab8] text-[8px] font-semibold flex items-center justify-center mt-0.5">
                  {match[1].replace('.', '')}
                </span>
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
      <Background color="#ffffff" gap={24} size={1} style={{ opacity: 0.08 }} />
      <Controls showInteractive={false} className="opacity-60" />
    </ReactFlow>
  );
}
