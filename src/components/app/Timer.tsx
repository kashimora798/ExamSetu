import { useState, useEffect, useRef } from 'react';

interface TimerProps {
  initialSeconds: number;
  onTimeUp: () => void;
  onTimeUpdate?: (secondsRemaining: number) => void;
}

export default function Timer({ initialSeconds, onTimeUp, onTimeUpdate }: TimerProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(initialSeconds);
  const timeUpRef = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!timeUpRef.current) {
            timeUpRef.current = true;
            onTimeUp();
          }
          return 0;
        }
        const newTime = prev - 1;
        if (onTimeUpdate) onTimeUpdate(newTime);
        return newTime;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [onTimeUp]);

  const formatTime = (totalSeconds: number) => {
    const min = Math.floor(totalSeconds / 60);
    const sec = totalSeconds % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const isWarning = secondsRemaining <= 300; // < 5 mins warning
  const isDanger = secondsRemaining <= 60; // < 1 min danger

  return (
    <div
      style={{
        padding: '8px 16px',
        borderRadius: '8px',
        background: isDanger ? 'var(--error)' : isWarning ? 'var(--gold)' : 'var(--ink2)',
        color: 'white',
        fontWeight: 600,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '1.2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background-color 0.3s ease',
      }}
    >
      {formatTime(secondsRemaining)}
    </div>
  );
}
