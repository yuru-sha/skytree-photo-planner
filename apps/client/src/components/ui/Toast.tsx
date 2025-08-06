import React, { useEffect } from 'react';
import { Icon } from '@skytree-photo-planner/ui';
import { ToastMessage } from '../../hooks/useToast';

interface ToastProps {
  toast: ToastMessage;
  onRemove: (id: string) => void;
}

const TOAST_ICONS = {
  success: 'check-circle',
  error: 'x-circle',
  warning: 'exclamation-triangle',
  info: 'info-circle',
} as const;

const TOAST_COLORS = {
  success: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: 'text-green-400',
    title: 'text-green-800',
    message: 'text-green-700',
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'text-red-400',
    title: 'text-red-800',
    message: 'text-red-700',
  },
  warning: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    icon: 'text-yellow-400',
    title: 'text-yellow-800',
    message: 'text-yellow-700',
  },
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: 'text-blue-400',
    title: 'text-blue-800',
    message: 'text-blue-700',
  },
} as const;

export const Toast: React.FC<ToastProps> = ({ toast, onRemove }) => {
  const colors = TOAST_COLORS[toast.type];
  const iconName = TOAST_ICONS[toast.type];

  useEffect(() => {
    if (toast.duration > 0) {
      const timer = setTimeout(() => {
        onRemove(toast.id);
      }, toast.duration);

      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, onRemove]);

  return (
    <div
      className={`
        ${colors.bg} ${colors.border}
        max-w-sm w-full shadow-lg rounded-lg pointer-events-auto
        ring-1 ring-black ring-opacity-5 overflow-hidden
        transform transition-all duration-300 ease-in-out
        animate-slide-in-right
      `}
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    >
      <div className="p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <Icon 
              name={iconName} 
              size={20} 
              className={colors.icon}
              aria-hidden="true"
            />
          </div>
          <div className="ml-3 w-0 flex-1">
            <p className={`text-sm font-medium ${colors.title}`}>
              {toast.title}
            </p>
            {toast.message && (
              <p className={`mt-1 text-sm ${colors.message}`}>
                {toast.message}
              </p>
            )}
          </div>
          <div className="ml-4 flex-shrink-0 flex">
            <button
              className={`
                ${colors.bg} rounded-md inline-flex ${colors.title}
                hover:${colors.message} focus:outline-none focus:ring-2
                focus:ring-offset-2 focus:ring-indigo-500
              `}
              onClick={() => onRemove(toast.id)}
              aria-label="通知を閉じる"
            >
              <span className="sr-only">閉じる</span>
              <Icon name="x" size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
      
      {/* プログレスバー（時間表示） */}
      {toast.duration > 0 && (
        <div className="h-1 bg-gray-200">
          <div 
            className="h-full bg-current opacity-30 progress-bar"
            style={{
              animation: `progress ${toast.duration}ms linear forwards`
            }}
          />
        </div>
      )}
    </div>
  );
};

interface ToastContainerProps {
  toasts: ToastMessage[];
  onRemove: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onRemove }) => {
  // 位置別にトーストをグループ化
  const toastsByPosition = toasts.reduce((acc, toast) => {
    if (!acc[toast.position]) {
      acc[toast.position] = [];
    }
    acc[toast.position].push(toast);
    return acc;
  }, {} as Record<ToastMessage['position'], ToastMessage[]>);

  const getPositionClasses = (position: ToastMessage['position']) => {
    switch (position) {
      case 'top-right':
        return 'top-0 right-0';
      case 'top-left':
        return 'top-0 left-0';
      case 'bottom-right':
        return 'bottom-0 right-0';
      case 'bottom-left':
        return 'bottom-0 left-0';
      case 'top-center':
        return 'top-0 left-1/2 transform -translate-x-1/2';
      case 'bottom-center':
        return 'bottom-0 left-1/2 transform -translate-x-1/2';
      default:
        return 'bottom-0 right-0';
    }
  };

  return (
    <>
      {Object.entries(toastsByPosition).map(([position, positionToasts]) => (
        <div
          key={position}
          className={`
            fixed z-50 p-6 space-y-4 pointer-events-none
            ${getPositionClasses(position as ToastMessage['position'])}
          `}
          aria-live="polite"
          aria-label="通知"
        >
          {positionToasts.map(toast => (
            <Toast
              key={toast.id}
              toast={toast}
              onRemove={onRemove}
            />
          ))}
        </div>
      ))}
    </>
  );
};

