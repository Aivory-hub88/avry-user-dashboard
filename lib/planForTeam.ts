/**
 * Which Aivory plan to recommend for a team.
 *
 * Solo (company size "Solo / Freelancer (1 person)") -> Operational (1 seat).
 * Anyone else (more than one person) -> Business (up to 5 seats), or Enterprise
 * (15+ seats, by contract) for more than 200 employees in scope. Operational is never
 * recommended for a team: it has one seat.
 *
 * Company size is a REQUIRED question, so it is the reliable solo signal; the optional
 * "employees in scope" answer only decides Business vs Enterprise. Reports saved before
 * company size was stored fall back to the employee count (1 = solo).
 */
export type TeamPlan = 'operational' | 'business' | 'enterprise'

export const SOLO_COMPANY_SIZE = 'Solo / Freelancer (1 person)'

export function planForTeam(
  fteCountInScope: number | null | undefined,
  companySize?: string | null,
): { plan: TeamPlan; assumed: boolean } {
  const fte = fteCountInScope ?? null
  const size = companySize ? companySize.trim() : null
  const solo = size !== null ? size === SOLO_COMPANY_SIZE : fte === 1
  if (solo) return { plan: 'operational', assumed: false }
  // Nothing at all is known about the team: assume the entry plan and say so.
  if (size === null && fte === null) return { plan: 'operational', assumed: true }
  if (fte !== null && fte > 200) return { plan: 'enterprise', assumed: false }
  return { plan: 'business', assumed: false }
}
