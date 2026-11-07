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
  /** Optional company website, forwarded to the bridge as `_website_url` (ADR-022). */
  websiteUrl?: string
  /** Optional company document: text extracted on the server, forwarded as `_document_text`. Never required. */
  documentText?: string
  documentName?: string
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
  maturity_level: 'Nascent' | 'Initiating' | 'Developing' | 'Defined' | 'Optimising'
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
  /** Present only when a website was sent and the bridge feature is on. */
  web_context?: 'ok' | 'partial' | 'unavailable' | 'social_only' | 'document'
  web_profile?: Record<string, unknown>
  /** 0-3 observations tying the website to the user's answers (only with a profile). */
  website_insights?: string[]
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
