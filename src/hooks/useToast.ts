import React, { createContext, useContext, useReducer, useCallback } from 'react';
import Toast from '../components/shared/Toast';
import type { ToastMessage } from '../components/shared/Toast';

interface ToastContextType {
  showToast: (config: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;
  clearAll: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

interface ToastState {
  toasts: ToastMessage[];
}

type ToastAction =
  | { type: 'ADD'; payload: ToastMessage }
  | { type: 'REMOVE'; payload: string }
  | { type: 'CLEAR' };

const toastReducer = (_state: ToastState, action: ToastAction): ToastState => {
  switch (action.type) {
    case 'ADD':
      return {
        toasts: [action.payload, ..._state.toasts].slice(0, 3), // Max 3 toasts
      };
    case 'REMOVE':
      return {
        toasts: _state.toasts.filter((t) => t.id !== action.payload),
      };
    case 'CLEAR':
      return { toasts: [] };
    default:
      return _state;
  }
};

interface ToastProviderProps {
  children: React.ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(toastReducer, { toasts: [] });

  const showToast = useCallback((config: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    dispatch({
      type: 'ADD',
      payload: {
        id,
        type: config.type,
        title: config.title,
        message: config.message,
        duration: config.duration ?? 4000,
      },
    });
  }, []);

  const dismissToast = useCallback((id: string) => {
    dispatch({ type: 'REMOVE', payload: id });
  }, []);

  const clearAll = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  return React.createElement(
    ToastContext.Provider,
    { value: { showToast, dismissToast, clearAll } },
    children,
    React.createElement(
      'div',
      { className: 'toast-container' },
      state.toasts.map((toast) =>
        React.createElement(Toast, {
          key: toast.id,
          ...toast,
          onDismiss: dismissToast,
        })
      )
    )
  );
};

export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};
