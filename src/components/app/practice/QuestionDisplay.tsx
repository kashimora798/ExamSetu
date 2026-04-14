import { useState } from 'react';
import type { Question } from '../../../lib/types';

interface QuestionDisplayProps {
  question: Question;
  questionNumber: number;
}

export function QuestionDisplay({ question, questionNumber }: QuestionDisplayProps) {
  const hasHindi = !!question.question_hi;
  const hasEnglish = !!question.question_en;
  const [lang, setLang] = useState<'hi' | 'en'>(hasHindi ? 'hi' : 'en');

  const text = lang === 'hi' ? question.question_hi : question.question_en;

  return (
    <div className="mb-6">
      {/* Question number + meta + lang toggle */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest font-mono">
            Q {questionNumber}
          </span>
          {question.source_year && (
            <span className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full font-medium">
              {question.source_year}
            </span>
          )}
          {question.difficulty && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border
              ${question.difficulty === 'hard' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                question.difficulty === 'medium' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                'bg-emerald-50 text-emerald-600 border-emerald-100'}
            `}>
              {question.difficulty}
            </span>
          )}
        </div>
        {/* Language toggle */}
        {hasHindi && hasEnglish && (
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button 
              onClick={() => setLang('hi')}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${lang === 'hi' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
            >
              हि
            </button>
            <button 
              onClick={() => setLang('en')}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${lang === 'en' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
            >
              EN
            </button>
          </div>
        )}
      </div>

      {/* Question text */}
      <p 
        lang={lang === 'hi' ? 'hi' : 'en'} 
        className="text-xl sm:text-2xl font-bold text-gray-900 leading-snug"
        style={{ fontFamily: lang === 'hi' ? "'Noto Serif', serif" : 'inherit' }}
      >
        {text}
      </p>
    </div>
  );
}
