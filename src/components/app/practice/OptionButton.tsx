import { CheckCircle2, XCircle } from 'lucide-react';

interface OptionButtonProps {
  label: string; // e.g. 'A', 'B'
  text: string;  // The actual answer text
  state: 'idle' | 'selected' | 'correct' | 'wrong' | 'missed' | 'disabled';
  onClick: () => void;
  disabled?: boolean;
}

export function OptionButton({ label, text, state, onClick, disabled }: OptionButtonProps) {
  let bgClass = 'bg-white hover:bg-gray-50';
  let borderClass = 'border-gray-200';
  let textClass = 'text-gray-700';
  let labelBgClass = 'bg-gray-100 text-gray-500 group-hover:bg-indigo-50 group-hover:text-indigo-600';
  
  if (state === 'selected') {
    bgClass = 'bg-indigo-50';
    borderClass = 'border-indigo-500 ring-1 ring-indigo-500';
    textClass = 'text-indigo-900';
    labelBgClass = 'bg-indigo-600 text-white';
  } else if (state === 'correct') {
    bgClass = 'bg-emerald-50 z-10';
    borderClass = 'border-emerald-500 ring-2 ring-emerald-500';
    textClass = 'text-emerald-900';
    labelBgClass = 'bg-emerald-600 text-white';
  } else if (state === 'wrong') {
    bgClass = 'bg-red-50 z-10';
    borderClass = 'border-red-500 ring-2 ring-red-500';
    textClass = 'text-red-900';
    labelBgClass = 'bg-red-600 text-white';
  } else if (state === 'missed') {
    bgClass = 'bg-emerald-50/50';
    borderClass = 'border-emerald-300 border-dashed';
    textClass = 'text-emerald-700';
    labelBgClass = 'bg-emerald-100 text-emerald-600';
  }

  // Once an answer is finalized (correct/wrong/missed), we disable further clicks on this button
  const isFinalState = ['correct', 'wrong', 'missed'].includes(state);
  const isDisabled = disabled || isFinalState;

  return (
    <button
      onClick={isDisabled ? undefined : onClick}
      disabled={isDisabled}
      className={`relative w-full flex items-center p-4 min-h-[4rem] rounded-xl border-2 transition-all duration-300 text-left group
        ${bgClass} ${borderClass} 
        ${isDisabled && !isFinalState ? 'opacity-70 cursor-not-allowed bg-gray-50' : ''}
        ${!isDisabled ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-sm' : ''}
      `}
    >
      <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm transition-colors ${labelBgClass}`}>
        {label}
      </div>
      <div className={`ml-4 flex-grow font-medium leading-relaxed ${textClass}`}>
        <span dangerouslySetInnerHTML={{ __html: text }} />
      </div>
      
      {state === 'correct' && <CheckCircle2 className="text-emerald-500 ml-2 flex-shrink-0 animate-in zoom-in" size={24} />}
      {state === 'wrong' && <XCircle className="text-red-500 ml-2 flex-shrink-0 animate-in zoom-in" size={24} />}
      {state === 'missed' && <CheckCircle2 className="text-emerald-400 ml-2 flex-shrink-0 opacity-50" size={24} />}
    </button>
  );
}
