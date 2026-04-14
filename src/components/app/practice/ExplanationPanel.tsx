import { CheckCircle2, AlertTriangle } from 'lucide-react';

interface ExplanationPanelProps {
  explanationHi?: string | null;
  explanationEn?: string | null;
  correctOption: string;
  isPro?: boolean;
}

export function ExplanationPanel({ explanationHi, explanationEn, correctOption, isPro = true }: ExplanationPanelProps) {
  const text = explanationHi || explanationEn;

  if (!text && !isPro) {
    return (
      <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-center gap-2 text-amber-700 font-bold mb-2">
          <AlertTriangle size={18} />
          <span>Explanation</span>
        </div>
        <div className="blur-sm text-sm text-gray-500 select-none mb-3 pointer-events-none">
          मूर्त संक्रियात्मक अवस्था (7-11 वर्ष) में बच्चे वस्तुओं की संरक्षण अवधारणा को समझने लगते हैं। इस अवस्था में...
        </div>
        <a href="/pricing" className="block w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-center text-sm transition-colors">
          💡 Pro में Upgrade करें — Explanations देखें
        </a>
      </div>
    );
  }

  if (!text) return null;

  return (
    <div className="mt-6 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-purple-50 p-5 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="flex items-center gap-2 text-indigo-700 font-bold mb-3">
        <CheckCircle2 size={18} />
        <span>Explanation</span>
        <span className="ml-auto text-xs text-indigo-400 bg-indigo-100 px-2 py-0.5 rounded-full font-medium">
          सही: {correctOption}
        </span>
      </div>
      <p className="text-gray-800 leading-relaxed text-sm" lang="hi">
        {text}
      </p>
    </div>
  );
}
