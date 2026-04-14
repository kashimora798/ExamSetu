import type { ShareCardKind } from '../../lib/shareMessages';

import achievementMainSvg from '../../assets/icons8/achievement_main.svg?raw';
import fireMainSvg from '../../assets/icons8/icons8-fire.svg?raw';
import rankMainSvg from '../../assets/icons8/rank_main.svg?raw';
import scoreMainSvg from '../../assets/icons8/score_main.svg?raw';
import subjectMainSvg from '../../assets/icons8/subject_main.svg?raw';
import statAccuracySvg from '../../assets/icons8/stat_accuracy.svg?raw';
import statProgressSvg from '../../assets/icons8/stat_progress.svg?raw';
import statTimeSvg from '../../assets/icons8/stat_time.svg?raw';
import fallbackSvg from '../../assets/icons8/fallback_generic.svg?raw';
import { BrandMark } from './BrandLogo';

const TYPE = {
  streak: { bg: '#2A1A0E', accent: '#D85A30', light: '#F0997B', mainSvg: fireMainSvg },
  achievement: { bg: '#0A1628', accent: '#185FA5', light: '#85B7EB', mainSvg: achievementMainSvg },
  rank: { bg: '#140A2E', accent: '#534AB7', light: '#AFA9EC', mainSvg: rankMainSvg },
  score: { bg: '#0A1628', accent: '#185FA5', light: '#85B7EB', mainSvg: scoreMainSvg },
  subject: { bg: '#0A1628', accent: '#185FA5', light: '#85B7EB', mainSvg: subjectMainSvg },
} as const;

export interface ShareCardTemplateProps {
  kind: ShareCardKind;
  title: string;
  subtitle?: string;
  primaryValue: string | number;
  primaryLabel: string;
  accentColor?: string;
  brand?: string;
  footer?: string;
  detailRows?: Array<{ label: string; value: string }>;
}

function getKindStyle(kind: ShareCardKind, accentColor?: string) {
  const base = TYPE[kind] || TYPE.score;
  return {
    ...base,
    accent: accentColor || base.accent,
  };
}

function getDetailIconSvg(label: string) {
  const key = label.toLowerCase();
  if (key.includes('accuracy') || key.includes('score')) return statAccuracySvg;
  if (key.includes('session') || key.includes('day') || key.includes('today')) return statTimeSvg;
  return statProgressSvg;
}

function InlineSvg({ svg, size }: { svg: string; size: number }) {
  return (
    <div
      style={{ width: `${size}px`, height: `${size}px`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export default function ShareCardTemplate({
  kind,
  title,
  subtitle,
  primaryValue,
  primaryLabel,
  accentColor,
  brand = 'ExamSetu',
  footer,
  detailRows = [],
}: ShareCardTemplateProps) {
  const style = getKindStyle(kind, accentColor);
  const valueText = String(primaryValue);
  const statItems = (detailRows.length ? detailRows : [
    { label: 'accuracy', value: '--' },
    { label: 'sessions', value: '--' },
    { label: 'progress', value: '--' },
  ]).slice(0, 3);

  return (
    <div
      style={{
        width: 'fit-content',
        height: 'auto',
        padding: '28px',
        background: style.bg,
        borderRadius: '34px',
        boxSizing: 'border-box',
        fontFamily: "'DM Sans', system-ui, sans-serif",
        color: '#FFFFFF',
        border: '1px solid rgba(255,255,255,0.10)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '40px', height: '52px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <BrandMark width={28} height={38} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '3px' }}>
            <div style={{ fontSize: '16px', lineHeight: 1, color: '#F4EFE4', textTransform: 'uppercase', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'baseline', gap: '3px' }}>
              <span style={{ fontWeight: 300, letterSpacing: '0.2em' }}>EXAM</span>
              <span style={{ fontWeight: 700, letterSpacing: '0.08em' }}>SETU</span>
            </div>
            <div style={{ fontSize: '10px', lineHeight: 1.15, fontWeight: 500, color: 'rgba(255,255,255,0.58)' }}>Your bridge to teaching</div>
          </div>
        </div>
        <div style={{ padding: '8px 14px', borderRadius: '999px', border: `1px solid ${style.accent}`, color: style.light, fontSize: '13px', fontWeight: 700 }}>
          {kind.toUpperCase()}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '20px', padding: '18px', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', gap: '20px' }}>
          <div style={{ flex: '0 1 68%', maxWidth: '68%', minWidth: '420px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
            <div style={{ fontSize: '10px', lineHeight: 1, fontWeight: 700, letterSpacing: '0.1em', color: style.accent, textTransform: 'uppercase', marginBottom: '8px' }}>
              {title}
            </div>
            <div style={{ fontSize: '44px', lineHeight: 1.02, fontWeight: 800, color: '#FFFFFF', overflowWrap: 'anywhere', marginBottom: '4px' }}>
              {valueText}
            </div>
            <div style={{ fontSize: '13px', lineHeight: 1.25, fontWeight: 600, color: style.light, marginBottom: '8px' }}>
              {primaryLabel}
            </div>
            {subtitle && (
              <div style={{ fontSize: '11px', lineHeight: 1.45, fontWeight: 400, color: 'rgba(255,255,255,0.55)', maxWidth: '420px', paddingRight: '6px' }}>
                {subtitle}
              </div>
            )}
          </div>

          <div style={{ flex: '0 0 84px', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '4px' }}>
            <div style={{ width: '62px', height: '62px', borderRadius: '50%', background: style.accent, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${style.light}` }}>
              <InlineSvg svg={style.mainSvg || fallbackSvg} size={26} />
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '14px', padding: '8px' }}>
          {statItems.map((row) => (
            <div key={row.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '8px 10px', minHeight: '56px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '4px', marginBottom: '5px', paddingLeft: '1px' }}>
                <div style={{ fontSize: '8px', lineHeight: 1, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.45)' }}>
                  {row.label}
                </div>
                <InlineSvg svg={getDetailIconSvg(row.label)} size={10} />
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(255,255,255,0.95)', lineHeight: 1.1, paddingLeft: '1px' }}>
                {row.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', paddingTop: '1px' }}>
        <div style={{ fontSize: '10px', fontWeight: 400, color: 'rgba(255,255,255,0.55)' }}>
          {footer || 'Stay consistent. Track progress. Share milestones with ExamSetu.'}
        </div>
        <div style={{ padding: '8px 12px', borderRadius: '999px', background: style.accent, color: '#FFFFFF', fontSize: '11px', fontWeight: 700 }}>
          {brand}
        </div>
      </div>
    </div>
  );
}
