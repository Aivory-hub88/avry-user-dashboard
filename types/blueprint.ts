/**
 * TypeScript interfaces for the Blueprint Viewer v1 feature
 */

// ── Legacy types (kept for backward compat) ──────────────────────────────────

export interface ArchitectureLayer {
  title: string
  items: string[]
  description: string
}

export interface WorkflowModule {
  workflow_id?: string
  name: string
  trigger: string
  steps: string[] | Array<{ type: string; action: string }>
  integrations: string[]
  integrations_required?: string[]
  status?: 'planned' | 'ready' | 'deployed'
  description?: string
}

export interface DiagnosticSummary {
  readiness_score: number
  maturity_level: string
  constraints: string[]
}

export interface RiskAssessment {
  data_risks: string[]
  fallback_strategy: string
}

export interface DeploymentPlan {
  phase: string
  estimated_impact: string
  estimated_roi_months: number
}

export interface SystemArchitecture {
  data_sources: ArchitectureLayer
  processing_layers: ArchitectureLayer
  decision_engine: ArchitectureLayer
  memory_layer: ArchitectureLayer
  execution_layer: ArchitectureLayer
}

export interface BlueprintData {
  blueprint_id: string
  version: string
  organization: string
  diagnostic_summary: DiagnosticSummary
  strategic_objective: string
  system_architecture: SystemArchitecture
  workflow_modules: WorkflowModule[]
  risk_assessment: RiskAssessment
  deployment_plan: DeploymentPlan
}

// ── Blueprint v1 schema ───────────────────────────────────────────────────────

export interface BlueprintV1Organization {
  name: string
  industry: string
  size: 'micro' | 'sme' | 'mid-market' | 'enterprise'
}

export interface BlueprintV1DiagnosticSummary {
  ai_readiness_score: number
  maturity_level: string
  primary_constraints: string[]
}

export interface BlueprintV1KpiTarget {
  metric: string
  target: string
}

export interface BlueprintV1StrategicObjective {
  primary_goal: string
  kpi_targets: BlueprintV1KpiTarget[]
}

export interface BlueprintV1WorkflowStep {
  type: 'ingestion' | 'ai_processing' | 'decision' | 'execution' | 'notification' | 'human_review'
  action: string
}

export interface BlueprintV1WorkflowModule {
  workflow_id: string
  name: string
  trigger: string
  steps: BlueprintV1WorkflowStep[]
  integrations_required: string[]
}

export interface BlueprintV1SystemArchitecture {
  data_sources: string[]
  processing_layers: string[]
  decision_engine: string
  memory_layer: string
  execution_layer: string[]
}

export interface BlueprintV1RiskAssessment {
  data_risks: string[]
  operational_risks: string[]
  mitigation_strategies: string[]
}

export interface BlueprintV1DeploymentWave {
  name: string
  included_workflows: string[]
  notes: string
}

export interface BlueprintV1DeploymentPlan {
  phase: string
  estimated_impact: string
  estimated_roi_months: number
  waves: BlueprintV1DeploymentWave[]
}

export interface BlueprintV1 {
  blueprint_id: string
  version: '1'
  status: 'draft' | 'published'
  organization: BlueprintV1Organization
  diagnostic_summary: BlueprintV1DiagnosticSummary
  strategic_objective: BlueprintV1StrategicObjective
  system_architecture: BlueprintV1SystemArchitecture
  workflow_modules: BlueprintV1WorkflowModule[]
  risk_assessment: BlueprintV1RiskAssessment
  deployment_plan: BlueprintV1DeploymentPlan
}

/**
 * Sample blueprint data for v1
 */
export function getSampleBlueprint(): BlueprintData {
  return {
    blueprint_id: 'BP-2024-001',
    version: '1.0',
    organization: 'Sample Organization',
    diagnostic_summary: {
      readiness_score: 75,
      maturity_level: 'Developing',
      constraints: [
        'Limited API access to legacy systems',
        'Data quality issues in customer database',
        'Team training required for AI tools'
      ]
    },
    strategic_objective: 'Automate customer onboarding and reduce manual data entry by 70% within 6 months',
    system_architecture: {
      data_sources: {
        title: 'Data Sources',
        items: ['Salesforce CRM', 'Stripe Payments', 'Shopify Store', 'Email System (IMAP)'],
        description: 'Primary data sources for customer information, transactions, and communications'
      },
      processing_layers: {
        title: 'Processing Layers',
        items: ['Data Validation Engine', 'Entity Extraction (NLP)', 'Document Parser', 'Data Enrichment Service'],
        description: 'Transform and validate incoming data from multiple sources'
      },
      decision_engine: {
        title: 'Decision Engine',
        items: ['Rule-based Routing', 'ML Classification Model', 'Priority Scoring', 'Approval Workflow Logic'],
        description: 'Intelligent decision-making for routing, prioritization, and automation triggers'
      },
      memory_layer: {
        title: 'Memory Layer',
        items: ['Customer Context Store', 'Interaction History', 'Workflow State Management', 'Audit Log'],
        description: 'Persistent storage for context, history, and state across workflows'
      },
      execution_layer: {
        title: 'Execution Layer',
        items: ['n8n Workflow Engine', 'API Orchestration', 'Notification Service', 'Error Handling & Retry'],
        description: 'Execute workflows, manage integrations, and handle errors gracefully'
      }
    },
    workflow_modules: [
      {
        name: 'Customer Onboarding Automation',
        trigger: 'New customer signup detected in Shopify',
        steps: [
          'Extract customer data from Shopify webhook',
          'Validate email and contact information',
          'Create customer record in Salesforce CRM',
          'Send welcome email with onboarding checklist',
          'Schedule follow-up task for sales team'
        ],
        integrations: ['Shopify', 'Salesforce', 'SendGrid']
      },
      {
        name: 'Invoice Processing Automation',
        trigger: 'New invoice received via email',
        steps: [
          'Parse invoice PDF using OCR',
          'Extract vendor, amount, and due date',
          'Validate against purchase orders',
          'Route for approval if amount > $1000',
          'Create payment record in Stripe',
          'Send confirmation to vendor'
        ],
        integrations: ['Email (IMAP)', 'Stripe', 'Internal Approval System']
      },
      {
        name: 'Customer Support Ticket Routing',
        trigger: 'New support ticket created',
        steps: [
          'Classify ticket urgency using NLP',
          'Extract customer context from CRM',
          'Route to appropriate team based on category',
          'Send auto-response to customer',
          'Escalate if high priority'
        ],
        integrations: ['Zendesk', 'Salesforce', 'Slack']
      }
    ],
    risk_assessment: {
      data_risks: [
        'Customer PII must be encrypted at rest and in transit',
        'Payment data handling must comply with PCI DSS',
        'GDPR compliance required for EU customers'
      ],
      fallback_strategy: 'All workflows include manual fallback paths. If automation fails, tasks are routed to human operators with full context. Critical workflows have 24/7 monitoring and alerting.'
    },
    deployment_plan: {
      phase: 'Phased rollout over 3 months',
      estimated_impact: '70% reduction in manual data entry, 50% faster onboarding, 30% improvement in customer satisfaction',
      estimated_roi_months: 6
    }
  }
}

/**
 * API request/response types for VPS bridge integration
 */

export interface BlueprintGenerateRequest {
  organization_id: string
  diagnostic_id: string
  objective: string
}

/**
 * VPS Bridge /blueprints/generate returns the full BlueprintV1 object directly.
 */
export type BlueprintGenerateResponse = BlueprintV1

export interface BlueprintVersion {
  version: string
  created_at: string
  created_by: string
  status: string
}

export interface BlueprintVersionsResponse {
  blueprint_id: string
  versions: BlueprintVersion[]
}
