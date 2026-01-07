import { useEffect, useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { useSocket } from '../context/SocketContext';

/**
 * OddsFlash - Wrapper component that shows a flash animation when odds change
 *
 * Usage:
 * <OddsFlash betId="unique-bet-id" odds={1.85}>
 *   <span>@1.85</span>
 * </OddsFlash>
 */
export const OddsFlash = memo(function OddsFlash({ betId, odds, children, className = '' }) {
  const { getOddsUpdate } = useSocket();
  const [flashState, setFlashState] = useState(null); // 'up' | 'down' | null
  const [previousOdds, setPreviousOdds] = useState(null);

  // Check for real-time updates from WebSocket
  const update = getOddsUpdate(betId);

  useEffect(() => {
    if (update) {
      setFlashState(update.direction);
      setPreviousOdds(update.previousOdds);

      // Clear flash state after animation
      const timer = setTimeout(() => {
        setFlashState(null);
        setPreviousOdds(null);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [update]);

  const flashClass = flashState === 'up'
    ? 'odds-flash-up'
    : flashState === 'down'
    ? 'odds-flash-down'
    : '';

  return (
    <div className={`relative inline-flex items-center gap-1 ${flashClass} ${className}`}>
      {/* Direction arrow */}
      <AnimatePresence>
        {flashState && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            className="odds-arrow"
          >
            {flashState === 'up' ? (
              <ArrowUp className="w-4 h-4 odds-arrow-up" />
            ) : (
              <ArrowDown className="w-4 h-4 odds-arrow-down" />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Odds value */}
      <span className={`odds-value ${flashState ? `changing-${flashState}` : ''}`}>
        {children}
      </span>

      {/* Previous odds tooltip */}
      <AnimatePresence>
        {previousOdds && flashState && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs bg-dark-800 px-2 py-0.5 rounded whitespace-nowrap"
          >
            was @{previousOdds.toFixed(2)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * OddsChangeIndicator - Shows a small badge indicating recent odds movement
 */
export const OddsChangeIndicator = memo(function OddsChangeIndicator({ betId }) {
  const { getOddsUpdate } = useSocket();
  const update = getOddsUpdate(betId);

  if (!update) return null;

  const { direction, odds, previousOdds } = update;
  const change = ((odds - previousOdds) / previousOdds * 100).toFixed(1);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
        direction === 'up'
          ? 'bg-green-500/20 text-green-400'
          : 'bg-red-500/20 text-red-400'
      }`}
    >
      {direction === 'up' ? (
        <ArrowUp className="w-3 h-3" />
      ) : (
        <ArrowDown className="w-3 h-3" />
      )}
      <span>{direction === 'up' ? '+' : ''}{change}%</span>
    </motion.div>
  );
});

/**
 * RealTimeIndicator - Shows that odds are being updated in real-time
 */
export function RealTimeIndicator({ className = '' }) {
  const { isConnected } = useSocket();

  if (!isConnected) return null;

  return (
    <div className={`flex items-center gap-2 text-xs text-green-400 ${className}`}>
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
      </span>
      <span className="realtime-indicator">Live Updates</span>
    </div>
  );
}

export default OddsFlash;
