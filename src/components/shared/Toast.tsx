import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import './Toast.css';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  duration?: number; // ms, 0 = no auto-dismiss
}

interface ToastProps extends ToastMessage {
  onDismiss: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({
  id,
  type,
  title,
  message,
  duration = 4000,
  onDismiss,
}) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => onDismiss(id), duration);
      return () => clearTimeout(timer);
    }
  }, [id, duration, onDismiss]);

  const typeConfig = {
    success: {
      bgColor: '#f0fdf4',
      borderColor: '#86efac',
      textColor: '#166534',
      icon: '✓',
    },
    error: {
      bgColor: '#fef2f2',
      borderColor: '#fca5a5',
      textColor: '#b91c1c',
      icon: '✕',
    },
    info: {
      bgColor: '#f0f9ff',
      borderColor: '#93c5fd',
      textColor: '#1e40af',
      icon: 'ⓘ',
    },
    warning: {
      bgColor: '#fffbeb',
      borderColor: '#fcd34d',
      textColor: '#b45309',
      icon: '⚠',
    },
  };

  const config = typeConfig[type];

  return (
    <div
      className={`toast toast--${type}`}
      style={{
        backgroundColor: config.bgColor,
        borderLeft: `4px solid ${config.borderColor}`,
      }}
      role="alert"
    >
      <div className="toast__icon" style={{ color: config.textColor }}>
        {config.icon}
      </div>
      <div className="toast__content">
        <h3 className="toast__title" style={{ color: config.textColor }}>
          {title}
        </h3>
        <p className="toast__message" style={{ color: config.textColor }}>
          {message}
        </p>
      </div>
      <button
        className="toast__close"
        onClick={() => onDismiss(id)}
        aria-label="Close notification"
        style={{ color: config.textColor }}
      >
        <X size={18} />
      </button>
    </div>
  );
};

export default Toast;
