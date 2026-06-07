import type { WorkflowNodeData } from '@/types/workflow-node';

export type WorkflowTemplateStepMeta = {
  nodeNameOrId: string;
  title: string;
  subtitle?: string;
  description?: string;
  categoryOverride?: WorkflowNodeData['category'];
};

export type WorkflowTemplateMeta = {
  id: string;
  label: string;
  description?: string;
  steps: WorkflowTemplateStepMeta[];
};

export const WORKFLOW_TEMPLATES: WorkflowTemplateMeta[] = [
  {
    id: 'sdVzJXaKnmFQUUbo',
    label: 'AI-Powered Client Onboarding',
    description:
      'Automatically pull client data, run AI-based document validation, and flag incomplete records.',
    steps: [
      {
        nodeNameOrId: 'Trigger',
        title:
          "New client record created with 'Onboarding Initiated' status in Salesforce CRM",
        subtitle: 'When this happens...',
        description:
          'Start this workflow whenever a new client record is created or updated to the onboarding status in your Salesforce instance.',
        categoryOverride: 'trigger',
      },
      {
        nodeNameOrId:
          'Pull client data and document attachments via Salesforce CRM and SharePoint API endpoints',
        title:
          'Pull client data and document attachments via Salesforce CRM and SharePoint API endpoints',
        subtitle: 'Salesforce REST API, SharePoint Graph API',
        description:
          'Collect client profile details and all onboarding documents from Salesforce and SharePoint so they can be validated in the next steps.',
        categoryOverride: 'action',
      },
      {
        nodeNameOrId:
          'Run NLP validation on documents using custom AI model and Google Document AI',
        title:
          'Run NLP validation on documents using custom AI model and Google Document AI',
        subtitle: 'Google Document AI, Aivory NLP Engine (Python)',
        description:
          'Use AI models to verify data consistency across documents, detect missing fields, and flag anomalies for manual review.',
        categoryOverride: 'ai',
      },
      {
        nodeNameOrId:
          'Identify incomplete records using rule-based validation (address, tax ID, ID verification)',
        title:
          'Identify incomplete records using rule-based validation (address, tax ID, ID verification)',
        subtitle: 'Aivory Decision Engine (Drools)',
        description:
          'Apply rule-based checks to make sure all mandatory onboarding fields are present and valid before the client is fully activated.',
        categoryOverride: 'action',
      },
    ],
  },
];
