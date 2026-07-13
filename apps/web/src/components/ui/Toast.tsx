import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '../../lib/cn.js';

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const ToastCtx = createContext<{
  push: (kind: ToastKind, message: string) => void;
}>({ push: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

const icons = {
  success: <CheckCircle2 size={16} className="text-green" />,
  error: <AlertCircle size={16} className="text-red" />,
  info: <Info size={16} className="text-accent" />,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(
      () => setToasts((t) => t.filter((x) => x.id !== id)),
      kind === 'error' ? 6000 : 3500,
    );
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[380px] max-w-[90vw]"
        role="status"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              'flex items-start gap-2.5 rounded-lg border bg-panel-2 px-3.5 py-2.5 shadow-xl',
              'animate-[slidein_.15s_ease]',
              t.kind === 'error' ? 'border-red/40' : 'border-border',
            )}
          >
            <span className="mt-0.5 shrink-0">{icons[t.kind]}</span>
            <span className="text-[13px] leading-snug break-words flex-1">
              {t.message}
            </span>
            <button
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              className="text-muted hover:text-text shrink-0"
              aria-label="Fermer la notification"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
