import { createContext } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastApi {
  show: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

// Bridge for NON-React code (the API client) — e.g. "Session expired" is
// detected deep inside a request, far from any component. <ToastProvider>
// registers its API here on mount; calls before that are silently dropped.
let registered: ToastApi | null = null;

export function registerGlobalToast(api: ToastApi | null): void {
  registered = api;
}

export const globalToast: ToastApi = {
  show: (m, t) => registered?.show(m, t),
  success: (m) => registered?.success(m),
  error: (m) => registered?.error(m),
  info: (m) => registered?.info(m),
};
