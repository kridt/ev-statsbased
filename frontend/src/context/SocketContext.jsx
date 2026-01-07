import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useNotification } from './NotificationContext';

const SocketContext = createContext(null);

// Derive socket URL from API URL (remove /api suffix)
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const SOCKET_URL = API_URL.replace(/\/api$/, '');

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [liveFixtures, setLiveFixtures] = useState([]);
  const [oddsUpdates, setOddsUpdates] = useState({}); // { betId: { odds, previousOdds, timestamp, direction } }
  const [valueBetsUpdates, setValueBetsUpdates] = useState(null); // Latest value bets data
  const { addNotification } = useNotification();

  // Use ref to avoid socket reconnection when addNotification changes
  const addNotificationRef = useRef(addNotification);
  useEffect(() => {
    addNotificationRef.current = addNotification;
  }, [addNotification]);

  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    newSocket.on('connect', () => {
      console.log('[Socket] Connected');
      setIsConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('[Socket] Disconnected');
      setIsConnected(false);
    });

    newSocket.on('live:fixtures', (fixtures) => {
      setLiveFixtures(fixtures);
    });

    // Real-time odds updates
    newSocket.on('odds:update', (update) => {
      console.log('[Socket] Odds update:', update);
      setOddsUpdates((prev) => ({
        ...prev,
        [update.betId]: {
          odds: update.odds,
          previousOdds: update.previousOdds,
          timestamp: Date.now(),
          direction: update.odds > update.previousOdds ? 'up' : 'down',
        },
      }));

      // Clear the update after animation duration (3 seconds)
      setTimeout(() => {
        setOddsUpdates((prev) => {
          const { [update.betId]: _, ...rest } = prev;
          return rest;
        });
      }, 3000);
    });

    // Value bets batch update
    newSocket.on('valueBets:update', (data) => {
      console.log('[Socket] Value bets update:', data);
      setValueBetsUpdates(data);
    });

    newSocket.on('notification', (notification) => {
      // Show browser notification
      if (Notification.permission === 'granted') {
        new Notification('SoccerStats', {
          body: notification.message,
          icon: '/soccer-ball.svg',
          tag: notification.type,
        });
      }

      // Show in-app notification - use ref to get latest callback without causing reconnection
      addNotificationRef.current({
        type: notification.type,
        message: notification.message,
        fixture: notification.fixture,
      });
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []); // Empty dependency array - socket connects once on mount

  const subscribeLive = useCallback(() => {
    if (socket) {
      socket.emit('subscribe:live');
    }
  }, [socket]);

  const unsubscribeLive = useCallback(() => {
    if (socket) {
      socket.emit('unsubscribe:live');
    }
  }, [socket]);

  const subscribeMatch = useCallback((matchId) => {
    if (socket) {
      socket.emit('subscribe:match', matchId);
    }
  }, [socket]);

  const unsubscribeMatch = useCallback((matchId) => {
    if (socket) {
      socket.emit('unsubscribe:match', matchId);
    }
  }, [socket]);

  // Subscribe to odds updates for value bets
  const subscribeOdds = useCallback(() => {
    if (socket) {
      socket.emit('subscribe:odds');
      console.log('[Socket] Subscribed to odds updates');
    }
  }, [socket]);

  const unsubscribeOdds = useCallback(() => {
    if (socket) {
      socket.emit('unsubscribe:odds');
      console.log('[Socket] Unsubscribed from odds updates');
    }
  }, [socket]);

  // Get odds update for a specific bet (for flash animation)
  const getOddsUpdate = useCallback((betId) => {
    return oddsUpdates[betId] || null;
  }, [oddsUpdates]);

  const value = {
    socket,
    isConnected,
    liveFixtures,
    oddsUpdates,
    valueBetsUpdates,
    subscribeLive,
    unsubscribeLive,
    subscribeMatch,
    unsubscribeMatch,
    subscribeOdds,
    unsubscribeOdds,
    getOddsUpdate,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}

export default SocketContext;
