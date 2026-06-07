import { FreeDiagnosticQuestion } from '@/types/freeDiagnostic'

/**
 * The 12 Free Diagnostic questions
 * Each question has exactly 4 options representing a maturity spectrum from low (0) to high (3)
 */
export const FREE_DIAGNOSTIC_QUESTIONS: FreeDiagnosticQuestion[] = [
  {
    id: 'business_objective',
    question: 'What is your primary business objective for AI?',
    options: [
      'No clear objective',
      'Vague goals (e.g., "be innovative")',
      'Specific goal (e.g., "reduce costs")',
      'Quantified goal (e.g., "reduce costs by 20%")'
    ]
  },
  {
    id: 'current_ai_usage',
    question: 'What is your current AI usage?',
    options: [
      'No AI usage',
      'Exploring/researching',
      'Running pilots',
      'Production deployment'
    ]
  },
  {
    id: 'data_availability',
    question: 'How is your data availability & quality?',
    options: [
      'No centralized data',
      'Siloed data across departments',
      'Partially centralized',
      'Fully centralized and accessible'
    ]
  },
  {
    id: 'process_documentation',
    question: 'What is your level of process documentation?',
    options: [
      'No documentation',
      'Informal/tribal knowledge',
      'Some processes documented',
      'Comprehensive documentation'
    ]
  },
  {
    id: 'workflow_standardization',
    question: 'How standardized are your workflows?',
    options: [
      'Ad-hoc workflows',
      'Some standardization',
      'Mostly standardized',
      'Fully standardized'
    ]
  },
  {
    id: 'erp_integration',
    question: 'What is your ERP / system integration level?',
    options: [
      'No systems',
      'Disconnected systems',
      'Some integration',
      'Fully integrated'
    ]
  },
  {
    id: 'automation_level',
    question: 'What is your current automation level?',
    options: [
      'Fully manual',
      'Minimal automation (<10%)',
      'Moderate automation (10-50%)',
      'High automation (>50%)'
    ]
  },
  {
    id: 'decision_speed',
    question: 'How fast is your decision-making?',
    options: [
      'Months',
      'Weeks',
      'Days',
      'Hours'
    ]
  },
  {
    id: 'leadership_alignment',
    question: 'What is your leadership alignment on AI?',
    options: [
      'No alignment',
      'Some interest',
      'Supportive',
      'Championing AI'
    ]
  },
  {
    id: 'budget_ownership',
    question: 'What is your budget situation for AI?',
    options: [
      'No budget',
      'Exploring budget',
      'Budget allocated',
      'Dedicated AI budget'
    ]
  },
  {
    id: 'change_readiness',
    question: 'How ready is your organization for change?',
    options: [
      'Resistant to change',
      'Cautious',
      'Open to change',
      'Embracing change'
    ]
  },
  {
    id: 'internal_capability',
    question: 'What is your internal AI capability?',
    options: [
      'No technical team',
      'Limited technical skills',
      'Some AI knowledge',
      'Strong AI team'
    ]
  }
]
