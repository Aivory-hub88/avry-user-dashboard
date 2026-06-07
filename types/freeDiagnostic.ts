/**
 * TypeScript interfaces for the Free Diagnostic v2 feature
 */

// Free Diagnostic Question Structure
export interface FreeDiagnosticQuestion {
  id: string
  question: string
  options: string[] // Always 4 options, index 0-3
}

// Answer format for API submission
export interface FreeDiagnosticAnswers {
  [questionId: string]: number // Option index 0-3
}

// API Request payload
export interface FreeDiagnosticRequest {
  organization_id: string
  answers: FreeDiagnosticAnswers
}

// API Response payload
export interface FreeDiagnosticResponse {
  diagnostic_id: string
  score: number // 0-100
  maturity_level: 'Initial' | 'Developing' | 'Defined' | 'Managed' | 'Optimizing'
  strengths: string[] // Top 3 strengths
  blockers: string[] // Top blocker
  opportunities: string[] // Top opportunity
  narrative: string // 1-2 paragraphs
  timestamp: string
}

// localStorage storage format
export interface FreeDiagnosticResult extends FreeDiagnosticResponse {
  // Same as response, stored directly
}

// Component state types
export interface QuestionFlowState {
  currentQuestionIndex: number
  answers: FreeDiagnosticAnswers
  isSubmitting: boolean
  validationError: string | null
}

export interface ResultPageState {
  result: FreeDiagnosticResult | null
  isLoading: boolean
  error: string | null
}
