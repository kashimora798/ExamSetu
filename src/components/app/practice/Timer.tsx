import { useState, useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';

interface TimerProps {
  initialSeconds: number;
  onTimeUp: () => void;
}

export function Timer({ initialSeconds, onTimeUp }: TimerProps) {
  const [timeLeft, setTimeLeft] = useState(initialSeconds);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    // Start interval
    timerRef.current = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          onTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [onTimeUp]);

  const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const secs = (timeLeft % 60).toString().padStart(2, '0');
  
  const isDanger = timeLeft < 60; // less than 1 min red

  return (
    <div className={`flex items-center gap-2 font-mono text-lg font-bold px-3 py-1.5 rounded-lg border ${isDanger ? 'bg-red-50 text-red-600 border-red-200 animate-pulse' : 'bg-white text-gray-700 border-gray-200 shadow-sm'}`}>
      <Clock size={18} className={isDanger ? 'text-red-600' : 'text-gray-400'} />
      {mins}:{secs}
    </div>
  );
}
