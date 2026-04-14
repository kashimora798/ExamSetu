import type { CSSProperties } from 'react';

type BrandTone = 'light' | 'dark';
type BrandSize = 'sm' | 'md' | 'lg';

interface BrandLogoProps {
  tone?: BrandTone;
  size?: BrandSize;
  showSubtitle?: boolean;
  subtitle?: string;
  className?: string;
}

const GOLD = '#B88718';

const SIZE_MAP: Record<BrandSize, {
  markW: number;
  markH: number;
  mainSize: number;
  examSpacing: string;
  setuSpacing: string;
  subtitleSize: number;
}> = {
  sm: { markW: 20, markH: 28, mainSize: 16, examSpacing: '0.2em', setuSpacing: '0.08em', subtitleSize: 10 },
  md: { markW: 24, markH: 33, mainSize: 19, examSpacing: '0.22em', setuSpacing: '0.08em', subtitleSize: 11 },
  lg: { markW: 28, markH: 38, mainSize: 22, examSpacing: '0.24em', setuSpacing: '0.09em', subtitleSize: 12 },
};

export function BrandMark({ width, height }: { width: number; height: number }) {
  return (
    <svg width={width} height={height} viewBox="0 10 38 42" aria-hidden="true" focusable="false" style={{ display: 'block' }}>
      <path
        d="M 4 49 L 4 17 A 15 15 0 0 0 34 17 L 34 49"
        stroke={GOLD}
        strokeWidth="4.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function BrandLogo({
  tone = 'light',
  size = 'md',
  showSubtitle = false,
  subtitle = 'Your bridge to teaching',
  className,
}: BrandLogoProps) {
  const cfg = SIZE_MAP[size];
  const wordColor = tone === 'dark' ? '#F4EFE4' : '#0B1826';
  const subtitleColor = tone === 'dark' ? '#7A8A99' : '#7A6A58';

  const rootStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '10px',
    lineHeight: 1,
    textDecoration: 'none',
  };

  const wordStyle: CSSProperties = {
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: `${cfg.mainSize}px`,
    color: wordColor,
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: '3px',
    whiteSpace: 'nowrap',
  };

  return (
    <div className={className} style={rootStyle} aria-label="ExamSetu">
      <BrandMark width={cfg.markW} height={cfg.markH} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: showSubtitle ? '3px' : 0 }}>
        <div style={wordStyle}>
          <span style={{ fontWeight: 300, letterSpacing: cfg.examSpacing }}>EXAM</span>
          <span style={{ fontWeight: 700, letterSpacing: cfg.setuSpacing }}>SETU</span>
        </div>
        {showSubtitle && (
          <span style={{ fontSize: `${cfg.subtitleSize}px`, color: subtitleColor, fontWeight: 500, letterSpacing: '0.04em' }}>
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
