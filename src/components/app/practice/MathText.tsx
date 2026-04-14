/**
 * MathText — Auto-detect and render LaTeX/Math in question text
 *
 * Supports:
 *   - Inline math:  $...$ or \(...\)
 *   - Display math: $$...$$ or \[...\]
 *   - Auto-detection of LaTeX commands (\frac, \sqrt, etc.)
 *   - Plain text fallback (no KaTeX needed for plain text)
 *
 * Install KaTeX first:
 *   npm install katex
 *   npm install --save-dev @types/katex
 *
 * Also add to index.html:
 *   <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
 */

import { useMemo } from 'react';

// Lazy-load KaTeX to avoid bundling it when not needed
let katex: any = null;
let katexLoaded = false;
let katexLoadPromise: Promise<void> | null = null;

function loadKatex(): Promise<void> {
  if (katexLoaded) return Promise.resolve();
  if (katexLoadPromise) return katexLoadPromise;
  katexLoadPromise = import('katex').then(mod => {
    katex = mod.default;
    katexLoaded = true;
  }).catch(() => {
    // KaTeX not installed — graceful degradation
    katexLoaded = true;
  });
  return katexLoadPromise;
}

// Pre-load KaTeX when module loads
loadKatex();

/** Regex patterns for math detection */
const LATEX_PATTERNS = [
  /\$\$.+?\$\$/s,           // $$...$$
  /\$.+?\$/,                // $...$
  /\\\(.+?\\\)/s,           // \(...\)
  /\\\[.+?\\\]/s,           // \[...\]
  /\\frac\s*{/,             // \frac{
  /\\sqrt\s*[{[]/,          // \sqrt{
  /\\times|\\div|\\pm/,     // common operators
  /\\alpha|\\beta|\\gamma|\\theta|\\pi|\\sigma|\\omega/,
  /\\sum|\\int|\\lim|\\infty/,
  /\\begin\s*{/,            // \begin{...}
  /\^{[^}]+}|_{[^}]+}/,    // superscript/subscript
];

/** Check if text contains LaTeX math */
export function hasMath(text: string): boolean {
  if (!text) return false;
  return LATEX_PATTERNS.some(p => p.test(text));
}

/** Split text into plain and math segments */
function splitMath(text: string): Array<{ type: 'text' | 'display' | 'inline'; content: string }> {
  const segments: Array<{ type: 'text' | 'display' | 'inline'; content: string }> = [];
  // Match $$...$$ (display), then $...$ (inline), then \[...\] (display), then \(...\) (inline)
  const pattern = /(\$\$.+?\$\$|\$.+?\$|\\\[.+?\\\]|\\\(.+?\\\))/gs;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
    }
    const raw = match[0];
    const isDisplay = raw.startsWith('$$') || raw.startsWith('\\[');
    const inner = raw
      .replace(/^\$\$|\$\$$/g, '')
      .replace(/^\$|\$$/g, '')
      .replace(/^\\\[|\\\]$/g, '')
      .replace(/^\\\(|\\\)$/g, '');
    segments.push({ type: isDisplay ? 'display' : 'inline', content: inner });
    lastIndex = match.index + raw.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) });
  }

  return segments.length ? segments : [{ type: 'text', content: text }];
}

/** Render a single LaTeX expression to HTML string */
function renderLatex(expr: string, displayMode: boolean): string {
  if (!katex) return expr;
  try {
    return katex.renderToString(expr, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
      output: 'html',
    });
  } catch {
    return expr;
  }
}

interface MathTextProps {
  text: string;
  lang?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Force LaTeX rendering even without auto-detected patterns */
  forceMath?: boolean;
}

/**
 * MathText — renders text with inline/display LaTeX math
 *
 * Auto-detects LaTeX if present; renders plain text otherwise (zero overhead).
 */
export function MathText({ text, lang, style, forceMath }: MathTextProps) {
  const rendered = useMemo(() => {
    if (!text) return [];
    if (!forceMath && !hasMath(text)) {
      return [{ type: 'text' as const, content: text }];
    }
    return splitMath(text);
  }, [text, forceMath]);

  if (!text) return null;

  // Pure text — no math — just return a span (fastest path)
  if (rendered.length === 1 && rendered[0].type === 'text') {
    return <span lang={lang} style={style}>{text}</span>;
  }

  return (
    <span lang={lang} style={{ ...style, lineHeight: 1.7 }}>
      {rendered.map((seg, i) => {
        if (seg.type === 'text') {
          return <span key={i}>{seg.content}</span>;
        }
        // KaTeX not loaded yet — show raw
        if (!katex) {
          return <code key={i} style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>{seg.content}</code>;
        }
        const html = renderLatex(seg.content, seg.type === 'display');
        return (
          <span
            key={i}
            dangerouslySetInnerHTML={{ __html: html }}
            style={seg.type === 'display' ? { display: 'block', textAlign: 'center', margin: '8px 0', overflowX: 'auto' } : {}}
          />
        );
      })}
    </span>
  );
}
