import { useContext } from 'react';

import { ToastContext, type ToastApi } from '../components/ui/toastContext';

/** Access the global toast queue. Must be used under <ToastProvider>. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
