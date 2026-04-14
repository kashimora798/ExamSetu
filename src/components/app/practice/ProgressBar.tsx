interface ProgressBarProps {
  current: number;
  total: number;
  answers: ('unanswered' | 'correct' | 'wrong' | 'marked')[];
}

export function ProgressBar({ current, total, answers }: ProgressBarProps) {
  const pct = Math.round(((current) / total) * 100);

  return (
    <div className="w-full">
      {/* Colored segment bar */}
      <div className="flex gap-0.5 h-1.5 w-full rounded-full overflow-hidden bg-gray-100">
        {answers.map((state, i) => {
          let color = 'bg-gray-200';
          if (state === 'correct') color = 'bg-emerald-500';
          else if (state === 'wrong') color = 'bg-rose-400';
          else if (state === 'marked') color = 'bg-amber-400';
          else if (i < current) color = 'bg-indigo-400';
          const isActive = i === current;
          return (
            <div 
              key={i} 
              className={`flex-1 transition-colors duration-300 ${color} ${isActive ? 'ring-1 ring-indigo-600 ring-offset-1' : ''}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-1.5 text-xs text-gray-400 font-medium">
        <span>प्रश्न {current + 1}</span>
        <span>{pct}% हो गया</span>
        <span>{total} कुल</span>
      </div>
    </div>
  );
}
