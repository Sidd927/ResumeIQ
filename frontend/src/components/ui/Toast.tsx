import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { AlertIcon, CheckCircleIcon, InfoIcon, XIcon } from './icons';
import { registerGlobalToast, ToastContext, type ToastApi, type ToastType } from './toastContext';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

const AUTO_DISMISS_MS = 5000;

const styles: Record<ToastType, { icon: typeof InfoIcon; iconClass: string; accent: string }> = {
  success: { icon: CheckCircleIcon, iconClass: 'text-green-600', accent: 'before:bg-green-600' },
  error: { icon: AlertIcon, iconClass: 'text-red-600', accent: 'before:bg-red-600' },
  info: { icon: InfoIcon, iconClass: 'text-blue-600', accent: 'before:bg-blue-600' },
};

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const { icon: Icon, iconClass, accent } = styles[toast.type];

  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-xl border border-gray-200',
        'bg-white py-3 pl-4 pr-3 shadow-lg shadow-gray-900/5 animate-toast-in',
        'before:absolute before:inset-y-0 before:left-0 before:w-1',
        accent,
      )}
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', iconClass)} />
      <p className="flex-1 text-sm font-medium text-gray-900">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="rounded-md p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Global toast queue. Toasts slide in top-right and auto-dismiss after 5s. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const api = useMemo<ToastApi>(() => {
    const show = (message: string, type: ToastType = 'info') => {
      const id = nextId.current++;
      // Parallel requests failing together shouldn't stack identical toasts.
      setToasts((current) =>
        current.some((t) => t.message === message && t.type === type)
          ? current
          : [...current.slice(-2), { id, message, type }],
      );
    };
    return {
      show,
      success: (m) => show(m, 'success'),
      error: (m) => show(m, 'error'),
      info: (m) => show(m, 'info'),
    };
  }, []);

  useEffect(() => {
    registerGlobalToast(api);
    return () => registerGlobalToast(null);
  }, [api]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 top-4 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:top-20 sm:w-96"
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
