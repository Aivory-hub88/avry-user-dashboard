import {
  FreeDiagnosticAnswers,
  FreeDiagnosticResponse,
  FreeDiagnosticResult
} from '@/types/freeDiagnostic'

/**
 * Service for managing Free Diagnostic operations
 * Handles API calls to VPS Bridge and localStorage persistence
 */
export class FreeDiagnosticService {
  private static readonly STORAGE_KEY = 'free_diagnostic_result'

  /**
   * Submit diagnostic answers to VPS Bridge
   */
  static async submitDiagnostic(
    organizationId: string,
    answers: FreeDiagnosticAnswers
  ): Promise<FreeDiagnosticResponse> {
    const response = await fetch('/api/diagnostics/free/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        organization_id: organizationId,
        answers
      })
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Failed to submit diagnostic' }))
      throw new Error(error.message || 'Failed to submit diagnostic')
    }

    const result: FreeDiagnosticResponse = await response.json()
    
    // Validate response structure — normalize ai_readiness_score → score
    if (!result.diagnostic_id) {
      throw new Error('Invalid response format from server')
    }

    // VPS Bridge may return ai_readiness_score; normalize to score
    if (typeof (result as any).ai_readiness_score === 'number' && typeof result.score !== 'number') {
      (result as any).score = (result as any).ai_readiness_score
    }

    // VPS Bridge returns narrative_summary; normalize to narrative
    if ((result as any).narrative_summary && !(result as any).narrative) {
      (result as any).narrative = (result as any).narrative_summary
    }

    if (typeof result.score !== 'number' || !result.maturity_level) {
      throw new Error('Invalid response format from server')
    }

    return result
  }

  /**
   * Save result to localStorage
   */
  static saveResult(result: FreeDiagnosticResult): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(result))
    } catch (error) {
      console.error('[FreeDiagnostic] Failed to save diagnostic result:', error)
    }
  }

  /**
   * Retrieve result from localStorage
   */
  static getResult(): FreeDiagnosticResult | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY)
      if (!stored) return null
      
      const result = JSON.parse(stored) as FreeDiagnosticResult
      
      // Normalize ai_readiness_score → score if needed
      if (typeof result.score !== 'number' && typeof (result as any).ai_readiness_score === 'number') {
        (result as any).score = (result as any).ai_readiness_score
      }

      // Normalize narrative_summary → narrative if needed
      if (!(result as any).narrative && (result as any).narrative_summary) {
        (result as any).narrative = (result as any).narrative_summary
      }

      // Validate stored data structure
      if (!result.diagnostic_id || typeof result.score !== 'number') {
        console.warn('[FreeDiagnostic] Invalid stored data, clearing')
        this.clearResult()
        return null
      }
      
      return result
    } catch (error) {
      console.error('[FreeDiagnostic] Failed to retrieve diagnostic result:', error)
      return null
    }
  }

  /**
   * Check if diagnostic is completed
   */
  static isCompleted(): boolean {
    return this.getResult() !== null
  }

  /**
   * Clear stored result
   */
  static clearResult(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY)
    } catch (error) {
      console.error('[FreeDiagnostic] Failed to clear diagnostic result:', error)
    }
  }
}
