import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, XCircle, Star, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success', duration = 3000) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);

    // Auto-remove after duration
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, duration);

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const showFavoriteAdded = useCallback((itemName) => {
    addToast(`${itemName} added to favorites`, 'favorite-add');
  }, [addToast]);

  const showFavoriteRemoved = useCallback((itemName) => {
    addToast(`${itemName} removed from favorites`, 'favorite-remove');
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ addToast, removeToast, showFavoriteAdded, showFavoriteRemoved }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, onRemove }) {
  return (
    <div style={{ position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999 }} className="flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onRemove={() => onRemove(toast.id)} />
      ))}
    </div>
  );
}

function Toast({ toast, onRemove }) {
  const { message, type } = toast;

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'favorite-add':
        return <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />;
      case 'favorite-remove':
        return <Star className="w-5 h-5 text-dark-400" />;
      default:
        return <CheckCircle className="w-5 h-5 text-primary-400" />;
    }
  };

  const getBgColor = () => {
    switch (type) {
      case 'success':
        return 'bg-green-500/20 border-green-500/40';
      case 'error':
        return 'bg-red-500/20 border-red-500/40';
      case 'favorite-add':
        return 'bg-yellow-500/20 border-yellow-500/40';
      case 'favorite-remove':
        return 'bg-dark-600 border-dark-500';
      default:
        return 'bg-dark-600 border-dark-500';
    }
  };

  return (
    <div
      style={{
        opacity: 1,
        transform: 'translateY(0)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
      }}
      className={`
        flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-md
        min-w-[250px] max-w-[350px] pointer-events-auto
        ${getBgColor()}
      `}
    >
      {getIcon()}
      <span className="text-sm text-white flex-1">{message}</span>
      <button
        onClick={onRemove}
        className="p-1 rounded hover:bg-white/10 transition-colors"
      >
        <X className="w-4 h-4 text-dark-400 hover:text-white" />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
