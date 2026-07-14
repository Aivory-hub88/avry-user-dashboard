import type { Template } from "@/components/templates/template-data";
import { detectNodeIntent, type NodeIntent } from "@/lib/workflows/nodeMapper";

// Converts a marketplace Template into the React Flow node/edge shape the
// real workflow canvas (WorkflowCanvas → WorkflowNode) understands.
// Templates with real flowData (n8n-mock preview nodes) map 1:1 by id;
// templates that only have a nodesList (no saved layout) get a generated
// linear chain instead.
//
// Category drives both the node's icon (WorkflowNode's DefaultIcon) and its
// expanded-body color, so it must reflect what the step actually does —
// blanket-tagging every non-first node "action" made an AI agent step show
// the same generic icon as everything else.

const INTENT_TO_CATEGORY: Record<NodeIntent, string> = {
  email: "email",
  messaging: "channel",
  respond: "channel",
  filter: "condition",
  schedule: "trigger",
  http: "http",
  database: "http",
  ftp: "action",
  compress: "action",
  ssh: "action",
  cleanup: "action",
  transform: "transform",
  ai: "ai",
};

function categoryFor(label: string, isFirst: boolean, isTriggerHint?: boolean): string {
  if (isFirst || isTriggerHint) return "trigger";
  return INTENT_TO_CATEGORY[detectNodeIntent(label)] ?? "action";
}

export interface TemplateCanvasNode {
  id: string;
  type: "standardNode";
  position: { x: number; y: number };
  data: {
    label: string;
    title: string;
    description: string;
    category: string;
    appIcon?: string;
  };
}

export interface TemplateCanvasEdge {
  id: string;
  source: string;
  target: string;
  type: "smoothstep";
}

export function templateToCanvas(
  template: Template
): { nodes: TemplateCanvasNode[]; edges: TemplateCanvasEdge[] } {
  const flowNodes = (template.flowData?.nodes ?? []).filter(
    (n: any) => n.type !== "stickyNode"
  );

  if (flowNodes.length > 0) {
    const nodes: TemplateCanvasNode[] = flowNodes.map((n: any, i: number) => {
      const label = n.data?.label ?? `Step ${i + 1}`;
      return {
        id: String(n.id),
        type: "standardNode",
        position: n.position ?? { x: 400, y: 100 + i * 180 },
        data: {
          label,
          title: label,
          description: n.data?.subtitle ?? "",
          category: categoryFor(label, i === 0, n.data?.isTrigger),
          appIcon: n.data?.icon,
        },
      };
    });

    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges: TemplateCanvasEdge[] = (template.flowData?.edges ?? [])
      .filter((e: any) => nodeIds.has(String(e.source)) && nodeIds.has(String(e.target)))
      .map((e: any, i: number) => ({
        id: e.id ?? `e-${i}`,
        source: String(e.source),
        target: String(e.target),
        type: "smoothstep",
      }));

    return { nodes, edges };
  }

  // No saved layout — generate a simple linear chain from the nodes list
  // (or a single node from the title, as a last resort).
  const source = template.nodesList?.length
    ? template.nodesList.map((n) => ({ name: n.name, icon: n.icon }))
    : [{ name: template.title, icon: undefined }];

  const nodes: TemplateCanvasNode[] = source.map(({ name, icon }, i) => ({
    id: `tpl-${i}`,
    type: "standardNode",
    position: { x: 400, y: 100 + i * 180 },
    data: {
      label: name,
      title: name,
      description: "",
      category: categoryFor(name, i === 0),
      appIcon: icon,
    },
  }));

  const edges: TemplateCanvasEdge[] = nodes.slice(0, -1).map((n, i) => ({
    id: `tpl-e-${i}`,
    source: n.id,
    target: nodes[i + 1].id,
    type: "smoothstep",
  }));

  return { nodes, edges };
}
