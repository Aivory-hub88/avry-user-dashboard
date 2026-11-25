'use client';

/**
 * Frosted-glass toggle: a recessed dark track, a mint-to-blue light that fills
 * in behind a glass thumb when on. Colours are fixed here (not the sage
 * `accent` token) so the control reads the same wherever it is placed.
 */
type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  title?: string;
  'aria-label'?: string;
};

const MINT = '#2dd4bf';
const SKY = '#38bdf8';

export default function GlassSwitch({ checked, onChange, disabled, title, ...rest }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={rest['aria-label']}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
      className="relative h-[28px] w-[54px] shrink-0 overflow-hidden rounded-full border outline-none transition-[box-shadow,border-color] duration-300 focus-visible:ring-2 focus-visible:ring-[#38bdf8]/60 disabled:opacity-30 motion-reduce:transition-none"
      style={{
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
        className="absolute left-[3px] top-[3px] flex h-[20px] w-[28px] items-center justify-center rounded-full transition-transform duration-[320ms] motion-reduce:transition-none"
        style={{
          transform: checked ? 'translateX(20px)' : 'translateX(0)',
          transitionTimingFunction: 'cubic-bezier(0.34, 1.4, 0.64, 1)',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.50) 0%, rgba(255,255,255,0.18) 100%)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          boxShadow: '0 2px 6px rgba(0,0,0,0.4), inset 0 0.5px 0 rgba(255,255,255,0.35)',
        }}
      >
        <span
          className="h-[10px] w-[10px] rounded-full"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.75), rgba(255,255,255,0.25))',
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.7)',
            opacity: checked ? 1 : 0.55,
          }}
        />
      </span>
    </button>
  );
}
