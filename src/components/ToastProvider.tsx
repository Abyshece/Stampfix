import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Check, AlertCircle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastAPI {
  show: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastAPI | null>(null);

/**
 * Wraps the app. Renders a fixed top-right stack of toasts.
 *
 * Usage:
 *   const toast = useToast();
 *   await save();
 *   toast.success('Changes saved');
 *
 * Toasts auto-dismiss after 3s, are dismissable by click, and stack
 * vertically when multiple fire in quick succession.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, kind, message }]);
    // Auto-dismiss after 3 seconds.
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const api: ToastAPI = {
    show,
    success: (m) => show(m, 'success'),
    error: (m) => show(m, 'error'),
    info: (m) => show(m, 'info'),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  // Slide-in animation: render with translateX(20px) → animate to 0
  const [visible, setVisible] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  const styles: Record<ToastKind, { bg: string; icon: React.ReactNode }> = {
    success: { bg: 'bg-blue-600 text-white',  icon: <Check className="w-4 h-4" strokeWidth={3} /> },
    error:   { bg: 'bg-red-600 text-white',   icon: <AlertCircle className="w-4 h-4" /> },
    info:    { bg: 'bg-gray-800 text-white',  icon: <Info className="w-4 h-4" /> },
  };
  const s = styles[toast.kind];

  return (
    <div
      onClick={onDismiss}
      className={`pointer-events-auto cursor-pointer ${s.bg} px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[240px] max-w-sm transition-all duration-200 ${
        visible ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
      }`}
    >
      <div className="flex-shrink-0">{s.icon}</div>
      <div className="flex-1 text-sm font-medium">{toast.message}</div>
      <X className="w-3.5 h-3.5 opacity-60 flex-shrink-0" />
    </div>
  );
}

export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fail gracefully if used outside provider — log to console rather than crash.
    // Helps during incremental rollout.
    return {
      show: (m) => console.warn('[toast]', m),
      success: (m) => console.warn('[toast]', m),
      error: (m) => console.warn('[toast]', m),
      info: (m) => console.warn('[toast]', m),
    };
  }
  return ctx;
}
