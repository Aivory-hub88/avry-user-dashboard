'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
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
  green:        '#00e59e',
  greenDim:     '#282827',
  greenGlow:    'rgba(255,255,255,0.08)',
  purple:       '#00e59e',
  purpleDim:    '#282827',
  purpleBorder: '#666864',
  text:         '#f0ede9',
  textSub:      '#dddac5',
  textMuted:    '#dddac5',
  red:          '#f87171',
  redDim:       'rgba(248,113,113,0.08)',
};

// ─── AIRA trigger ─────────────────────────────────────────────
// Context (page/mode/roadmap) is driven by the current route in AiraFloatingAssistant,
// NOT by the prefill text. The pageContext here is supplementary metadata only.
const openAira = (msg: string, pageContext?: Record<string, unknown>) =>
  window.dispatchEvent(new CustomEvent('aira:open', {
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
const PHASE_ICONS = [<IconGear key="g"/>, <IconArrows key="a"/>, <IconChart key="c"/>];

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

// ─── Milestone item ───────────────────────────────────────────
function MilestoneRow({ m, checked, onToggle, onWorkflow }: {
  m: AiryRoadmapMilestone; checked: boolean;
  onToggle: () => void; onWorkflow: (id: string) => void;
}) {
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{
          fontSize: '0.875rem', color: checked ? T.textMuted : T.text,
          textDecoration: checked ? 'line-through' : 'none', lineHeight: 1.45, transition: 'color 0.15s',
        }}>{m.title}</span>
        {m.description && <span style={{ fontSize: '0.78rem', color: T.textMuted, lineHeight: 1.5 }}>{m.description}</span>}
        {m.linkedWorkflowIds?.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 3 }}>
            {m.linkedWorkflowIds.map(id => (
              <button key={id} onClick={() => onWorkflow(id)} style={{
                fontSize: 11, padding: '2px 9px', borderRadius: 20,
                background: '#282827', color: '#dddac5',
                border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', fontFamily: 'inherit',
              }}>{id}</button>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

// ─── KPI card ─────────────────────────────────────────────────
function KpiCard({ kpi }: { kpi: AiryRoadmapKpi }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.06)`,
      borderRadius: 10, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <span style={{ fontSize: '0.68rem', color: T.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
        {kpi.label}
      </span>
      <span style={{ fontSize: '1.25rem', fontWeight: 700, color: T.green, letterSpacing: '-0.3px' }}>
        {kpi.target}
      </span>
    </div>
  );
}

// ─── Phase section ────────────────────────────────────────────
function PhaseSection({ phase, index, open, phaseRef, onToggle, onWorkflow }: {
  phase: AiryRoadmapPhase; index: number; open: boolean;
  phaseRef: { current: HTMLDivElement | null };
  onToggle: () => void; onWorkflow: (id: string) => void;
}) {
  const t = useTranslations("roadmap");
  const storageKey = `aivory_roadmap_checked_${phase.id}`;
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // Hydrate from localStorage after mount (localStorage is not available during SSR)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) setChecked(JSON.parse(stored));
    } catch { /* localStorage unavailable */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const [complete, setComplete] = useState(false);
  const [hov, setHov] = useState(false);

  const toggle = (id: string) => setChecked(prev => {
    const next = { ...prev, [id]: !prev[id] };
    localStorage.setItem(storageKey, JSON.stringify(next));
    return next;
  });

  const checkedN = Object.values(checked).filter(Boolean).length;
  const total = phase.milestones.length;
  const pct = complete ? 100 : total > 0 ? Math.round((checkedN / total) * 100) : 0;
  const icon = PHASE_ICONS[index % 3];

  return (
    <div ref={phaseRef} style={{
      background: T.card, border: `1px solid ${complete ? T.borderGreen : T.border}`,
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
            background: complete ? '#282827' : T.greenDim,
            border: `1px solid ${complete ? '#666864' : T.borderGreen}`,
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
          {complete && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
              background: T.greenDim, color: T.green, border: `1px solid ${T.borderGreen}`,
              textTransform: 'uppercase', letterSpacing: '0.3px',
            }}>{t("complete")}</span>
          )}
          {!complete && total > 0 && (
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
          {phase.description && (
            <p style={{ fontSize: '0.9rem', color: T.textSub, lineHeight: 1.65, margin: '14px 0 0' }}>
              {phase.description}
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
                    onToggle={() => toggle(m.id)} onWorkflow={onWorkflow} />
                ))}
              </ul>
            </div>
          )}

          {phase.kpis.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 10 }}>
                {t("kpiTargets")}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                {phase.kpis.map(k => <KpiCard key={k.id} kpi={k} />)}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingTop: 4, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <BtnComplete active={complete} onClick={() => setComplete(v => !v)}>
              {complete ? t("markedComplete") : t("markComplete")}
            </BtnComplete>
            <BtnAira onClick={() => openAira(
              `Help me work on "${phase.name}" of my AI Roadmap.\nMilestones:\n${phase.milestones.map(m => `- ${m.title}`).join('\n')}`,
              {
                roadmapTitle: phase.name,
                currentPhase: phase.name,
                milestones: phase.milestones.map(m => m.title),
              }
            )}>{t("askAiraHelp")}</BtnAira>
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

function BtnAira({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
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
              fill={i === 0 ? T.green : '#444'} fontFamily="Inter Tight, sans-serif">{i + 1}</text>
            <text x={cx} y="60" textAnchor="middle" fontSize="9" fill="#444" fontFamily="Inter Tight, sans-serif">
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

  const { pendingContext, clearPendingContext } = useRouterContext()
  const [routingNotice, setRoutingNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!pendingContext) return
    if (Date.now() - pendingContext.timestamp > 300000) { clearPendingContext(); return }
    if (pendingContext.targetRoute !== 'roadmap') return
    setRoutingNotice(pendingContext.aiReplySummary || pendingContext.triggerMessage)
    clearPendingContext()
  }, [pendingContext, clearPendingContext])

  useEffect(() => {
    // Load roadmap: try Supabase first, fall back to localStorage (Req 5.4–5.6)
    const loadRoadmapData = async () => {
      try {
        const { loadRoadmapFromSupabase } = await import('@/lib/supabaseStorage')
        const result = await loadRoadmapFromSupabase('demo_org')
        if (result) {
          setRoadmap(result)
          setOpenPhases({ [result.phases[0]?.id ?? '']: true })
          phaseRefs.current = result.phases.map(() => ({ current: null }))
        } else {
          // Supabase returned nothing — fall back to localStorage
          const rm = loadRoadmap()
          setRoadmap(rm)
          if (rm) {
            setOpenPhases({ [rm.phases[0]?.id ?? '']: true })
            phaseRefs.current = rm.phases.map(() => ({ current: null }))
          }
        }
      } catch {
        // Supabase unavailable — fall back to localStorage
        const rm = loadRoadmap()
        setRoadmap(rm)
        if (rm) {
          setOpenPhases({ [rm.phases[0]?.id ?? '']: true })
          phaseRefs.current = rm.phases.map(() => ({ current: null }))
        }
      }
      setLoading(false)
    }
    loadRoadmapData()
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

  const font = "'Inter Tight','Inter',system-ui,sans-serif";

  if (loading) return (
    <div style={{ height: '100%', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{`@keyframes rm-spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 36, height: 36, border: '2.5px solid rgba(255,255,255,0.06)', borderTopColor: T.green, borderRadius: '50%', animation: 'rm-spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: T.bg, color: T.text, fontFamily: font }}>
      {routingNotice !== null && (
        <ContinuedFromConsole summary={routingNotice} onDismiss={() => setRoutingNotice(null)} />
      )}
      <style>{`@keyframes rm-spin{to{transform:rotate(360deg)}}`}</style>
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
                <BtnGhost disabled title={t("comingSoon")}>{t("exportPdf")}</BtnGhost>
                <BtnAira onClick={() => openAira(
                  `Review and refine my AI Roadmap based on these phases and KPIs.\n${roadmap.phases.map((p, i) => `Phase ${i + 1}: ${p.name} (${p.timeframe})`).join('\n')}`,
                  {
                    roadmapTitle: roadmap.title ?? 'AI Roadmap',
                    currentPhase: roadmap.phases[activeIdx]?.name ?? '',
                    milestones: roadmap.phases.flatMap(p => p.milestones.map(m => m.title)),
                  }
                )}>{t("askAiraRefine")}</BtnAira>
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
