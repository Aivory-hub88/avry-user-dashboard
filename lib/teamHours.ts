/**
 * One line that shows how the team's manual hours were derived, so the savings are never a mystery number:
 * "10 people x 3.5 h/person/week = 35 h/week". Only for answers given per person (new intake); reports
 * saved with a team-wide total have nothing to show here.
 */
type Locale = 'en' | 'id'

export interface TeamHoursSource {
  totalManualHoursWeekly?: number | null
  manualHoursPerPersonWeekly?: number | null
  teamSizeCounted?: number | null
  teamSizeSource?: 'solo' | 'fte' | 'assumed_one' | 'team_total'
}

const h = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1))

export function describeTeamHours(q: TeamHoursSource | null | undefined, locale: Locale): string | null {
  if (!q || q.manualHoursPerPersonWeekly == null || q.teamSizeCounted == null || !q.teamSizeSource || q.teamSizeSource === 'team_total') return null
  const per = q.manualHoursPerPersonWeekly
  const n = q.teamSizeCounted
  const total = q.totalManualHoursWeekly ?? per * n
  const id = locale === 'id'
  if (q.teamSizeSource === 'assumed_one') {
    return id
      ? `Dihitung untuk 1 orang (${h(per)} jam/minggu) karena ukuran tim tidak diisi. Isi ukuran tim agar nilai mencerminkan seluruh tim.`
      : `Counted for 1 person (${h(per)} h/week) because team size was not given. Give your team size so the value reflects the whole team.`
  }
  if (q.teamSizeSource === 'solo') {
    return id ? `1 orang × ${h(per)} jam/minggu` : `1 person × ${h(per)} h/week`
  }
  return id
    ? `${n} orang × ${h(per)} jam/orang/minggu = ${h(total)} jam/minggu kerja manual`
    : `${n} people × ${h(per)} h/person/week = ${h(total)} h/week of manual work`
}
