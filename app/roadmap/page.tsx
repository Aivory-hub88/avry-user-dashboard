'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { loadRoadmap, saveRoadmap } from '@/hooks/useRoadmap';
import type { AiryRoadmap, AiryRoadmapPhase, AiryRoadmapKpi, AiryRoadmapMilestone } from '@/types/roadmap';
import { useRouterContext } from '@/contexts/RouterContext';
import { ContinuedFromConsole } from '@/components/routing/ContinuedFromConsole';

// ─── colour tokens ────────────────────────────────────────────
const T = {
  bg:           '#353531',
  card:         'rgba(255,255,255,0.03)',
  cardSolid:    '#242320',
  cardHover:    'rgba(255,255,255,0.05)',
  border:       'rgba(255,255,255,0.07)',
  borderGreen:  '#666864',
  green:        '#b7cba6',
  greenDim:     '#282827',
  greenGlow:    'rgba(255,255,255,0.08)',
  purple:       '#b7cba6',
  purpleDim:    '#282827',
  purpleBorder: '#666864',
  text:         '#f0ede9',
  textSub:      '#dddac5',
  textMuted:    '#dddac5',
  red:          '#f87171',
  redDim:       'rgba(248,113,113,0.08)',
  yellow:       '#fbbf24',
  yellowDim:    'rgba(251,191,36,0.10)',
};

// ─── localStorage keys ────────────────────────────────────────
const LS_CHECKED_PREFIX = 'aivory_roadmap_checked_';
const LS_KPI_ACTUALS    = 'aivory_roadmap_kpi_actuals';
const LS_START_DATE     = 'aivory_roadmap_start_date';
const LS_PHASE_COMPLETE = 'aivory_roadmap_phase_complete';

// ─── Cover page intro ─────────────────────────────────────────
const COVER_INTRO = 'This AI Implementation Roadmap translates the findings from your AI Readiness Assessment and the architectural decisions captured in your System Blueprint into a phased, milestone-driven execution plan. Use it to track deployment progress by checking off milestones, recording KPI actuals against targets, and exporting a snapshot at the end of each phase for stakeholder review. Successful completion at Month 12 means your organization will have automated 62.5% of targeted workflows, reclaimed 361 hours of annual capacity, and established a repeatable framework for the next investment cycle.';

// ─── Contextual phase descriptions (Feature 3) ───────────────
const PHASE_DESCRIPTIONS: Record<number, string> = {
  0: 'Start here. The goal is to prove AI works in your environment by shipping 3 automated workflows in 90 days. Every 90 days of delay costs your organization approximately $3,525 in unrealized savings, so speed matters more than perfection in this phase. Automated Reporting goes first because its 5-week time to value is the fastest of all modules, and the data pipelines it establishes become the foundation that CS Ticket Automation and Process Automation depend on. Phase 1 is complete when your team has three workflows running in production, at least 10 hours per week are being reclaimed, and your internal stakeholders can point to measurable proof that AI delivers results in your environment.',
  1: 'With quick wins validated, this phase expands automation into the core revenue-impacting area: CS Ticket Automation. The 40% automation coverage target is deliberately conservative — this phase prioritizes operational stability over speed, ensuring each workflow is reliable before adding the next. Connecting your CRM and communication tools is a hard prerequisite because CS Ticket Automation cannot function without real-time access to customer data and routing logic. Do not advance to Phase 3 until you have at least 5 workflows running in production; proceeding earlier creates measurement gaps that undermine the ROI validation work ahead.',
  2: 'Shift from building to measuring. If your actual annual savings are tracking below the $14,296 target, check two factors first: the efficiency factor applied to each automated workflow and whether automation coverage has genuinely reached the projected 62.5%. The 80% team adoption rate target means more than login frequency — it means team members are incorporating AI tools into their daily workflow without being prompted, a behavioral shift that typically requires 4–6 weeks of reinforcement after deployment. Success at Month 12 builds the quantitative case for the next investment cycle, demonstrating that your $30,000 initial investment is on track to deliver a 43% return over three years.',
};

// ─── Milestone resource links (Feature 4) ─────────────────────
const MILESTONE_RESOURCES: Record<string, { link: string; label: string }> = {
  'deploy first': { link: '/blueprint#workflow-module-1', label: 'Blueprint: Workflow Module 1' },
  'first automated workflow': { link: '/blueprint#workflow-module-1', label: 'Blueprint: Workflow Module 1' },
  'connect crm': { link: '/blueprint#data-sources', label: 'Blueprint: Data Sources' },
  'communication tools': { link: '/blueprint#data-sources', label: 'Blueprint: Data Sources' },
  'review kpi': { link: '/diagnostics/deep/result#roi', label: 'Readiness Report: ROI Projection' },
  'kpi performance': { link: '/diagnostics/deep/result#roi', label: 'Readiness Report: ROI Projection' },
};

function getResourceForMilestone(title: string): { link: string; label: string } | null {
  const lower = title.toLowerCase();
  for (const [keyword, resource] of Object.entries(MILESTONE_RESOURCES)) {
    if (lower.includes(keyword)) return resource;
  }
  return null;
}

// ─── KPI color indicator logic (Feature 2) ────────────────────
function parseNumeric(v: string): number | null {
  const cleaned = v.replace(/[^0-9.]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function getKpiStatus(target: string, actual: string | undefined): 'green' | 'yellow' | 'red' | 'none' {
  if (!actual || actual.trim() === '') return 'none';
  const t = parseNumeric(target);
  const a = parseNumeric(actual);
  if (t === null || a === null || t === 0) return 'none';
  const ratio = a / t;
  if (ratio >= 1) return 'green';
  if (ratio >= 0.5) return 'yellow';
  return 'red';
}

const STATUS_COLORS = {
  green:  { bg: 'rgba(76,175,80,0.12)', border: 'rgba(76,175,80,0.35)', dot: '#4CAF50' },
  yellow: { bg: T.yellowDim, border: 'rgba(251,191,36,0.3)', dot: T.yellow },
  red:    { bg: T.redDim, border: 'rgba(248,113,113,0.25)', dot: T.red },
  none:   { bg: 'transparent', border: 'transparent', dot: 'transparent' },
};

// ─── Aivory trigger ─────────────────────────────────────────────
// Context (page/mode/roadmap) is driven by the current route in AivoryAssistant,
// NOT by the prefill text. The pageContext here is supplementary metadata only.
const openAivoryAssistant = (msg: string, pageContext?: Record<string, unknown>) =>
  window.dispatchEvent(new CustomEvent('aivory-assistant:open', {
    detail: {
      prefill: msg,
      sourceTab: 'roadmap',
      pageContext: pageContext ?? {},
    }
  }));

// ─── SVG icons ────────────────────────────────────────────────
const IconGear = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M13.3 8c0-.2 0-.5-.1-.7l1.5-1.2-1.4-2.4-1.8.7a5 5 0 0 0-1.2-.7L10 2H6l-.3 1.7a5 5 0 0 0-1.2.7l-1.8-.7L1.3 6.1l1.5 1.2c0 .2-.1.5-.1.7s0 .5.1.7L1.3 9.9l1.4 2.4 1.8-.7c.4.3.8.5 1.2.7L6 14h4l.3-1.7c.4-.2.8-.4 1.2-.7l1.8.7 1.4-2.4-1.5-1.2c.1-.2.1-.5.1-.7Z" stroke="currentColor" strokeWidth="1.4"/>
  </svg>
);
const IconArrows = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M2 8h12M10 4l4 4-4 4M6 4 2 8l4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconChart = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path d="M2 12l3.5-4 3 3 3-5 2.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconCheck = () => (
  <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
    <path d="M1 4.5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconChevron = ({ open }: { open: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden
    style={{ transition: 'transform 0.2s', transform: open ? 'rotate(90deg)' : 'none', color: T.textMuted }}>
    <path d="M5 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const IconHelp = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
    <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M5.5 5.5a1.5 1.5 0 1 1 1.5 1.5v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    <circle cx="7" cy="10.5" r="0.5" fill="currentColor"/>
  </svg>
);
const IconLink = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
    <path d="M5 7l2-2M4.5 8.5l-1.3 1.3a1.5 1.5 0 0 1-2.1-2.1L2.4 6.4M7.5 3.5l1.3-1.3a1.5 1.5 0 0 1 2.1 2.1L9.6 5.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
  </svg>
);
const IconDownload = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
    <path d="M7 2v7M4 7l3 3 3-3M3 12h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
const PHASE_ICONS = [<IconGear key="g"/>, <IconArrows key="a"/>, <IconChart key="c"/>];

// ─── Overall Progress Bar (Feature 1) ─────────────────────────
function OverallProgressBar({ phases, allChecked, activeIdx, onNodeClick }: {
  phases: AiryRoadmapPhase[];
  allChecked: Record<string, Record<string, boolean>>;
  activeIdx: number;
  onNodeClick: (idx: number) => void;
}) {
  const [startDate, setStartDate] = useState<string>('');
  const [daysElapsed, setDaysElapsed] = useState<number | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(LS_START_DATE);
    if (stored) {
      setStartDate(stored);
      setDaysElapsed(Math.floor((Date.now() - new Date(stored).getTime()) / 86400000));
    }
  }, []);

  const handleDateChange = (val: string) => {
    setStartDate(val);
    localStorage.setItem(LS_START_DATE, val);
    if (val) {
      setDaysElapsed(Math.floor((Date.now() - new Date(val).getTime()) / 86400000));
    } else {
      setDaysElapsed(null);
    }
  };

  const totalMilestones = phases.reduce((sum, p) => sum + p.milestones.length, 0);
  const checkedMilestones = phases.reduce((sum, p) => {
    const phaseChecked = allChecked[p.id] || {};
    return sum + Object.values(phaseChecked).filter(Boolean).length;
  }, 0);
  const overallPct = totalMilestones > 0 ? Math.round((checkedMilestones / totalMilestones) * 100) : 0;

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 20,
      background: 'rgba(53,53,49,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      borderBottom: `1px solid ${T.border}`,
      padding: '12px 20px',
      display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    }}>
      {/* Overall % */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: `conic-gradient(${T.green} ${overallPct * 3.6}deg, rgba(255,255,255,0.06) 0deg)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%', background: '#353531',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, color: T.green,
          }}>{overallPct}%</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>
            {checkedMilestones}/{totalMilestones} milestones
          </span>
          <span style={{ fontSize: 10, color: T.textMuted }}>completed</span>
        </div>
      </div>

      {/* Phase pills */}
      <div style={{ display: 'flex', gap: 4, flex: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
        {phases.map((p, i) => (
          <button key={p.id} onClick={() => onNodeClick(i)} style={{
            fontSize: 11, fontWeight: i === activeIdx ? 700 : 500,
            padding: '4px 12px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit',
            background: i === activeIdx ? T.greenDim : 'transparent',
            color: i === activeIdx ? T.green : T.textMuted,
            border: `1px solid ${i === activeIdx ? T.borderGreen : 'transparent'}`,
            transition: 'all 0.15s', whiteSpace: 'nowrap',
          }}>
            Phase {i + 1}
          </button>
        ))}
      </div>

      {/* Days elapsed + start date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {daysElapsed !== null && (
          <span style={{ fontSize: 11, color: T.textMuted, fontVariantNumeric: 'tabular-nums' }}>
            Day {daysElapsed}
          </span>
        )}
        <input
          type="date"
          value={startDate}
          onChange={e => handleDateChange(e.target.value)}
          title="Set project start date"
          style={{
            fontSize: 11, padding: '4px 8px', borderRadius: 6,
            background: 'rgba(255,255,255,0.04)', color: T.textSub,
            border: `1px solid ${T.border}`, fontFamily: 'inherit',
            outline: 'none', cursor: 'pointer',
            colorScheme: 'dark',
          }}
        />
      </div>
    </div>
  );
}

// ─── CSS Timeline (pure CSS, no React Flow) ───────────────────
function RoadmapTimeline({ phases, activeIdx, onNodeClick }: {
  phases: AiryRoadmapPhase[];
  activeIdx: number;
  onNodeClick: (idx: number) => void;
}) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      border: `1px solid ${T.borderGreen}`,
      borderRadius: 16,
      padding: '24px 28px 20px',
      overflowX: 'auto',
      boxShadow: '0 1px 0 rgba(255,255,255,0.03) inset, 0 8px 32px rgba(0,0,0,0.35)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', position: 'relative', minWidth: 480 }}>
        {phases.map((phase, i) => {
          const isActive = i === activeIdx;
          const isLast = i === phases.length - 1;
          return (
            <div key={phase.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, position: 'relative' }}>
              {/* connector line */}
              {!isLast && (
                <div style={{
                  position: 'absolute',
                  top: 17,
                  left: 'calc(50% + 17px)',
                  right: 'calc(-50% + 17px)',
                  height: 2,
                  background: i < activeIdx
                    ? `linear-gradient(to right, ${T.green}, #666864)`
                    : 'rgba(255,255,255,0.06)',
                  zIndex: 0,
                }} />
              )}
              {/* node */}
              <button
                onClick={() => onNodeClick(i)}
                aria-label={`Go to ${phase.name}`}
                style={{
                  width: isActive ? 38 : 34,
                  height: isActive ? 38 : 34,
                  borderRadius: '50%',
                  background: isActive ? '#282827' : 'rgba(255,255,255,0.04)',
                  border: `2px solid ${isActive ? T.green : 'rgba(255,255,255,0.12)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative', zIndex: 1, flexShrink: 0,
                  cursor: 'pointer', padding: 0, fontFamily: 'inherit',
                  boxShadow: isActive ? `0 0 0 5px rgba(255,255,255,0.06), 0 0 16px rgba(0,0,0,0.2)` : 'none',
                  transition: 'all 0.2s',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? T.green : T.textMuted }}>
                  {i + 1}
                </span>
              </button>
              {/* label */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, marginTop: 10, textAlign: 'center', padding: '0 4px' }}>
                <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? T.text : T.textSub, lineHeight: 1.3 }}>
                  {phase.name}
                </span>
                <span style={{ fontSize: 11, color: T.textMuted }}>{phase.timeframe}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Milestone item (Feature 4 + 5) ──────────────────────────
function MilestoneRow({ m, checked, onToggle, onWorkflow }: {
  m: AiryRoadmapMilestone; checked: boolean;
  onToggle: () => void; onWorkflow: (id: string) => void;
}) {
  const [helpHover, setHelpHover] = useState(false);
  const resource = m.resourceLink ? { link: m.resourceLink, label: m.resourceLabel || 'View resource' } : getResourceForMilestone(m.title);
  const router = useRouter();

  const handleAskHelp = () => {
    openAivoryAssistant(
      `How do I complete "${m.title}" for a company dealing with manual data entry, slow customer onboarding, and repetitive content approval workflows?`,
      { milestone: m.title, context: 'roadmap_milestone_help' }
    );
  };

  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <button
        onClick={onToggle}
        aria-label={checked ? `Uncheck ${m.title}` : `Check ${m.title}`}
        style={{
          width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 2,
          border: `1.5px solid ${checked ? T.green : 'rgba(255,255,255,0.18)'}`,
          background: checked ? T.green : 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 0, transition: 'all 0.15s', color: '#000',
        }}
      >
        {checked && <IconCheck />}
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: '0.875rem', color: checked ? T.textMuted : T.text,
            textDecoration: checked ? 'line-through' : 'none', lineHeight: 1.45, transition: 'color 0.15s',
          }}>{m.title}</span>

          {/* Feature 5: Contextual help button */}
          <button
            onClick={handleAskHelp}
            onMouseEnter={() => setHelpHover(true)}
            onMouseLeave={() => setHelpHover(false)}
            title={`Ask: How do I complete "${m.title}"?`}
            style={{
              width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
              background: helpHover ? 'rgba(255,255,255,0.08)' : 'transparent',
              border: `1px solid ${helpHover ? T.borderGreen : 'rgba(255,255,255,0.08)'}`,
              color: helpHover ? T.green : T.textMuted,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0, transition: 'all 0.15s',
            }}
          >
            <IconHelp />
          </button>
        </div>

        {m.description && <span style={{ fontSize: '0.78rem', color: T.textMuted, lineHeight: 1.5 }}>{m.description}</span>}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 3 }}>
          {/* Feature 4: Resource link */}
          {resource && (
            <button onClick={() => router.push(resource.link)} style={{
              fontSize: 10, padding: '2px 9px', borderRadius: 20,
              background: 'rgba(76,175,80,0.08)', color: T.green,
              border: '1px solid rgba(76,175,80,0.2)', cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s',
            }}>
              <IconLink />
              {resource.label}
            </button>
          )}
          {/* Linked workflow pills */}
          {m.linkedWorkflowIds?.map(id => (
            <button key={id} onClick={() => onWorkflow(id)} style={{
              fontSize: 11, padding: '2px 9px', borderRadius: 20,
              background: '#282827', color: '#dddac5',
              border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', fontFamily: 'inherit',
            }}>{id}</button>
          ))}
        </div>
      </div>
    </li>
  );
}

// ─── KPI card (Feature 2) ─────────────────────────────────────
function KpiCard({ kpi, actual, onActualChange }: {
  kpi: AiryRoadmapKpi; actual: string; onActualChange: (val: string) => void;
}) {
  const status = getKpiStatus(kpi.target, actual);
  const colors = STATUS_COLORS[status];
  const [focused, setFocused] = useState(false);

  return (
    <div style={{
      background: status !== 'none' ? colors.bg : 'rgba(255,255,255,0.03)',
      border: `1px solid ${status !== 'none' ? colors.border : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 5,
      transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {status !== 'none' && (
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: colors.dot, flexShrink: 0 }} />
        )}
        <span style={{ fontSize: '0.68rem', color: T.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
          {kpi.label}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px' }}>TARGET</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: T.green, letterSpacing: '-0.3px' }}>
            {kpi.target}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: T.textMuted, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.4px' }}>ACTUAL</span>
          <input
            type="text"
            value={actual}
            onChange={e => onActualChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Enter actual"
            style={{
              fontSize: '0.95rem', fontWeight: 600,
              color: status === 'green' ? '#4CAF50' : status === 'yellow' ? T.yellow : status === 'red' ? T.red : T.textSub,
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${focused ? T.borderGreen : 'rgba(255,255,255,0.06)'}`,
              borderRadius: 6, padding: '4px 8px', width: '100%',
              outline: 'none', fontFamily: 'inherit', transition: 'all 0.15s',
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Phase section ────────────────────────────────────────────
function PhaseSection({ phase, index, open, phaseRef, onToggle, onWorkflow, checked, onMilestoneToggle, kpiActuals, onKpiActualChange, phaseComplete, onPhaseComplete }: {
  phase: AiryRoadmapPhase; index: number; open: boolean;
  phaseRef: { current: HTMLDivElement | null };
  onToggle: () => void; onWorkflow: (id: string) => void;
  checked: Record<string, boolean>;
  onMilestoneToggle: (milestoneId: string) => void;
  kpiActuals: Record<string, string>;
  onKpiActualChange: (kpiId: string, val: string) => void;
  phaseComplete: boolean;
  onPhaseComplete: () => void;
}) {
  const t = useTranslations("roadmap");
  const [hov, setHov] = useState(false);

  const checkedN = Object.values(checked).filter(Boolean).length;
  const total = phase.milestones.length;
  const pct = phaseComplete ? 100 : total > 0 ? Math.round((checkedN / total) * 100) : 0;
  const icon = PHASE_ICONS[index % 3];
  const contextDescription = PHASE_DESCRIPTIONS[index] || phase.description;

  return (
    <div ref={phaseRef} style={{
      background: T.card, border: `1px solid ${phaseComplete ? T.borderGreen : T.border}`,
      borderRadius: 14, overflow: 'hidden',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
      transition: 'border-color 0.2s, box-shadow 0.2s',
    }}>
      {/* header */}
      <button
        onClick={onToggle}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px', background: hov ? T.cardHover : 'transparent',
          border: 'none', cursor: 'pointer', textAlign: 'left', gap: 12,
          fontFamily: 'inherit', transition: 'background 0.15s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{
            width: 40, height: 40, borderRadius: 11, flexShrink: 0,
            background: phaseComplete ? '#282827' : T.greenDim,
            border: `1px solid ${phaseComplete ? '#666864' : T.borderGreen}`,
            color: T.green, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{icon}</span>
          <div>
            <div style={{ fontSize: '1.0625rem', fontWeight: 600, color: T.text, lineHeight: 1.3 }}>
              {phase.name}
            </div>
            <div style={{ fontSize: '0.8rem', color: T.textMuted, marginTop: 2 }}>{phase.timeframe}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {phaseComplete && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: T.greenDim, color: T.green, border: `1px solid ${T.borderGreen}`,
              textTransform: 'uppercase', letterSpacing: '0.3px',
            }}>{t("complete")}</span>
          )}
          {!phaseComplete && total > 0 && (
            <span style={{ fontSize: 11, color: T.textMuted, fontVariantNumeric: 'tabular-nums' }}>
              {checkedN}/{total}
            </span>
          )}
          <IconChevron open={open} />
        </div>
      </button>

      {/* progress bar */}
      <div style={{ height: 3, background: 'rgba(255,255,255,0.04)' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: `linear-gradient(to right, ${T.green}, #555553)`,
          transition: 'width 0.4s ease', borderRadius: '0 2px 2px 0',
        }} />
      </div>

      {/* body */}
      {open && (
        <div style={{ padding: '0 20px 22px', display: 'flex', flexDirection: 'column', gap: 20, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
          {/* Feature 3: Contextual description */}
          {contextDescription && (
            <p style={{ fontSize: '0.9rem', color: T.textSub, lineHeight: 1.65, margin: '14px 0 0' }}>
              {contextDescription}
            </p>
          )}

          {phase.milestones.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
                {t("milestones")}
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 9 }}>
                {phase.milestones.map(m => (
                  <MilestoneRow key={m.id} m={m} checked={!!checked[m.id]}
                    onToggle={() => onMilestoneToggle(m.id)} onWorkflow={onWorkflow} />
                ))}
              </ul>
            </div>
          )}

          {phase.kpis.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
                {t("kpiTargets")}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
                {phase.kpis.map(k => (
                  <KpiCard key={k.id} kpi={k}
                    actual={kpiActuals[k.id] || ''}
                    onActualChange={(val) => onKpiActualChange(k.id, val)} />
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <BtnComplete active={phaseComplete} onClick={onPhaseComplete}>
              {phaseComplete ? t("markedComplete") : t("markComplete")}
            </BtnComplete>
            <BtnAivory onClick={() => openAivoryAssistant(
              `Help me work on "${phase.name}" of my AI Roadmap.\nMilestones:\n${phase.milestones.map(m => `- ${m.title}`).join('\n')}`,
              {
                roadmapTitle: phase.name,
                currentPhase: phase.name,
                milestones: phase.milestones.map(m => m.title),
              }
            )}>{t("askAivoryHelp")}</BtnAivory>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Button primitives ────────────────────────────────────────
function BtnGhost({ onClick, disabled, title, children }: {
  onClick?: () => void; disabled?: boolean; title?: string; children: React.ReactNode;
}) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        fontSize: 12, fontWeight: 500, padding: '7px 14px', borderRadius: 8,
        border: `1px solid ${h && !disabled ? T.borderGreen : T.border}`,
        background: 'transparent', color: h && !disabled ? T.green : T.textSub,
        cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
        transition: 'all 0.15s', opacity: disabled ? 0.35 : 1, whiteSpace: 'nowrap',
      }}>{children}</button>
  );
}

function BtnAivory({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        fontSize: 12, fontWeight: 500, padding: '7px 14px', borderRadius: 8,
        border: `1px solid ${h ? '#666864' : T.purpleBorder}`,
        background: h ? 'rgba(255,255,255,0.06)' : T.purpleDim,
        color: T.purple, cursor: 'pointer', fontFamily: 'inherit',
        transition: 'all 0.15s', whiteSpace: 'nowrap',
      }}>{children}</button>
  );
}

function BtnComplete({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        fontSize: 12, fontWeight: 500, padding: '7px 14px', borderRadius: 8,
        border: `1px solid ${active || h ? T.borderGreen : T.border}`,
        background: active ? T.greenDim : 'transparent',
        color: active || h ? T.green : T.textSub,
        cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
      }}>{children}</button>
  );
}

function BtnPrimary({ onClick, disabled, loading, children }: {
  onClick: () => void; disabled?: boolean; loading?: boolean; children: React.ReactNode;
}) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{
        background: h && !disabled ? '#555553' : T.green,
        color: '#000', border: 'none', borderRadius: 10,
        padding: '13px 32px', fontSize: '0.9375rem', fontWeight: 700,
        fontFamily: 'inherit', cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', gap: 10,
        transition: 'background 0.15s', opacity: disabled ? 0.6 : 1,
      }}>
      {loading && (
        <span style={{
          display: 'inline-block', width: 15, height: 15,
          border: '2px solid rgba(0,0,0,0.2)', borderTopColor: '#000',
          borderRadius: '50%', animation: 'rm-spin 0.7s linear infinite', flexShrink: 0,
        }} aria-hidden />
      )}
      {children}
    </button>
  );
}

// ─── Export PDF (Feature 6) ───────────────────────────────────
async function exportRoadmapPdf(
  roadmap: AiryRoadmap,
  allChecked: Record<string, Record<string, boolean>>,
  kpiActuals: Record<string, string>,
  phaseCompletes: Record<string, boolean>,
) {
  const { default: jsPDF } = await import('jspdf');
  const { applyPremiumCovers, loadManrope, pageBg, pageFooter, sectionLabel, renderNarrative, thinDiv } = await import('@/lib/pdfExport');

  const doc = new jsPDF('p', 'mm', 'a4');
  await loadManrope(doc);

  const ML = 18;
  const PAGE_W = 210;
  const PAGE_H = 297;

  // Overall stats
  const totalMilestones = roadmap.phases.reduce((s, p) => s + p.milestones.length, 0);
  const checkedMilestones = roadmap.phases.reduce((s, p) => {
    const pc = allChecked[p.id] || {};
    return s + Object.values(pc).filter(Boolean).length;
  }, 0);
  const overallPct = totalMilestones > 0 ? Math.round((checkedMilestones / totalMilestones) * 100) : 0;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  // Cover
  await applyPremiumCovers(doc, 'front', `AI Implementation
Roadmap`, {
    company: roadmap.title,
    date: dateStr,
    reportId: `RM-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-001`
  });

  // Progress summary on front cover (dark green area, below client info)
  doc.setGState(new (doc as any).GState({ opacity: 0.7 }));
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(`Overall Progress: ${overallPct}%  ·  ${checkedMilestones}/${totalMilestones} milestones`, ML, 125);
  doc.setFontSize(8);
  doc.text(`Exported: ${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })} · ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`, ML, 132);
  doc.setGState(new (doc as any).GState({ opacity: 1 }));

  // Cover page intro (first inner page)
  doc.addPage();
  pageBg(doc);
  pageFooter(doc);
  let y = ML;
  y = sectionLabel(doc, y, 'About This Roadmap');
  y = renderNarrative(doc, y, COVER_INTRO);
  y += 6;
  thinDiv(doc, y);

  // Inner pages
  const FB = () => 'Helvetica';

  const checkPage = (need: number) => {
    if (y + need > PAGE_H - 20) {
      doc.addPage();
      pageBg(doc);
      pageFooter(doc);
      y = ML;
    }
  };

  for (let i = 0; i < roadmap.phases.length; i++) {
    const phase = roadmap.phases[i];
    doc.addPage();
    pageBg(doc);
    pageFooter(doc);
    y = ML;

    // Phase header
    y = sectionLabel(doc, y, `Phase ${i + 1}: ${phase.name}`);
    doc.setFontSize(9);
    doc.setTextColor(136, 136, 136);
    doc.text(phase.timeframe, ML, y);
    y += 6;

    if (phaseCompletes[phase.id]) {
      doc.setFontSize(9);
      doc.setTextColor(76, 175, 80);
      doc.text('✓ PHASE COMPLETE', PAGE_W - ML - 40, ML + 5);
    }

    // Description
    const desc = PHASE_DESCRIPTIONS[i] || phase.description;
    if (desc) {
      y = renderNarrative(doc, y, desc);
      y += 4;
    }

    // Milestones
    checkPage(16);
    doc.setFontSize(8);
    doc.setFont(FB(), 'bold');
    doc.setTextColor(136, 136, 136);
    doc.text('MILESTONES', ML, y);
    y += 6;

    const phaseChecked = allChecked[phase.id] || {};
    for (const m of phase.milestones) {
      checkPage(8);
      const isChecked = !!phaseChecked[m.id];
      doc.setFontSize(9.5);
      doc.setFont(FB(), 'normal');
      doc.setTextColor(isChecked ? 136 : 30, isChecked ? 136 : 30, isChecked ? 136 : 30);
      doc.text(`>  ${m.title}`, ML + 2, y);
      y += 6;
    }
    y += 4;

    // KPIs
    if (phase.kpis.length > 0) {
      checkPage(16);
      doc.setFontSize(8);
      doc.setFont(FB(), 'bold');
      doc.setTextColor(136, 136, 136);
      doc.text('KPI TARGETS', ML, y);
      y += 6;

      for (const k of phase.kpis) {
        checkPage(12);
        const actual = kpiActuals[k.id] || '—';
        const status = getKpiStatus(k.target, kpiActuals[k.id]);
        const statusLabel = status === 'green' ? '● On Track' : status === 'yellow' ? '● Progressing' : status === 'red' ? '● Below Target' : '';

        doc.setFontSize(9);
        doc.setFont(FB(), 'bold');
        doc.setTextColor(30, 30, 30);
        doc.text(k.label, ML + 2, y);
        y += 5;

        doc.setFont(FB(), 'normal');
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        doc.text(`Target: ${k.target}  ·  Actual: ${actual}`, ML + 4, y);

        if (statusLabel) {
          const sColor = status === 'green' ? [76, 175, 80] : status === 'yellow' ? [251, 191, 36] : [248, 113, 113];
          doc.setTextColor(sColor[0], sColor[1], sColor[2]);
          doc.text(`  ${statusLabel}`, ML + 4 + doc.getTextWidth(`Target: ${k.target}  ·  Actual: ${actual}`), y);
        }
        y += 7;
      }
    }

    thinDiv(doc, y);
    y += 6;
  }

  // Back cover
  doc.addPage();
  await applyPremiumCovers(doc, 'back', '', {});

  doc.save(`AI_Roadmap_${now.toISOString().slice(0, 10)}.pdf`);
}

// ─── Empty state ──────────────────────────────────────────────
function EmptyState({ generating, error, onGenerate, router }: {
  generating: boolean; error: string | null;
  onGenerate: () => void; router: ReturnType<typeof useRouter>;
}) {
  const t = useTranslations("roadmap");
  return (
    <div style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 20,
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      padding: '64px 40px', display: 'flex', flexDirection: 'column',
      alignItems: 'center', textAlign: 'center', gap: 20,
      boxShadow: '0 4px 32px rgba(0,0,0,0.4)',
    }}>
      {/* illustration */}
      <svg width="220" height="72" viewBox="0 0 220 72" fill="none" aria-hidden style={{ opacity: 0.7 }}>
        <line x1="20" y1="36" x2="200" y2="36" stroke="#2a2a28" strokeWidth="2" strokeDasharray="6 4"/>
        {([20, 110, 200] as const).map((cx, i) => (
          <g key={cx}>
            <circle cx={cx} cy="36" r="14" fill="#161614" stroke={i === 0 ? T.green : '#2e2e2c'} strokeWidth="1.5"/>
            <text x={cx} y="41" textAnchor="middle" fontSize="11" fontWeight="700"
              fill={i === 0 ? T.green : '#444'} fontFamily="var(--font-manrope), Manrope, sans-serif">{i + 1}</text>
            <text x={cx} y="60" textAnchor="middle" fontSize="9" fill="#444" fontFamily="var(--font-manrope), Manrope, sans-serif">
              {['Build','Scale','Optimize'][i]}
            </text>
          </g>
        ))}
      </svg>

      <h2 style={{ fontSize: '1.375rem', fontWeight: 300, color: T.text, margin: 0, letterSpacing: '-0.2px', lineHeight: 1.3 }}>
        {t("noRoadmap")}
      </h2>
      <p style={{ fontSize: '0.9375rem', color: T.textSub, lineHeight: 1.7, maxWidth: 480, margin: 0 }}>
        {t("noRoadmapDesc")}
      </p>

      {error && (
        <p role="alert" style={{
          fontSize: '0.875rem', color: T.red, padding: '10px 14px',
          background: T.redDim, border: '1px solid rgba(248,113,113,0.18)',
          borderRadius: 8, margin: 0,
        }}>{error}</p>
      )}

      <BtnPrimary onClick={onGenerate} disabled={generating} loading={generating}>
        {generating ? t("generatingRoadmap") : t("generateRoadmap")}
      </BtnPrimary>

      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        padding: '14px 18px', background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.04)', borderRadius: 10,
        maxWidth: 480, width: '100%',
      }}>
        <span style={{ fontSize: '0.8125rem', color: T.textMuted, lineHeight: 1.5 }}>
          {t("proTip")}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {[[t("startDiagnostic"), '/diagnostics'], [t("viewBlueprints"), '/blueprint']].map(([label, path]) => (
            <button key={path} onClick={() => router.push(path)}
              style={{
                fontSize: 12, fontWeight: 500, padding: '6px 14px', borderRadius: 7,
                border: `1px solid ${T.border}`, background: 'transparent', color: T.textSub,
                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.target as HTMLButtonElement).style.borderColor = T.borderGreen; (e.target as HTMLButtonElement).style.color = T.green; }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.borderColor = T.border; (e.target as HTMLButtonElement).style.color = T.textSub; }}
            >{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────
export default function RoadmapPage() {
  const router = useRouter();
  const t = useTranslations("roadmap");
  const [roadmap, setRoadmap] = useState<AiryRoadmap | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openPhases, setOpenPhases] = useState<Record<string, boolean>>({});
  const [activeIdx, setActiveIdx] = useState(0);
  const phaseRefs = useRef<Array<{ current: HTMLDivElement | null }>>([]);

  // Lifted state for cross-phase milestone tracking (Feature 1)
  const [allChecked, setAllChecked] = useState<Record<string, Record<string, boolean>>>({});
  // KPI actuals state (Feature 2)
  const [kpiActuals, setKpiActuals] = useState<Record<string, string>>({});
  // Phase complete state
  const [phaseCompletes, setPhaseCompletes] = useState<Record<string, boolean>>({});

  const { pendingContext, clearPendingContext } = useRouterContext()
  const [routingNotice, setRoutingNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!pendingContext) return
    if (Date.now() - pendingContext.timestamp > 300000) { clearPendingContext(); return }
    if (pendingContext.targetRoute !== 'roadmap') return
    setRoutingNotice(pendingContext.aiReplySummary || pendingContext.triggerMessage)
    clearPendingContext()
  }, [pendingContext, clearPendingContext])

  // Hydrate all persisted state from localStorage
  useEffect(() => {
    // KPI actuals
    try {
      const stored = localStorage.getItem(LS_KPI_ACTUALS);
      if (stored) setKpiActuals(JSON.parse(stored));
    } catch { /* ignore */ }
    // Phase completes
    try {
      const stored = localStorage.getItem(LS_PHASE_COMPLETE);
      if (stored) setPhaseCompletes(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    // Load roadmap: try Supabase first, fall back to localStorage (Req 5.4–5.6)
    const loadRoadmapData = async () => {
      let rm: AiryRoadmap | null = null;
      try {
        const { loadRoadmapFromSupabase } = await import('@/lib/supabaseStorage')
        const result = await loadRoadmapFromSupabase('demo_org')
        rm = result || loadRoadmap();
      } catch {
        rm = loadRoadmap();
      }

      setRoadmap(rm);
      if (rm) {
        setOpenPhases({ [rm.phases[0]?.id ?? '']: true });
        phaseRefs.current = rm.phases.map(() => ({ current: null }));
        // Hydrate milestone checked state for all phases
        const checkedState: Record<string, Record<string, boolean>> = {};
        for (const phase of rm.phases) {
          try {
            const stored = localStorage.getItem(LS_CHECKED_PREFIX + phase.id);
            if (stored) checkedState[phase.id] = JSON.parse(stored);
            else checkedState[phase.id] = {};
          } catch { checkedState[phase.id] = {}; }
        }
        setAllChecked(checkedState);
      }
      setLoading(false);
    };
    loadRoadmapData();
  }, []);

  const handleMilestoneToggle = useCallback((phaseId: string, milestoneId: string) => {
    setAllChecked(prev => {
      const phaseChecked = { ...(prev[phaseId] || {}), [milestoneId]: !prev[phaseId]?.[milestoneId] };
      localStorage.setItem(LS_CHECKED_PREFIX + phaseId, JSON.stringify(phaseChecked));
      return { ...prev, [phaseId]: phaseChecked };
    });
  }, []);

  const handleKpiActualChange = useCallback((kpiId: string, val: string) => {
    setKpiActuals(prev => {
      const next = { ...prev, [kpiId]: val };
      localStorage.setItem(LS_KPI_ACTUALS, JSON.stringify(next));
      return next;
    });
  }, []);

  const handlePhaseComplete = useCallback((phaseId: string) => {
    setPhaseCompletes(prev => {
      const next = { ...prev, [phaseId]: !prev[phaseId] };
      localStorage.setItem(LS_PHASE_COMPLETE, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleGenerate = async () => {
    setGenerating(true); setError(null);
    try {
      const diagCtx = (() => { try { return JSON.parse(localStorage.getItem('aivory_deep_result') || '{}'); } catch { return {}; } })();
      const bpCtx   = (() => { try { return JSON.parse(localStorage.getItem('aivory_blueprint') || '{}'); } catch { return {}; } })();
      const res = await fetch('/api/roadmap/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'direct', diagnosticContext: diagCtx, blueprintContext: bpCtx }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Generation failed');
      saveRoadmap(data.roadmap);
      setRoadmap(data.roadmap);
      setOpenPhases({ [data.roadmap.phases[0]?.id ?? '']: true });
      phaseRefs.current = data.roadmap.phases.map(() => ({ current: null }));
      setActiveIdx(0);
      // Init checked state for new roadmap
      const newChecked: Record<string, Record<string, boolean>> = {};
      for (const phase of data.roadmap.phases) { newChecked[phase.id] = {}; }
      setAllChecked(newChecked);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to generate roadmap');
    } finally { setGenerating(false); }
  };

  const handleNodeClick = useCallback((idx: number) => {
    setActiveIdx(idx);
    if (!roadmap) return;
    const phase = roadmap.phases[idx];
    setOpenPhases(prev => ({ ...prev, [phase.id]: true }));
    setTimeout(() => {
      phaseRefs.current[idx]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }, [roadmap]);

  const togglePhase = (id: string) => setOpenPhases(prev => ({ ...prev, [id]: !prev[id] }));

  const handleExportPdf = useCallback(() => {
    if (!roadmap) return;
    exportRoadmapPdf(roadmap, allChecked, kpiActuals, phaseCompletes);
  }, [roadmap, allChecked, kpiActuals, phaseCompletes]);

  const font = "var(--font-manrope), 'Manrope', system-ui, sans-serif";

  if (loading) return (
    <div className="font-manrope" style={{ height: '100%', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes rm-spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 36, height: 36, border: '2.5px solid rgba(255,255,255,0.06)', borderTopColor: T.green, borderRadius: '50%', animation: 'rm-spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div className="font-manrope" style={{ height: '100%', overflowY: 'auto', background: T.bg, color: T.text, fontFamily: font }}>
      {routingNotice !== null && (
        <ContinuedFromConsole summary={routingNotice} onDismiss={() => setRoutingNotice(null)} />
      )}
      <style>{`@keyframes rm-spin{to{transform:rotate(360deg)}}`}</style>

      {/* Feature 1: Overall progress sticky bar */}
      {roadmap && (
        <OverallProgressBar
          phases={roadmap.phases}
          allChecked={allChecked}
          activeIdx={activeIdx}
          onNodeClick={handleNodeClick}
        />
      )}

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px 100px', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* header */}
        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', paddingBottom: 24, borderBottom: `1px solid ${T.border}` }}>
          <div>
            <h1 style={{ fontSize: '1.625rem', fontWeight: 300, color: T.text, margin: '0 0 5px', letterSpacing: '-0.3px', lineHeight: 1.3 }}>
              {t("pageTitle")}
            </h1>
            <p style={{ fontSize: '0.9rem', color: T.textSub, margin: 0 }}>
              {t("subtitle")}
            </p>
          </div>
          {roadmap && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                  background: T.greenDim, color: T.green, border: `1px solid ${T.borderGreen}`,
                  letterSpacing: '0.6px', textTransform: 'uppercase',
                }}>{t("oneTimeService")}</span>
                <span style={{ fontSize: 12, color: T.textMuted }}>
                  {t("updated", { date: new Date(roadmap.createdAt).toLocaleDateString() })}
                </span>
              </div>
              <BtnGhost onClick={handleGenerate} disabled={generating}>
                {generating ? t("regenerating") : t("regenerateRoadmap")}
              </BtnGhost>
            </div>
          )}
        </header>

        {roadmap ? (
          <>
            <div style={{ fontSize: '1.05rem', fontWeight: 500, color: T.textSub }}>{roadmap.title}</div>

            {/* CSS timeline */}
            <RoadmapTimeline phases={roadmap.phases} activeIdx={activeIdx} onNodeClick={handleNodeClick} />

            {/* Phase sections */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {roadmap.phases.map((phase, idx) => {
                if (!phaseRefs.current[idx]) phaseRefs.current[idx] = { current: null };
                return (
                  <PhaseSection
                    key={phase.id}
                    phase={phase}
                    index={idx}
                    open={!!openPhases[phase.id]}
                    phaseRef={phaseRefs.current[idx]}
                    onToggle={() => togglePhase(phase.id)}
                    onWorkflow={id => router.push(`/workflows?selected=${encodeURIComponent(id)}`)}
                    checked={allChecked[phase.id] || {}}
                    onMilestoneToggle={(mId) => handleMilestoneToggle(phase.id, mId)}
                    kpiActuals={kpiActuals}
                    onKpiActualChange={handleKpiActualChange}
                    phaseComplete={!!phaseCompletes[phase.id]}
                    onPhaseComplete={() => handlePhaseComplete(phase.id)}
                  />
                );
              })}
            </div>

            {error && (
              <p role="alert" style={{ fontSize: '0.875rem', color: T.red, padding: '10px 14px', background: T.redDim, border: '1px solid rgba(248,113,113,0.18)', borderRadius: 8, margin: 0 }}>
                {error}
              </p>
            )}

            {/* bottom action row */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 16, flexWrap: 'wrap', padding: '18px 20px',
              background: T.card, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
              border: `1px solid ${T.border}`, borderRadius: 12,
              boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
            }}>
              <span style={{ fontSize: 13, color: T.textMuted, flex: 1, minWidth: 180 }}>
                {t("bottomHint")}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <BtnGhost onClick={handleGenerate} disabled={generating}>
                  {generating ? t("regenerating") : t("regenerate")}
                </BtnGhost>
                {/* Feature 6: Export PDF now functional */}
                <BtnGhost onClick={handleExportPdf}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <IconDownload />
                    {t("exportPdf")}
                  </span>
                </BtnGhost>
                <BtnAivory onClick={() => openAivoryAssistant(
                  `Review and refine my AI Roadmap based on these phases and KPIs.\n${roadmap.phases.map((p, i) => `Phase ${i + 1}: ${p.name} (${p.timeframe})`).join('\n')}`,
                  {
                    roadmapTitle: roadmap.title ?? 'AI Roadmap',
                    currentPhase: roadmap.phases[activeIdx]?.name ?? '',
                    milestones: roadmap.phases.flatMap(p => p.milestones.map(m => m.title)),
                  }
                )}>{t("askAivoryRefine")}</BtnAivory>
              </div>
            </div>
          </>
        ) : (
          <EmptyState generating={generating} error={error} onGenerate={handleGenerate} router={router} />
        )}
      </div>
    </div>
  );
}
