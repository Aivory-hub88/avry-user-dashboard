/**
 * TypeScript interfaces for the Deep Diagnostic Flow feature
 */

// Phase identifiers
export type PhaseId = 
  | 'business_objective_kpi'
  | 'data_process_readiness'
  | 'risk_constraints'
  | 'ai_opportunity_mapping'

// Question types
export type QuestionType = 'text' | 'textarea' | 'select' | 'multiselect' | 'number' | 'radio'

// Question definition
export interface DeepDiagnosticQuestion {
  id: string
  question: string
  type: QuestionType
  options?: string[]
  placeholder?: string
  helperText?: string
  required: boolean
  validation?: {
    minLength?: number
    maxLength?: number
    min?: number
    max?: number
    pattern?: string
  }
}

// Phase configuration
export interface PhaseConfig {
  id: PhaseId
  title: string
  description: string
  questions: DeepDiagnosticQuestion[]
}

// Phase data storage
export interface PhaseData {
  completed: boolean
  responses: Record<string, any>
}

// localStorage structure
export interface DeepDiagnosticProgress {
  phases: Record<PhaseId, PhaseData>
  currentPhase: PhaseId
  lastUpdated: string
  companyName?: string
}

// API Request payload
export interface DeepDiagnosticRequest {
  organization_id: string
  mode: 'deep'
  phases: Record<PhaseId, Record<string, any>>
}

// API Response payload
export interface DeepDiagnosticResponse {
  diagnostic_id: string
  score: number
  maturity_level: 'Initial' | 'Developing' | 'Defined' | 'Managed' | 'Optimizing'
  dimensions: {
    business_alignment: number
    data_readiness: number
    process_maturity: number
    risk_management: number
    opportunity_identification: number
  }
  strengths: string[]
  blockers: string[]
  opportunities: string[]
  narrative: string
  recommendations: string[]
  timestamp: string
}

// localStorage result storage
export interface DeepDiagnosticResult extends DeepDiagnosticResponse {
  // Same as response
}

// Blueprint generation request
export interface BlueprintGenerationRequest {
  diagnostic_id: string
}

// Blueprint generation response
export interface BlueprintGenerationResponse {
  blueprint_id: string
  status: 'generating' | 'completed'
  redirect_url: string
}
