/**
 * User Context State Engine
 * 
 * Reads user's current state (diagnostic results, blueprint, roadmap)
 * from localStorage and produces a sanitized context object that can be
 * sent to the AI console. This allows Zeroclaw to give contextual responses
 * without the user having to explain their situation each time.
 * 
 * SECURITY: Never include internal tech stack details, API keys, LLM models,
 * VPS config, state machine details, or any confidential platform internals.
 * Only user-facing data and summaries are included.
 */

export interface UserContextState {
  has_diagnostic: boolean
  has_blueprint: boolean
  has_roadmap: boolean
  diagnostic_summary: string | null
  blueprint_summary: string | null
  tier: string | null
  is_subscription_member: boolean
  has_purchased_onetime_service: boolean
}

/**
 * Build a sanitized user context from localStorage data.
 * Returns a compact string that gets prepended to the user's message context.
 */
export function buildUserContextState(): UserContextState {
  const state: UserContextState = {
    has_diagnostic: false,
    has_blueprint: false,
    has_roadmap: false,
    diagnostic_summary: null,
    blueprint_summary: null,
    tier: null,
    is_subscription_member: false,
    has_purchased_onetime_service: false,
  }

  try {
    // Check diagnostic result
    const diagnosticRaw = localStorage.getItem('aivory_diagnostic_context')
    if (diagnosticRaw) {
      const diag = JSON.parse(diagnosticRaw)
      state.has_diagnostic = true

      // Build a safe summary from scores and key findings
      if (diag.scores) {
        const scores = diag.scores
        const overallAvg = Math.round(
          (Object.values(scores) as number[]).reduce((a, b) => a + b, 0) /
          Object.keys(scores).length
        )
        const dims = Object.entries(scores)
          .map(([k, v]) => `${k}: ${v}/100`)
          .join(', ')
        state.diagnostic_summary = `Overall operational health: ${overallAvg}/100. Dimensions: ${dims}.`

        // Add top risk if available
        if (diag.risks && Array.isArray(diag.risks) && diag.risks.length > 0) {
          const topRisk = diag.risks[0]
          if (topRisk.risk) {
            state.diagnostic_summary += ` Top risk: ${topRisk.risk.slice(0, 120)}.`
          }
        }

        // Add ROI summary if available
        if (diag.calculations) {
          const calc = diag.calculations
          if (calc.annualSavingsUSD) {
            state.diagnostic_summary += ` Projected annual savings: $${Math.round(calc.annualSavingsUSD).toLocaleString()}.`
          }
        }
      }
    }

    // Check blueprint
    const blueprintRaw = localStorage.getItem('aivory_blueprint')
    if (blueprintRaw) {
      const bp = JSON.parse(blueprintRaw)
      state.has_blueprint = true

      // Safe summary from blueprint
      if (bp.summary || bp.executive_summary) {
        state.blueprint_summary = (bp.summary || bp.executive_summary || '').slice(0, 200)
      } else if (bp.title) {
        state.blueprint_summary = `Blueprint: ${bp.title}`
      }
    }

    // Check roadmap
    const roadmapRaw = localStorage.getItem('aivory_roadmap')
    if (roadmapRaw) {
      state.has_roadmap = true
    }

    // Check tier and subscription
    const tierRaw = localStorage.getItem('aivory_tier') || localStorage.getItem('user_tier')
    if (tierRaw) {
      state.tier = tierRaw
      if (['pro', 'enterprise', 'premium', 'active'].includes(tierRaw.toLowerCase())) {
        state.is_subscription_member = true
      }
    }
    
    // Explicit subscription flag
    if (localStorage.getItem('aivory_subscription_status') === 'active') {
      state.is_subscription_member = true
    }

    // Check one-time service purchases
    const purchasesRaw = localStorage.getItem('aivory_purchased_services')
    if (purchasesRaw) {
      try {
        const purchases = JSON.parse(purchasesRaw)
        if (Array.isArray(purchases) && purchases.length > 0) {
          state.has_purchased_onetime_service = true
        }
      } catch {
        state.has_purchased_onetime_service = true // fallback if it's just a boolean or string
      }
    }
    
    // If they have diagnostic/blueprint/roadmap, imply they purchased or unlocked them
    if (state.has_diagnostic || state.has_blueprint || state.has_roadmap) {
      state.has_purchased_onetime_service = true
    }
  } catch {
    // localStorage unavailable or parse error — return defaults
  }

  return state
}

/**
 * Convert user context state to a compact string for injection into the AI message.
 * Only includes relevant data (non-null, non-false values).
 * Keeps the format minimal to avoid hitting Zeroclaw's payload size limits.
 */
export function formatUserContextForAI(state: UserContextState): string {
  const parts: string[] = []

  parts.push(`[USER STATE: `)

  if (state.has_diagnostic) {
    parts.push(`Has completed Deep Diagnostic.`)
    if (state.diagnostic_summary) {
      parts.push(` Results: ${state.diagnostic_summary}`)
    }
  } else {
    parts.push(`No diagnostic completed yet.`)
  }

  if (state.has_blueprint) {
    parts.push(` Has Transformation Blueprint.`)
    if (state.blueprint_summary) {
      parts.push(` ${state.blueprint_summary}`)
    }
  } else {
    parts.push(` No blueprint yet.`)
  }

  if (state.has_roadmap) {
    parts.push(` Has AI Roadmap.`)
  }

  if (state.tier) {
    parts.push(` Tier: ${state.tier}.`)
  }

  if (state.is_subscription_member) {
    parts.push(` Active Subscription Member.`)
  }

  if (state.has_purchased_onetime_service) {
    parts.push(` Purchased One-Time Services.`)
  }

  parts.push(`]`)

  return parts.join('')
}
