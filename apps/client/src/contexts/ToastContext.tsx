import React, { createContext, useContext, ReactNode } from 'react';
import { useToast, ToastOptions } from '../hooks/useToast';
import { ToastContainer } from '../components/ui/Toast';

interface ToastContextType {
  success: (title: string, options?: ToastOptions) => string;
  error: (title: string, options?: ToastOptions) => string;
  warning: (title: string, options?: ToastOptions) => string;
  info: (title: string, options?: ToastOptions) => string;
  remove: (id: string) => void;
  clear: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

interface ToastProviderProps {
  children: ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const { toasts, success, error, warning, info, remove, clear } = useToast();

  return (
    <ToastContext.Provider value={{ success, error, warning, info, remove, clear }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={remove} />
    </ToastContext.Provider>
  );
};

export const useToastContext = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToastContext must be used within a ToastProvider');
  }
  return context;
};