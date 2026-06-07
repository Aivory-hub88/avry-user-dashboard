export type AiryRoadmapMilestone = {
  id: string;
  title: string;
  description?: string;
  linkedWorkflowIds?: string[];
};

export type AiryRoadmapKpi = {
  id: string;
  label: string;
  target: string;
};

export type AiryRoadmapPhase = {
  id: string;
  name: string;
  timeframe: string;
  description?: string;
  milestones: AiryRoadmapMilestone[];
  kpis: AiryRoadmapKpi[];
};

export type AiryRoadmap = {
  id: string;
  title: string;
  createdAt: string;
  source?: 'diagnostic' | 'blueprint' | 'direct';
  blueprintId?: string;
  phases: AiryRoadmapPhase[];
};
