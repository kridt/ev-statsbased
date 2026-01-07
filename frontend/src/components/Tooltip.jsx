import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info } from 'lucide-react';

const Tooltip = ({
  children,
  content,
  title,
  position = 'top',
  showIcon = false,
  className = ''
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [actualPosition, setActualPosition] = useState(position);
  const tooltipRef = useRef(null);
  const triggerRef = useRef(null);

  // Adjust position if tooltip would go off-screen
  useEffect(() => {
    if (isVisible && tooltipRef.current && triggerRef.current) {
      const tooltip = tooltipRef.current.getBoundingClientRect();
      const trigger = triggerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let newPosition = position;

      // Check if tooltip goes off-screen and adjust
      if (position === 'top' && tooltip.top < 10) {
        newPosition = 'bottom';
      } else if (position === 'bottom' && tooltip.bottom > viewportHeight - 10) {
        newPosition = 'top';
      } else if (position === 'left' && tooltip.left < 10) {
        newPosition = 'right';
      } else if (position === 'right' && tooltip.right > viewportWidth - 10) {
        newPosition = 'left';
      }

      if (newPosition !== actualPosition) {
        setActualPosition(newPosition);
      }
    }
  }, [isVisible, position, actualPosition]);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-dark-700 border-l-transparent border-r-transparent border-b-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-dark-700 border-l-transparent border-r-transparent border-t-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-dark-700 border-t-transparent border-b-transparent border-r-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-dark-700 border-t-transparent border-b-transparent border-l-transparent',
  };

  return (
    <span
      className={`relative inline-flex items-center gap-1 cursor-help ${className}`}
      ref={triggerRef}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}
      {showIcon && (
        <Info className="w-3 h-3 text-dark-400 hover:text-dark-300 transition-colors" />
      )}

      <AnimatePresence>
        {isVisible && (
          <motion.div
            ref={tooltipRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className={`absolute ${positionClasses[actualPosition]}`}
            style={{ zIndex: 9999 }}
          >
            <div className="bg-dark-700 border border-dark-600 rounded-lg shadow-2xl px-3 py-2 min-w-[200px] max-w-[280px] backdrop-blur-sm">
              {title && (
                <div className="text-xs font-semibold text-primary-400 mb-1 border-b border-dark-600 pb-1">
                  {title}
                </div>
              )}
              <div className="text-xs text-dark-200 leading-relaxed">
                {content}
              </div>
            </div>
            {/* Arrow */}
            <div
              className={`absolute w-0 h-0 border-4 ${arrowClasses[actualPosition]}`}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
};

// Pre-defined tooltips for common betting terms
export const BETTING_TERM_TOOLTIPS = {
  probability: {
    title: 'Probability',
    content: 'The calculated likelihood of this outcome happening, based on team statistics and historical data. Higher probability = more likely to occur.'
  },
  fairOdds: {
    title: 'Fair Odds',
    content: 'The odds this bet should be priced at based on our probability calculation. If bookmaker odds are higher than fair odds, the bet has positive expected value.'
  },
  ev: {
    title: 'Expected Value (EV)',
    content: 'The average profit/loss you can expect per bet over time. Positive EV (+) means the bet is mathematically profitable long-term. Example: +€0.50/€10 means €0.50 profit expected per €10 wagered.'
  },
  edge: {
    title: 'Edge %',
    content: 'Your advantage over the bookmaker expressed as a percentage. A 5% edge means you expect to profit €5 for every €100 wagered on average. Higher edge = better value.'
  },
  grade: {
    title: 'Confidence Grade',
    content: 'A = High confidence (realistic edge, good probability, playable bookmaker)\nB = Good value (reasonable factors)\nC = Moderate (unusual edge or benchmark only)\nD = Low confidence (extreme edge, likely stale odds)'
  },
  poisson: {
    title: 'Poisson Distribution',
    content: 'A statistical model that predicts the probability of events (like goals) occurring, based on the average rate they happen. Widely used in sports analytics.'
  }
};

export default Tooltip;
