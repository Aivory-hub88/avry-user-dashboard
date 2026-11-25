'use client';

/**
 * Frosted-glass toggle: a recessed dark track, a mint-to-blue light that fills
 * in behind a glass thumb when on. Colours are fixed here (not the sage
 * `accent` token) so the control reads the same wherever it is placed.
 * The one switch for the whole dashboard; `sm` is for dense inspector rows.
 */
type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  title?: string;
  size?: 'md' | 'sm';
  className?: string;
  'aria-label'?: string;
};

const MINT = '#2dd4bf';
const SKY = '#38bdf8';

// Track outer size includes the 1px border; travel = inner width - 2*pad - thumb.
const SIZES = {
  md: { w: 54, h: 28, pad: 3, tw: 28, th: 20, dot: 10 },
  sm: { w: 40, h: 22, pad: 2, tw: 22, th: 16, dot: 8 },
} as const;

export default function GlassSwitch({ checked, onChange, disabled, title, size = 'md', className = '', ...rest }: Props) {
  const z = SIZES[size];
  const travel = z.w - 2 - 2 * z.pad - z.tw;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={rest['aria-label']}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 overflow-hidden rounded-full border outline-none transition-[box-shadow,border-color] duration-300 focus-visible:ring-2 focus-visible:ring-[#38bdf8]/60 disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none ${className}`}
      style={{
        width: z.w,
        height: z.h,
        borderColor: checked ? 'rgba(94,234,212,0.18)' : 'rgba(255,255,255,0.06)',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(255,255,255,0.05) 100%)',
        boxShadow: checked
          ? `inset 0 1px 3px rgba(0,0,0,0.6), 0 0 16px -2px ${MINT}66`
          : 'inset 0 1px 3px rgba(0,0,0,0.6)',
      }}
    >
      {/* Light behind the thumb: grows from the left edge to the thumb. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-full transition-[width,opacity] duration-300 ease-out motion-reduce:transition-none"
        style={{
          width: checked ? '100%' : '30%',
          opacity: checked ? 1 : 0,
          background: `linear-gradient(90deg, #5eead4 0%, ${MINT} 25%, ${SKY} 62%)`,
          filter: 'blur(5px)',
        }}
      />
      <span
        aria-hidden
        className="absolute flex items-center justify-center rounded-full transition-transform duration-[320ms] motion-reduce:transition-none"
        style={{
          left: z.pad,
          top: z.pad,
          width: z.tw,
          height: z.th,
          transform: checked ? `translateX(${travel}px)` : 'translateX(0)',
          transitionTimingFunction: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.50) 0%, rgba(255,255,255,0.18) 100%)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.4), inset 0 0.5px 0 rgba(255,255,255,0.35)',
        }}
      >
        <span
          className="rounded-full"
          style={{
            width: z.dot,
            height: z.dot,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.75), rgba(255,255,255,0.25))',
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.7)',
            opacity: checked ? 1 : 0.55,
          }}
        />
      </span>
    </button>
  );
}
