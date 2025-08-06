import { useState, useCallback } from 'react';
import { uiLogger } from '../utils/logger';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration: number;
  position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';
}

export interface ToastOptions {
  message?: string;
  duration?: number;
  position?: ToastMessage['position'];
}

const DEFAULT_DURATION = 5000;
const DEFAULT_POSITION: ToastMessage['position'] = 'bottom-right';

let toastId = 0;

export const useToast = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const addToast = useCallback((
    type: ToastMessage['type'],
    title: string,
    options: ToastOptions = {}
  ) => {
    const id = `toast-${++toastId}`;
    const duration = options.duration ?? DEFAULT_DURATION;
    const position = options.position ?? DEFAULT_POSITION;
    
    const toast: ToastMessage = {
      id,
      type,
      title,
      message: options.message,
      duration,
      position,
    };

    setToasts(prev => [...prev, toast]);

    uiLogger.debug('Toast notification created', {
      id,
      type,
      title,
      duration,
      position
    });

    // 自動削除
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }

    return id;
  }, [removeToast]);

  const success = useCallback((title: string, options?: ToastOptions) => {
    return addToast('success', title, options);
  }, [addToast]);

  const error = useCallback((title: string, options?: ToastOptions) => {
    return addToast('error', title, options);
  }, [addToast]);

  const warning = useCallback((title: string, options?: ToastOptions) => {
    return addToast('warning', title, options);
  }, [addToast]);

  const info = useCallback((title: string, options?: ToastOptions) => {
    return addToast('info', title, options);
  }, [addToast]);

  const clear = useCallback(() => {
    setToasts([]);
  }, []);

  return {
    toasts,
    success,
    error,
    warning,
    info,
    remove: removeToast,
    clear,
  };
};