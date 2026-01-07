import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [notificationPermission, setNotificationPermission] = useState('default');
  // Track timeout IDs to clear them on unmount - fixes memory leak
  const timeoutIdsRef = useRef(new Map());

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  // Cleanup all timeouts on unmount
  useEffect(() => {
    const timeoutIds = timeoutIdsRef.current;
    return () => {
      timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
      timeoutIds.clear();
    };
  }, []);

  const requestPermission = useCallback(async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      return permission;
    }
    return 'denied';
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    // Clean up the timeout reference
    if (timeoutIdsRef.current.has(id)) {
      clearTimeout(timeoutIdsRef.current.get(id));
      timeoutIdsRef.current.delete(id);
    }
  }, []);

  const addNotification = useCallback((notification) => {
    const id = Date.now() + Math.random();
    const newNotification = {
      id,
      ...notification,
      timestamp: new Date(),
    };

    setNotifications((prev) => [newNotification, ...prev].slice(0, 50));

    // Auto-remove after 5 seconds - store timeout ID for cleanup
    const timeoutId = setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      timeoutIdsRef.current.delete(id);
    }, 5000);

    timeoutIdsRef.current.set(id, timeoutId);

    return id;
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const value = {
    notifications,
    notificationPermission,
    requestPermission,
    addNotification,
    removeNotification,
    clearNotifications,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}

export default NotificationContext;
