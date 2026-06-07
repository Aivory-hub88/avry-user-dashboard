/**
 * TypeScript interfaces for the Diagnostics v1 feature
 */

export interface DiagnosticField {
  id: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'multiselect'
  placeholder?: string
  options?: string[]
  required?: boolean
  helperText?: string
}

export interface DiagnosticPhaseConfig {
  phase: 'A' | 'B' | 'C' | 'D'
  title: string
  description: string
  fields: DiagnosticField[]
}

export interface BusinessContext {
  industry: string
  revenueModel: string
  channels: string[]
  tools: string
}

export interface OperationalPainPoints {
  timeWaste: string
  manualProcesses: string
  delays: string
}

export interface DataReadiness {
  hasCRM: string
  crmName: string
  structuredData: string
  dataDescription: string
  hasAPIs: string
  integrations: string
}

export interface StrategicGoals {
  primaryGoal: string
  kpis: string
  timeline: string
}

export interface DiagnosticData {
  business: BusinessContext
  operations: OperationalPainPoints
  dataReadiness: DataReadiness
  objectives: StrategicGoals
}

export interface DiagnosticResult {
  data: DiagnosticData
  score: number
  maturityLevel: string
  timestamp: string
}

/**
 * Sample data generator for v1
 */
export function getSampleDiagnosticResult(): DiagnosticResult {
  return {
    data: {
      business: {
        industry: 'E-commerce',
        revenueModel: 'Subscription',
        channels: ['Website', 'Mobile App'],
        tools: 'Shopify, Stripe, Mailchimp'
      },
      operations: {
        timeWaste: 'Manual data entry and report generation',
        manualProcesses: 'Customer onboarding, Invoice processing',
        delays: 'Approval workflows, Data synchronization'
      },
      dataReadiness: {
        hasCRM: 'Yes',
        crmName: 'Salesforce',
        structuredData: 'Yes',
        dataDescription: 'Customer data in CRM, transaction data in database',
        hasAPIs: 'Yes',
        integrations: 'Salesforce API, Stripe API, Shopify API'
      },
      objectives: {
        primaryGoal: 'Automate customer onboarding and reduce manual data entry',
        kpis: 'Onboarding time, Data accuracy, Customer satisfaction',
        timeline: '3-6 months'
      }
    },
    score: 75,
    maturityLevel: 'Developing',
    timestamp: new Date().toISOString()
  }
}

/**
 * Phase configurations for form rendering
 */
export const DIAGNOSTIC_PHASES: DiagnosticPhaseConfig[] = [
  {
    phase: 'A',
    title: 'Business Context',
    description: 'Tell us about your business model and current tools',
    fields: [
      {
        id: 'industry',
        label: 'Industry',
        type: 'select',
        options: ['E-commerce', 'SaaS', 'Healthcare', 'Finance', 'Manufacturing', 'Other'],
        required: true
      },
      {
        id: 'revenueModel',
        label: 'Revenue Model',
        type: 'select',
        options: ['Subscription', 'Transaction-based', 'Service-based', 'Product sales', 'Mixed'],
        required: true
      },
      {
        id: 'channels',
        label: 'Sales/Service Channels',
        type: 'multiselect',
        options: ['Website', 'Mobile App', 'Physical Store', 'Phone', 'Email', 'Social Media'],
        helperText: 'Select all that apply'
      },
      {
        id: 'tools',
        label: 'Current Tools & Platforms',
        type: 'textarea',
        placeholder: 'List your main tools (CRM, payment processor, etc.)',
        helperText: 'Comma-separated list'
      }
    ]
  },
  {
    phase: 'B',
    title: 'Operational Pain Points',
    description: 'Identify where time and resources are being wasted',
    fields: [
      {
        id: 'timeWaste',
        label: 'Biggest Time Wasters',
        type: 'textarea',
        placeholder: 'Describe manual tasks that consume the most time',
        required: true
      },
      {
        id: 'manualProcesses',
        label: 'Manual Processes',
        type: 'textarea',
        placeholder: 'List processes that require manual intervention',
        helperText: 'One per line'
      },
      {
        id: 'delays',
        label: 'Common Delays',
        type: 'textarea',
        placeholder: 'What causes delays in your operations?',
        helperText: 'One per line'
      }
    ]
  },
  {
    phase: 'C',
    title: 'Data & Automation Readiness',
    description: 'Assess your current data infrastructure and integration capabilities',
    fields: [
      {
        id: 'hasCRM',
        label: 'Do you use a CRM?',
        type: 'select',
        options: ['Yes', 'No'],
        required: true
      },
      {
        id: 'crmName',
        label: 'CRM Name',
        type: 'text',
        placeholder: 'e.g., Salesforce, HubSpot',
        helperText: 'Only if you answered Yes above'
      },
      {
        id: 'structuredData',
        label: 'Is your data structured and accessible?',
        type: 'select',
        options: ['Yes', 'Partially', 'No'],
        required: true
      },
      {
        id: 'dataDescription',
        label: 'Data Description',
        type: 'textarea',
        placeholder: 'Describe where your data lives and how it\'s organized'
      },
      {
        id: 'hasAPIs',
        label: 'Do your tools have APIs?',
        type: 'select',
        options: ['Yes', 'Some', 'No', 'Not sure'],
        required: true
      },
      {
        id: 'integrations',
        label: 'Existing Integrations',
        type: 'textarea',
        placeholder: 'List any existing integrations or APIs you use',
        helperText: 'One per line'
      }
    ]
  },
  {
    phase: 'D',
    title: 'Strategic Goals',
    description: 'Define what you want to achieve with AI automation',
    fields: [
      {
        id: 'primaryGoal',
        label: 'Primary Goal',
        type: 'textarea',
        placeholder: 'What is your main objective for AI automation?',
        required: true
      },
      {
        id: 'kpis',
        label: 'Key Performance Indicators',
        type: 'textarea',
        placeholder: 'How will you measure success?',
        helperText: 'One per line'
      },
      {
        id: 'timeline',
        label: 'Timeline',
        type: 'select',
        options: ['1-3 months', '3-6 months', '6-12 months', '12+ months'],
        required: true
      }
    ]
  }
]

/**
 * API Request/Response Types for VPS Bridge Integration
 */

export interface DiagnosticRequest {
  organization_id: string
  diagnostic_data: DiagnosticData
}

export interface DiagnosticResponse {
  diagnostic_id: string
  ai_readiness_score: number
  maturity_level: 'Initial' | 'Developing' | 'Defined' | 'Managed' | 'Optimizing'
  primary_constraints: string[]
  timestamp: string
}


// ============================================================================
// Deep Diagnostic Result Page — DiagnosticContext types (v2)
// ============================================================================

export type DimensionKey = 'strategy' | 'data' | 'process' | 'people' | 'governance'
export type MaturityLevel = 'Nascent' | 'Initiating' | 'Developing' | 'Defined' | 'Optimizing'
export type OpportunityQuadrant = 'quick_win' | 'major_project' | 'fill_in' | 'thankless_task'

export interface ROIProjection {
  /** Monetary savings stored in the user's selected local currency (never hardcoded IDR) */
  annualLaborSavingsLocal: number | null
  annualProcessSavingsLocal: number | null
  totalAnnualSavingsLocal: number | null
  costOfInaction90DaysLocal: number | null
  /** Raw USD values — used for formula verification and audit logging (Bug 3 fix) */
  totalAnnualSavingsUSD: number | null
  hoursReclaimedPerYear: number | null
  paybackMonths: number | null
  threeYearROIPercent: number | null
  hasEnoughDataForProjection: boolean
  confidenceLevel: 'high' | 'medium' | 'low'
  missingInputs: string[]
  /** @deprecated Use annualLaborSavingsLocal — kept for backward compat with stored contexts */
  annualLaborSavingsIDR?: number | null
  /** @deprecated Use annualProcessSavingsLocal — kept for backward compat with stored contexts */
  annualProcessSavingsIDR?: number | null
  /** @deprecated Use totalAnnualSavingsLocal — kept for backward compat with stored contexts */
  totalAnnualSavingsIDR?: number | null
  /** @deprecated Use costOfInaction90DaysLocal — kept for backward compat with stored contexts */
  costOfInaction90DaysIDR?: number | null
}

export interface DimensionScores {
  strategy: number
  data: number
  process: number
  people: number
  governance: number
  composite: number
  maturityLevel: MaturityLevel
  weakestDimension: DimensionKey
  strongestDimension: DimensionKey
}

export interface RiskFlag {
  id: string
  risk: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  source: string
  detected: boolean
}

export interface RankedOpportunity {
  id: string
  title: string
  impact: number
  effort: number
  quadrant: OpportunityQuadrant
  timeToValueWeeks: number
  /** Estimated savings in the user's selected local currency (currency-neutral). */
  estimatedSavingsLocal: number | null
  projectedROINote: string
  prerequisites: string[]
  dataReadiness: 'ready' | 'needs_prep' | 'not_ready'
  complexity: 'low' | 'medium' | 'high'
  /** @deprecated Use estimatedSavingsLocal — kept for backward compat with stored contexts */
  estimatedSavingsIDR?: number | null
}

export interface DiagnosticContext {
  company: string
  /** ISO currency code selected by the user (e.g. 'IDR', 'USD') */
  currency?: string
  submittedAt: string
  quantitative: {
    ticketVolumePerDay: number | null
    ahtCurrentMinutes: number | null
    ahtTargetMinutes: number | null
    costCurrentPerTicket: number | null
    costTargetPerTicket: number | null
    totalManualHoursWeekly: number | null
    fteCountInScope: number | null
    currentAutomationPct: number | null
    targetAutomationPct: number | null
    budgetMidpointUSD: number | null
    timelineMonths: number | null
  }
  calculations: ROIProjection
  scores: DimensionScores
  opportunities: RankedOpportunity[]
  risks: RiskFlag[]
  qualitative: {
    primaryObjective: string
    topPainPoints: string
    compliance: string[]
    implementApproach: string
    aiCapability: string
    leadershipAlignment: string
    priorAIAttempts: string
    resistanceSources: string[]
    delayConsequence: string
    errorTolerance: string
    dataResidency: string
    /** Raw annual_revenue answer — used for pre-revenue framing in UI */
    annualRevenue?: string
  }
}

export type DiagnosticAnswers = Record<string, any>