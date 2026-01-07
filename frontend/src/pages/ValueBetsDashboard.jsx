import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import { format, formatDistanceToNow } from 'date-fns';
import {
  TrendingUp,
  Filter,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
  Target,
  Percent,
  Calendar,
  Square,
  CornerDownRight,
  Circle,
  Users,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  Flame,
  CheckCircle,
  Info,
  Trophy,
  Zap,
  SortAsc,
  SortDesc,
  X,
  Sparkles,
  Star,
  Crosshair,
  User,
  ArrowRight,
} from 'lucide-react';
import { probabilityApi } from '../services/api';
import DatePicker from '../components/DatePicker';
import LoadingSpinner from '../components/LoadingSpinner';
import SuggestedBuilders from '../components/SuggestedBuilders';
import { deduplicateBets } from '../utils/betDeduplication';
import Tooltip, { BETTING_TERM_TOOLTIPS } from '../components/Tooltip';

// ============================================
// WOW EFFECT COMPONENTS
// ============================================

// Animated counter component
const AnimatedCounter = ({ value, suffix = '%', className = '' }) => {
  const [displayValue, setDisplayValue] = useState(0);
  const prevValue = useRef(0);

  useEffect(() => {
    const startValue = prevValue.current;
    const endValue = parseFloat(value) || 0;
    const duration = 800;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function for smooth animation
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (endValue - startValue) * easeOut;

      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        prevValue.current = endValue;
      }
    };

    requestAnimationFrame(animate);
  }, [value]);

  return (
    <span className={`tabular-nums ${className}`}>
      +{displayValue.toFixed(1)}{suffix}
    </span>
  );
};

// Floating particles background
const FloatingParticles = () => {
  const particles = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 4 + 2,
      delay: Math.random() * 5,
      duration: Math.random() * 10 + 10,
      color: ['#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b'][Math.floor(Math.random() * 4)],
    }));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full opacity-20"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: particle.size,
            height: particle.size,
            backgroundColor: particle.color,
          }}
          animate={{
            y: [0, -30, 0],
            x: [0, 15, -15, 0],
            opacity: [0.1, 0.3, 0.1],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
};

// ============================================
// BOOKMAKER CONFIGURATION
// ============================================

// All bookmakers from OpticOdds API with metadata
const ALL_BOOKMAKERS = [
  // Sharp books (used for calculating true probabilities)
  { id: 'opticodds_ai', name: 'OpticOdds AI', category: 'sharp', description: 'Synthetic sharp line for true probability', playable: false },

  // Independent bookmakers (unique odds)
  { id: 'betano', name: 'Betano', category: 'playable', description: 'Independent - unique odds', playable: true, network: 'Independent' },
  { id: 'bet365', name: 'Bet365', category: 'playable', description: 'Independent - unique odds', playable: true, network: 'Independent' },

  // Kambi Network (shared odds - pick your preferred)
  { id: 'unibet', name: 'Unibet', category: 'playable', description: 'Kambi network', playable: true, network: 'Kambi' },
  { id: 'unibet_(denmark)', name: 'Unibet DK', category: 'playable', description: 'Kambi network - DK', playable: true, network: 'Kambi' },
  { id: 'leovegas', name: 'LeoVegas', category: 'playable', description: 'Kambi network', playable: true, network: 'Kambi' },
  { id: 'betsson', name: 'Betsson', category: 'playable', description: 'Kambi network', playable: true, network: 'Kambi' },
  { id: 'betsafe', name: 'Betsafe', category: 'playable', description: 'Kambi network', playable: true, network: 'Kambi' },
  { id: 'nordicbet', name: 'Nordicbet', category: 'playable', description: 'Kambi network', playable: true, network: 'Kambi' },
  { id: 'expekt', name: 'Expekt', category: 'playable', description: 'Kambi network', playable: true, network: 'Kambi' },
  { id: 'rizk', name: 'Rizk', category: 'playable', description: 'Kambi network', playable: true, network: 'Kambi' },

  // Other playable bookmakers
  { id: 'campobet', name: 'Campobet', category: 'playable', description: 'Smaller bookmaker', playable: true, network: 'Other' },
  { id: 'betinia', name: 'Betinia', category: 'playable', description: 'Smaller bookmaker', playable: true, network: 'Other' },

  // Benchmark bookmakers (for price comparison only)
  { id: 'pinnacle', name: 'Pinnacle', category: 'benchmark', description: 'Sharp book reference', playable: false },
  { id: 'circa_sports', name: 'Circa Sports', category: 'benchmark', description: 'Las Vegas sharp book', playable: false },
  { id: 'bet99', name: 'Bet99', category: 'benchmark', description: 'Canadian sportsbook', playable: false },
  { id: 'elite_bet', name: 'Elite Bet', category: 'benchmark', description: 'Benchmark odds', playable: false },
];

// Get bookmakers by category
const SHARP_BOOKMAKERS = ALL_BOOKMAKERS.filter(b => b.category === 'sharp');
const PLAYABLE_BOOKMAKERS = ALL_BOOKMAKERS.filter(b => b.category === 'playable');
const BENCHMARK_ONLY_BOOKMAKERS = ALL_BOOKMAKERS.filter(b => b.category === 'benchmark');

// Get bookmakers by network
const INDEPENDENT_BOOKMAKERS = PLAYABLE_BOOKMAKERS.filter(b => b.network === 'Independent');
const KAMBI_BOOKMAKERS = PLAYABLE_BOOKMAKERS.filter(b => b.network === 'Kambi');
const OTHER_BOOKMAKERS = PLAYABLE_BOOKMAKERS.filter(b => b.network === 'Other');

// Primary bookmakers (ones you can actually bet on)
const PRIMARY_BOOKMAKERS = PLAYABLE_BOOKMAKERS.map(b => b.name);

// Benchmark bookmakers (for market comparison)
const BENCHMARK_BOOKMAKERS = [...SHARP_BOOKMAKERS, ...BENCHMARK_ONLY_BOOKMAKERS].map(b => b.name);

// Check if a bookmaker is primary (playable)
const isPrimaryBookmaker = (bookmaker) => {
  if (!bookmaker) return false;
  return PRIMARY_BOOKMAKERS.some(pb =>
    bookmaker.toLowerCase().includes(pb.toLowerCase()) ||
    pb.toLowerCase().includes(bookmaker.toLowerCase())
  );
};

// Get display name for bookmaker
const getBookmakerDisplayName = (bookmaker) => {
  if (!bookmaker) return 'Unknown';
  if (bookmaker.toLowerCase().includes('kambi') || bookmaker.toLowerCase().includes('unibet')) {
    return 'Kambi Network';
  }
  return bookmaker;
};

// Bookmaker badge component - shows if bet is playable or benchmark only
const BookmakerBadge = ({ bookmaker, odds }) => {
  const isPrimary = isPrimaryBookmaker(bookmaker);
  const displayName = getBookmakerDisplayName(bookmaker);

  if (isPrimary) {
    return (
      <motion.div
        className="flex items-center gap-1.5"
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
      >
        <span className="text-white font-bold text-lg">@{odds?.toFixed(2)}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
          {displayName}
        </span>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="flex items-center gap-1.5"
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
    >
      <span className="text-dark-400 font-medium">@{odds?.toFixed(2)}</span>
      <span className="text-xs px-2 py-0.5 rounded-full bg-dark-700 text-dark-400 border border-dark-600">
        {displayName}
      </span>
      <span className="text-[10px] text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded">
        Benchmark
      </span>
    </motion.div>
  );
};

// Market comparison component - shows best available vs what you can play
const MarketComparison = ({ bet, allOddsForMarket }) => {
  const isPrimary = isPrimaryBookmaker(bet.bookmaker);

  // If we had all market odds, we could show comparison
  // For now, just show if this is playable or benchmark
  if (!isPrimary) {
    return (
      <div className="flex items-center gap-2 text-xs text-orange-400 mt-1">
        <AlertTriangle className="w-3 h-3" />
        <span>Not available on Bet365/Kambi - benchmark only</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs text-green-400 mt-1">
      <CheckCircle className="w-3 h-3" />
      <span>Available to bet on {getBookmakerDisplayName(bet.bookmaker)}</span>
    </div>
  );
};

// Skeleton loading component
const SkeletonCard = () => (
  <div className="bg-dark-800 rounded-xl overflow-hidden animate-pulse">
    <div className="p-4 border-b border-dark-700">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full skeleton-shimmer" />
          <div className="space-y-2">
            <div className="w-24 h-3 rounded skeleton-shimmer" />
            <div className="w-40 h-4 rounded skeleton-shimmer" />
          </div>
        </div>
        <div className="w-24 h-12 rounded-lg skeleton-shimmer" />
      </div>
    </div>
    <div className="p-4 space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center justify-between bg-dark-900/30 rounded-lg p-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded skeleton-shimmer" />
            <div className="space-y-1.5">
              <div className="w-28 h-4 rounded skeleton-shimmer" />
              <div className="w-36 h-3 rounded skeleton-shimmer" />
            </div>
          </div>
          <div className="w-20 h-8 rounded-lg skeleton-shimmer" />
        </div>
      ))}
    </div>
  </div>
);

// Glowing badge for extreme values
const GlowingEdgeBadge = ({ edge, children }) => {
  const isExtreme = edge >= 0.30;
  const isHigh = edge >= 0.10;

  return (
    <motion.div
      className={`px-3 py-1.5 rounded-lg border relative overflow-hidden ${
        isExtreme
          ? 'pulse-glow-orange border-orange-500/50 bg-orange-500/20'
          : isHigh
          ? 'pulse-glow-green border-green-500/50 bg-green-500/20'
          : 'border-dark-600 bg-dark-700'
      }`}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      {isExtreme && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-orange-500/0 via-orange-500/30 to-orange-500/0"
          animate={{ x: ['-100%', '100%'] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
        />
      )}
      {children}
    </motion.div>
  );
};

// Confidence level thresholds
const EDGE_THRESHOLDS = {
  HIGH_CONFIDENCE: 0.15,    // 2-15% = realistic
  UNUSUAL: 0.30,            // 15-30% = unusual
  EXTREME: Infinity,        // 30%+ = extreme
};

// Get confidence level for an edge
const getConfidenceLevel = (edge) => {
  if (edge <= EDGE_THRESHOLDS.HIGH_CONFIDENCE) return 'high';
  if (edge <= EDGE_THRESHOLDS.UNUSUAL) return 'unusual';
  return 'extreme';
};

// ============================================
// CONFIDENCE GRADING SYSTEM (A-D)
// ============================================

// Calculate confidence score (0-100) based on multiple factors
const calculateConfidenceScore = (bet) => {
  let score = 0;
  const edge = bet.edge || 0;
  const probability = bet.probability || 0;
  const isPrimary = isPrimaryBookmaker(bet.bookmaker);

  // Edge score (max 40 points)
  // Sweet spot is 3-12% - realistic edges from model
  if (edge >= 0.03 && edge <= 0.10) {
    score += 40; // Perfect edge range
  } else if (edge > 0.10 && edge <= 0.15) {
    score += 32; // Still good
  } else if (edge > 0.15 && edge <= 0.25) {
    score += 18; // Getting unusual
  } else if (edge > 0.25 && edge <= 0.35) {
    score += 8; // Likely overconfident
  } else if (edge > 0.35) {
    score += 0; // Extreme - probably stale odds
  } else if (edge >= 0.02 && edge < 0.03) {
    score += 25; // Low but acceptable edge
  }

  // Probability score (max 30 points)
  // Higher probability = more reliable prediction
  if (probability >= 0.50) {
    score += 30; // High probability event
  } else if (probability >= 0.35) {
    score += 25; // Good probability
  } else if (probability >= 0.25) {
    score += 20; // Moderate probability
  } else if (probability >= 0.15) {
    score += 12; // Lower probability
  } else if (probability >= 0.08) {
    score += 5; // Low probability (longshots)
  }

  // Bookmaker score (max 30 points)
  // Primary bookmakers you can actually bet on are more valuable
  if (isPrimary) {
    score += 30; // Can actually place this bet
  } else {
    score += 10; // Benchmark only - for reference
  }

  return Math.min(100, Math.max(0, score));
};

// Get letter grade from score
const getConfidenceGrade = (bet) => {
  const score = calculateConfidenceScore(bet);

  if (score >= 75) return { grade: 'A', label: 'Excellent', color: 'green', score };
  if (score >= 55) return { grade: 'B', label: 'Good', color: 'blue', score };
  if (score >= 35) return { grade: 'C', label: 'Fair', color: 'yellow', score };
  return { grade: 'D', label: 'Caution', color: 'orange', score };
};

// Grade descriptions for tooltips
const GRADE_DESCRIPTIONS = {
  A: 'High confidence bet with realistic edge, good probability, and available on your bookmaker',
  B: 'Good value bet with reasonable edge and probability factors',
  C: 'Moderate confidence - edge may be unusual or only available as benchmark',
  D: 'Low confidence - extreme edge suggests stale odds or model overconfidence',
};

// Confidence Grade Badge Component
const ConfidenceGradeBadge = ({ bet, showScore = false, size = 'md' }) => {
  const { grade, label, color, score } = getConfidenceGrade(bet);

  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  };

  const colorClasses = {
    green: 'bg-green-500/20 text-green-400 border-green-500/50 shadow-green-500/20',
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/50 shadow-blue-500/20',
    yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50 shadow-yellow-500/20',
    orange: 'bg-orange-500/20 text-orange-400 border-orange-500/50 shadow-orange-500/20',
  };

  const glowClasses = {
    green: 'hover:shadow-lg hover:shadow-green-500/30',
    blue: 'hover:shadow-lg hover:shadow-blue-500/30',
    yellow: 'hover:shadow-lg hover:shadow-yellow-500/30',
    orange: 'hover:shadow-lg hover:shadow-orange-500/30',
  };

  return (
    <motion.div
      className="flex items-center gap-2"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 20 }}
    >
      <motion.div
        className={`${sizeClasses[size]} ${colorClasses[color]} ${glowClasses[color]} rounded-lg border font-bold flex items-center justify-center cursor-help transition-all duration-300`}
        title={`Grade ${grade}: ${label} - ${GRADE_DESCRIPTIONS[grade]}`}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
      >
        {grade}
      </motion.div>
      {showScore && (
        <div className="text-xs text-dark-400">
          <span className={`font-medium text-${color}-400`}>{label}</span>
          <span className="ml-1 opacity-60">({score})</span>
        </div>
      )}
    </motion.div>
  );
};

// Detailed grade breakdown component for expanded view
const GradeBreakdown = ({ bet }) => {
  const { grade, label, color, score } = getConfidenceGrade(bet);
  const edge = bet.edge || 0;
  const probability = bet.probability || 0;
  const isPrimary = isPrimaryBookmaker(bet.bookmaker);

  // Calculate individual scores for display
  let edgeScore = 0;
  if (edge >= 0.03 && edge <= 0.10) edgeScore = 40;
  else if (edge > 0.10 && edge <= 0.15) edgeScore = 32;
  else if (edge > 0.15 && edge <= 0.25) edgeScore = 18;
  else if (edge > 0.25 && edge <= 0.35) edgeScore = 8;
  else if (edge >= 0.02 && edge < 0.03) edgeScore = 25;

  let probScore = 0;
  if (probability >= 0.50) probScore = 30;
  else if (probability >= 0.35) probScore = 25;
  else if (probability >= 0.25) probScore = 20;
  else if (probability >= 0.15) probScore = 12;
  else if (probability >= 0.08) probScore = 5;

  const bookmakerScore = isPrimary ? 30 : 10;

  const barColorClass = {
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    yellow: 'bg-yellow-500',
    orange: 'bg-orange-500',
  };

  return (
    <div className="mt-3 p-3 bg-dark-900/50 rounded-lg border border-dark-700/50">
      <div className="flex items-center gap-3 mb-3">
        <ConfidenceGradeBadge bet={bet} size="lg" />
        <div>
          <div className={`font-bold text-${color}-400`}>Grade {grade}: {label}</div>
          <div className="text-xs text-dark-400">{GRADE_DESCRIPTIONS[grade]}</div>
        </div>
      </div>

      <div className="space-y-2">
        {/* Edge factor */}
        <div className="flex items-center gap-2 text-xs">
          <span className="w-20 text-dark-400">Edge:</span>
          <div className="flex-1 h-2 bg-dark-700 rounded-full overflow-hidden">
            <motion.div
              className={barColorClass[color]}
              initial={{ width: 0 }}
              animate={{ width: `${(edgeScore / 40) * 100}%` }}
              transition={{ duration: 0.5 }}
              style={{ height: '100%' }}
            />
          </div>
          <span className="w-12 text-right text-dark-300">{edgeScore}/40</span>
        </div>

        {/* Probability factor */}
        <div className="flex items-center gap-2 text-xs">
          <span className="w-20 text-dark-400">Probability:</span>
          <div className="flex-1 h-2 bg-dark-700 rounded-full overflow-hidden">
            <motion.div
              className={barColorClass[color]}
              initial={{ width: 0 }}
              animate={{ width: `${(probScore / 30) * 100}%` }}
              transition={{ duration: 0.5, delay: 0.1 }}
              style={{ height: '100%' }}
            />
          </div>
          <span className="w-12 text-right text-dark-300">{probScore}/30</span>
        </div>

        {/* Bookmaker factor */}
        <div className="flex items-center gap-2 text-xs">
          <span className="w-20 text-dark-400">Bookmaker:</span>
          <div className="flex-1 h-2 bg-dark-700 rounded-full overflow-hidden">
            <motion.div
              className={barColorClass[color]}
              initial={{ width: 0 }}
              animate={{ width: `${(bookmakerScore / 30) * 100}%` }}
              transition={{ duration: 0.5, delay: 0.2 }}
              style={{ height: '100%' }}
            />
          </div>
          <span className="w-12 text-right text-dark-300">{bookmakerScore}/30</span>
        </div>

        {/* Total */}
        <div className="flex items-center gap-2 text-xs pt-2 border-t border-dark-700/50 mt-2">
          <span className="w-20 text-dark-300 font-medium">Total:</span>
          <div className="flex-1 h-3 bg-dark-700 rounded-full overflow-hidden">
            <motion.div
              className={`${barColorClass[color]} rounded-full`}
              initial={{ width: 0 }}
              animate={{ width: `${score}%` }}
              transition={{ duration: 0.8, delay: 0.3 }}
              style={{ height: '100%' }}
            />
          </div>
          <span className={`w-12 text-right font-bold text-${color}-400`}>{score}/100</span>
        </div>
      </div>
    </div>
  );
};

// Confidence badge component with animations
const ConfidenceBadge = ({ edge }) => {
  const level = getConfidenceLevel(edge);

  if (level === 'high') {
    return (
      <motion.span
        className="inline-flex items-center gap-1 text-xs text-green-400"
        title="Realistic value bet (2-15% edge)"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 15 }}
      >
        <motion.div
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <CheckCircle className="w-3 h-3" />
        </motion.div>
      </motion.span>
    );
  }
  if (level === 'unusual') {
    return (
      <motion.span
        className="inline-flex items-center gap-1 text-xs text-yellow-400"
        title="Unusual edge - model may be overconfident (15-30%)"
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        <AlertTriangle className="w-3 h-3" />
      </motion.span>
    );
  }
  return (
    <motion.span
      className="inline-flex items-center gap-1 text-xs text-orange-400 flame-animate"
      title="Extreme edge (30%+) - verify odds are current"
    >
      <motion.div
        animate={{
          scale: [1, 1.2, 0.9, 1.1, 1],
          rotate: [-5, 5, -3, 3, 0]
        }}
        transition={{ duration: 0.5, repeat: Infinity }}
      >
        <Flame className="w-3 h-3" />
      </motion.div>
    </motion.span>
  );
};

// Probability bar component with animation
const ProbabilityBar = ({ modelProb, impliedProb }) => {
  const modelPct = Math.min(modelProb * 100, 100);
  const impliedPct = Math.min(impliedProb * 100, 100);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="w-16 text-dark-400">Model:</span>
        <div className="flex-1 h-3 bg-dark-700 rounded-full overflow-hidden relative">
          <motion.div
            className="h-full bg-gradient-to-r from-green-600 to-emerald-400 rounded-full relative"
            initial={{ width: 0 }}
            animate={{ width: `${modelPct}%` }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
          >
            {/* Shimmer effect */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear', delay: 1 }}
            />
          </motion.div>
        </div>
        <motion.span
          className="w-12 text-right text-green-400 font-bold"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8 }}
        >
          {modelPct.toFixed(0)}%
        </motion.span>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="w-16 text-dark-400">Bookmaker:</span>
        <div className="flex-1 h-3 bg-dark-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-dark-600 to-dark-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${impliedPct}%` }}
            transition={{ duration: 1, ease: 'easeOut', delay: 0.4 }}
          />
        </div>
        <motion.span
          className="w-12 text-right text-dark-400"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          {impliedPct.toFixed(0)}%
        </motion.span>
      </div>
      {/* Advantage indicator */}
      <motion.div
        className="flex items-center justify-center gap-2 text-xs mt-2 py-1 px-2 rounded-full bg-green-500/10"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 }}
      >
        <Sparkles className="w-3 h-3 text-green-400" />
        <span className="text-green-400 font-medium">
          +{(modelPct - impliedPct).toFixed(0)}% advantage
        </span>
      </motion.div>
    </div>
  );
};

// Why This Is Value explanation component
const WhyThisIsValue = ({ bet }) => {
  const impliedProb = 1 / bet.bookmakerOdds;
  const modelProb = bet.probability;
  const edge = bet.edge;
  const isPrimary = isPrimaryBookmaker(bet.bookmaker);

  // Determine bet direction (check selection field first, then market/selectionName)
  const selectionStr = (bet.selection || bet.selectionName || bet.market || '').toLowerCase();
  const isOver = selectionStr.includes('over') || selectionStr.includes('yes');
  const isUnder = selectionStr.includes('under') || selectionStr.includes('no');

  // Extract line from selectionName or market name, or use points directly
  const line = bet.points || (bet.selectionName || bet.market || '').match(/(\d+\.?\d*)/)?.[1] || '';

  // Get market type description
  const getMarketDescription = () => {
    if (bet.betType === 'goals') {
      if (isOver) return `Match needs ${parseInt(line) + 1}+ goals`;
      if (isUnder) return `Match needs ${parseInt(line)} or fewer goals`;
    }
    if (bet.betType === 'corners') {
      if (isOver) return `Match needs ${parseInt(line) + 1}+ corners`;
      if (isUnder) return `Match needs ${parseInt(line)} or fewer corners`;
    }
    if (bet.betType === 'cards') {
      if (isOver) return `Match needs ${parseInt(line) + 1}+ cards`;
      if (isUnder) return `Match needs ${parseInt(line)} or fewer cards`;
    }
    if (bet.betType === 'btts') {
      return bet.market?.includes('Yes') ? 'Both teams need to score' : 'At least one team keeps clean sheet';
    }
    if (bet.betType === 'player_shots') {
      const playerName = bet.player || 'Player';
      if (isOver) return `${playerName} needs ${parseFloat(line) + 0.5}+ shots`;
      if (isUnder) return `${playerName} needs ${parseFloat(line) - 0.5} or fewer shots`;
      return `${playerName} shots`;
    }
    if (bet.betType === 'player_sot') {
      const playerName = bet.player || 'Player';
      if (isOver) return `${playerName} needs ${parseFloat(line) + 0.5}+ shots on target`;
      if (isUnder) return `${playerName} needs ${parseFloat(line) - 0.5} or fewer SoT`;
      return `${playerName} shots on target`;
    }
    if (bet.betType === 'goalscorer') {
      const playerName = bet.player || 'Player';
      if (bet.market?.includes('2+')) return `${playerName} to score 2+ goals`;
      if (bet.market?.includes('3+')) return `${playerName} to score 3+ goals`;
      return `${playerName} to score anytime`;
    }
    if (bet.betType === 'team_shots') {
      if (isOver) return `Team needs ${parseInt(line) + 1}+ shots`;
      if (isUnder) return `Team needs ${parseInt(line)} or fewer shots`;
      return 'Team shots';
    }
    if (bet.betType === 'offsides') {
      if (isOver) return `Match needs ${parseInt(line) + 1}+ offsides`;
      if (isUnder) return `Match needs ${parseInt(line)} or fewer offsides`;
      return 'Total offsides';
    }
    if (bet.betType === 'throw_ins') {
      if (isOver) return `Match needs ${parseInt(line) + 1}+ throw-ins`;
      if (isUnder) return `Match needs ${parseInt(line)} or fewer throw-ins`;
      return 'Total throw-ins';
    }
    return bet.market || '';
  };

  return (
    <div className="mt-3 p-3 bg-dark-900/70 rounded-lg border border-dark-700 space-y-3">
      {/* Playable status banner */}
      {isPrimary ? (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 p-2 rounded border border-green-500/20"
        >
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">Playable on {getBookmakerDisplayName(bet.bookmaker)}</span>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-sm text-orange-400 bg-orange-500/10 p-2 rounded border border-orange-500/20"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">Benchmark only - {getBookmakerDisplayName(bet.bookmaker)} not available for betting</span>
        </motion.div>
      )}

      <div className="flex items-start gap-2">
        <Info className="w-4 h-4 text-primary-400 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-dark-300">
          <span className="text-white font-medium">{getMarketDescription()}</span>
          <br />
          Our model: <span className="text-green-400">{(modelProb * 100).toFixed(1)}%</span> probability → Fair odds: <span className="text-white">{bet.fairOdds?.toFixed(2)}</span>
          <br />
          {getBookmakerDisplayName(bet.bookmaker)} offers: <span className="text-white">@{bet.bookmakerOdds?.toFixed(2)}</span> (implied: {(impliedProb * 100).toFixed(1)}%)
        </div>
      </div>

      <ProbabilityBar modelProb={modelProb} impliedProb={impliedProb} />

      {/* Goals/BTTS Calculation Breakdown - Simple Visual Explanation */}
      {(bet.betType === 'goals' || bet.betType === 'btts') && bet.calculationDetails && (
        <div className="mt-3 p-3 bg-gradient-to-br from-primary-500/10 to-cyan-500/10 rounded-lg border border-primary-500/20">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-primary-400" />
            <span className="text-sm font-medium text-white">How We Calculate This</span>
          </div>

          {/* Step 1: Team Recent Form */}
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2 text-dark-400 mb-2">
              <span className="w-5 h-5 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center font-bold">1</span>
              <span>Recent Form (Last {bet.calculationDetails.recentMatches} matches, weighted)</span>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              {/* Home Team Stats */}
              <div className="bg-dark-800/50 rounded-lg p-2">
                <div className="text-dark-400 mb-1">{bet.fixture?.homeTeam?.name}</div>
                <div className="flex justify-between">
                  <span className="text-dark-500">Scores:</span>
                  <span className="text-green-400 font-medium">{bet.calculationDetails.homeGoalsAvg?.toFixed(2)}/game</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-500">Concedes:</span>
                  <span className="text-red-400 font-medium">{bet.calculationDetails.homeConcededAvg?.toFixed(2)}/game</span>
                </div>
              </div>

              {/* Away Team Stats */}
              <div className="bg-dark-800/50 rounded-lg p-2">
                <div className="text-dark-400 mb-1">{bet.fixture?.awayTeam?.name}</div>
                <div className="flex justify-between">
                  <span className="text-dark-500">Scores:</span>
                  <span className="text-green-400 font-medium">{bet.calculationDetails.awayGoalsAvg?.toFixed(2)}/game</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-dark-500">Concedes:</span>
                  <span className="text-red-400 font-medium">{bet.calculationDetails.awayConcededAvg?.toFixed(2)}/game</span>
                </div>
              </div>
            </div>

            {/* Step 2: Expected Goals Calculation */}
            <div className="flex items-center gap-2 text-dark-400 mb-2">
              <span className="w-5 h-5 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center font-bold">2</span>
              <span>Expected Goals Formula</span>
            </div>

            <div className="bg-dark-900/50 rounded-lg p-3 mb-3 font-mono text-[11px] space-y-1">
              <div className="flex items-center gap-1">
                <span className="text-dark-400">Home xG =</span>
                <span className="text-cyan-400">({bet.calculationDetails.homeGoalsAvg?.toFixed(2)} + {bet.calculationDetails.awayConcededAvg?.toFixed(2)})</span>
                <span className="text-dark-500">÷ 2</span>
                <span className="text-yellow-400">× 1.08</span>
                <span className="text-dark-500">=</span>
                <span className="text-green-400 font-bold">{bet.calculationDetails.homeExpected?.toFixed(2)}</span>
              </div>
              <div className="text-[10px] text-dark-500 ml-14">↑ attack + opp defense, with +8% home advantage</div>

              <div className="flex items-center gap-1 mt-2">
                <span className="text-dark-400">Away xG =</span>
                <span className="text-cyan-400">({bet.calculationDetails.awayGoalsAvg?.toFixed(2)} + {bet.calculationDetails.homeConcededAvg?.toFixed(2)})</span>
                <span className="text-dark-500">÷ 2</span>
                <span className="text-dark-500">=</span>
                <span className="text-green-400 font-bold">{bet.calculationDetails.awayExpected?.toFixed(2)}</span>
              </div>

              <div className="border-t border-dark-700 pt-2 mt-2 flex items-center gap-1">
                <span className="text-white font-medium">Total xG =</span>
                <span className="text-green-400">{bet.calculationDetails.homeExpected?.toFixed(2)}</span>
                <span className="text-dark-400">+</span>
                <span className="text-green-400">{bet.calculationDetails.awayExpected?.toFixed(2)}</span>
                <span className="text-dark-400">=</span>
                <span className="text-xl text-yellow-400 font-bold">{bet.calculationDetails.totalExpectedGoals?.toFixed(2) || ((bet.calculationDetails.homeExpected || 0) + (bet.calculationDetails.awayExpected || 0)).toFixed(2)}</span>
                <span className="text-dark-400">goals</span>
              </div>
            </div>

            {/* Step 3: Poisson Distribution Result */}
            <div className="flex items-center gap-2 text-dark-400 mb-2">
              <span className="w-5 h-5 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center font-bold">3</span>
              <span>Poisson Distribution → Probability</span>
            </div>

            <div className="bg-dark-800/50 rounded-lg p-2">
              <div className="flex items-center justify-between">
                <span className="text-dark-400">With {((bet.calculationDetails.homeExpected || 0) + (bet.calculationDetails.awayExpected || 0)).toFixed(1)} expected goals:</span>
                <span className="text-lg font-bold text-green-400">{(bet.probability * 100).toFixed(1)}%</span>
              </div>
              <div className="text-[10px] text-dark-500 mt-1">
                {isOver
                  ? `${parseInt(line) + 1}+ goals happens ${(bet.probability * 100).toFixed(0)}% of the time`
                  : `${parseInt(line)} or fewer goals happens ${(bet.probability * 100).toFixed(0)}% of the time`
                }
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Team Shots Calculation Breakdown */}
      {bet.betType === 'team_shots' && bet.stats && (
        <div className="mt-3 p-3 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 rounded-lg border border-cyan-500/20">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-medium text-white">How We Calculate This</span>
          </div>
          {bet.stats.reasoning && (
            <div className="mb-3 p-2 bg-dark-800/50 rounded-lg text-xs text-dark-300 leading-relaxed">
              {bet.stats.reasoning}
            </div>
          )}
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2 text-dark-400 mb-2">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">1</span>
              <span>Season Shot Averages</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-dark-800/50 rounded-lg p-2">
                <div className="text-dark-400 mb-1">{bet.stats.homeTeam || bet.fixture?.homeTeam?.name}</div>
                <div className="flex justify-between">
                  <span className="text-dark-500">Shots/match:</span>
                  <span className="text-cyan-400 font-medium">{bet.stats.homeAvg?.toFixed(1) || '?'}</span>
                </div>
              </div>
              <div className="bg-dark-800/50 rounded-lg p-2">
                <div className="text-dark-400 mb-1">{bet.stats.awayTeam || bet.fixture?.awayTeam?.name}</div>
                <div className="flex justify-between">
                  <span className="text-dark-500">Shots/match:</span>
                  <span className="text-cyan-400 font-medium">{bet.stats.awayAvg?.toFixed(1) || '?'}</span>
                </div>
              </div>
            </div>
            {bet.stats.calculation && (
              <>
                <div className="flex items-center gap-2 text-dark-400 mb-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">2</span>
                  <span>Expected Shots Calculation</span>
                </div>
                <div className="bg-dark-900/50 rounded-lg p-3 mb-3 font-mono text-[11px]">
                  <span className="text-dark-400">Expected Shots = </span>
                  <span className="text-cyan-400">{bet.stats.homeAvg?.toFixed(1) || '?'}</span>
                  <span className="text-dark-500"> + </span>
                  <span className="text-cyan-400">{bet.stats.awayAvg?.toFixed(1) || '?'}</span>
                  <span className="text-dark-500"> = </span>
                  <span className="text-xl text-yellow-400 font-bold">{bet.stats.calculation.lambda}</span>
                  <span className="text-dark-400"> shots</span>
                </div>
                <div className="flex items-center gap-2 text-dark-400 mb-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">3</span>
                  <span>{bet.stats.calculation.model}</span>
                </div>
                <div className="bg-dark-800/50 rounded-lg p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-dark-400">With lambda = {bet.stats.calculation.lambda}:</span>
                    <span className="text-lg font-bold text-green-400">{(bet.probability * 100).toFixed(1)}%</span>
                  </div>
                  <div className="text-[10px] text-dark-500 mb-1">Threshold: {bet.stats.calculation.threshold} shots</div>
                  <div className="text-[10px] text-dark-500 font-mono">{bet.stats.calculation.formula}</div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Confidence Grade Breakdown */}
      <GradeBreakdown bet={bet} />

      {/* Player Match History */}
      {bet.playerHistory && bet.playerHistory.matches && bet.playerHistory.matches.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center gap-2 mb-2">
            <Crosshair className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-medium text-white">Last {bet.playerHistory.matches.length} Matches</span>
            <span className="text-xs text-dark-400">
              (Avg: {bet.playerHistory.averages?.shotsPerMatch?.toFixed(1) || '?'} shots, {bet.playerHistory.averages?.shotsOnTargetPerMatch?.toFixed(1) || '?'} SoT)
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {bet.playerHistory.matches.map((match, i) => (
              <div
                key={i}
                className="bg-dark-800/50 rounded p-1.5 text-center border border-dark-700"
                title={`vs ${match.opponent} - ${new Date(match.date).toLocaleDateString()}`}
              >
                <div className="text-[10px] text-dark-400 truncate">{match.opponent?.split(' ')[0] || '?'}</div>
                <div className="text-sm font-bold text-cyan-400">{match.shots}</div>
                <div className="text-[10px] text-teal-400">{match.shotsOnTarget} SoT</div>
                {match.goals > 0 && <div className="text-[10px] text-green-400">{match.goals}G</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Benchmark Panel - Compare odds across all bookmakers */}
      {bet.benchmark && bet.benchmark.bookmakerCount > 1 && (
        <div className="mt-3 p-3 bg-gradient-to-br from-blue-500/10 to-indigo-500/10 rounded-lg border border-blue-500/20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-white">Odds Comparison ({bet.benchmark.bookmakerCount} bookmakers)</span>
            </div>
            <div className="text-xs text-dark-400">
              Spread: <span className="text-yellow-400 font-medium">{bet.benchmark.spreadPercent}%</span>
            </div>
          </div>

          {/* Best vs Worst */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-2">
              <div className="text-xs text-green-400 mb-1">Best Odds</div>
              <div className="text-lg font-bold text-white">@{bet.benchmark.best.decimalOdds.toFixed(2)}</div>
              <div className="text-xs text-dark-400">{bet.benchmark.best.sportsbook}</div>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2">
              <div className="text-xs text-red-400 mb-1">Worst Odds</div>
              <div className="text-lg font-bold text-dark-300">@{bet.benchmark.worst.decimalOdds.toFixed(2)}</div>
              <div className="text-xs text-dark-400">{bet.benchmark.worst.sportsbook}</div>
            </div>
          </div>

          {/* All Bookmakers List */}
          <div className="space-y-1">
            <div className="text-xs text-dark-400 mb-2">All Available Odds:</div>
            <div className="grid grid-cols-2 gap-1">
              {bet.benchmark.allBookmakers.slice(0, 6).map((bm, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between text-xs p-1.5 rounded ${
                    idx === 0 ? 'bg-green-500/10 border border-green-500/20' : 'bg-dark-800/50'
                  }`}
                >
                  <span className={idx === 0 ? 'text-green-400' : 'text-dark-400'}>{bm.sportsbook}</span>
                  <div className="flex items-center gap-2">
                    <span className={idx === 0 ? 'text-white font-bold' : 'text-dark-300'}>@{bm.decimalOdds.toFixed(2)}</span>
                    {idx > 0 && <span className="text-red-400 text-[10px]">-{bm.diffFromBest}</span>}
                  </div>
                </div>
              ))}
            </div>
            {bet.benchmark.allBookmakers.length > 6 && (
              <div className="text-xs text-dark-500 text-center mt-1">
                +{bet.benchmark.allBookmakers.length - 6} more bookmakers
              </div>
            )}
          </div>
        </div>
      )}

      {/* Arbitrage Alert - Show if arbitrage or opposite value exists */}
      {bet.arbitrage && (bet.arbitrage.hasArbitrage || bet.arbitrage.oppositeHasValue) && (
        <div className={`mt-3 p-3 rounded-lg border ${
          bet.arbitrage.hasArbitrage
            ? 'bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border-yellow-500/30'
            : 'bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            {bet.arbitrage.hasArbitrage ? (
              <>
                <Flame className="w-4 h-4 text-yellow-400 animate-pulse" />
                <span className="text-sm font-bold text-yellow-400">Arbitrage Opportunity!</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300">
                  +{bet.arbitrage.arbitrageMargin}% guaranteed
                </span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-purple-400">Opposite Bet Has Value</span>
              </>
            )}
          </div>

          <div className="bg-dark-900/50 rounded-lg p-2 space-y-2">
            {/* Current bet info */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-dark-400">This bet:</span>
              <span className="text-green-400">+{bet.edgePercent} edge</span>
            </div>

            {/* Opposite bet info */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-dark-400">Opposite ({bet.arbitrage.oppositeSelection}):</span>
              <div className="flex items-center gap-2">
                <span className="text-white">@{bet.arbitrage.oppositeBest?.decimalOdds?.toFixed(2)}</span>
                <span className={bet.arbitrage.oppositeEdge > 0 ? 'text-green-400' : 'text-red-400'}>
                  {bet.arbitrage.oppositeEdge > 0 ? '+' : ''}{bet.arbitrage.oppositeEdge}%
                </span>
              </div>
            </div>
            <div className="text-[10px] text-dark-500">
              Best on: {bet.arbitrage.oppositeBest?.sportsbook}
            </div>

            {/* Recommendation */}
            {bet.arbitrage.recommendation && (
              <div className={`text-xs p-2 rounded ${
                bet.arbitrage.hasArbitrage
                  ? 'bg-yellow-500/10 text-yellow-300'
                  : 'bg-purple-500/10 text-purple-300'
              }`}>
                💡 {bet.arbitrage.recommendation}
              </div>
            )}

            {/* Arbitrage combined probability */}
            {bet.arbitrage.hasArbitrage && (
              <div className="text-xs text-dark-400 pt-2 border-t border-dark-700">
                Combined implied: <span className="text-yellow-400">{(bet.arbitrage.combinedImpliedProbability * 100).toFixed(1)}%</span>
                <span className="text-dark-500 ml-1">(under 100% = profit)</span>
              </div>
            )}
          </div>
        </div>
      )}

      {edge > 0.30 && (
        <div className="flex items-start gap-2 text-xs text-orange-400 bg-orange-500/10 p-2 rounded">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>High edge may indicate stale odds or model overconfidence. Verify current odds before betting.</span>
        </div>
      )}
    </div>
  );
};

// Best bets summary card with wow animations - now with clickable anchors
const BestBetsSummary = ({ bets }) => {
  // Get top 3 bets prioritized by grade first, then edge
  // Grade A bets are more actionable than high-edge Grade C bets
  const topBets = useMemo(() => {
    const sorted = [...bets].sort((a, b) => {
      const gradeA = calculateConfidenceScore(a);
      const gradeB = calculateConfidenceScore(b);
      // Primary sort by grade score (higher is better)
      if (gradeA !== gradeB) return gradeB - gradeA;
      // Secondary sort by edge
      return b.edge - a.edge;
    });
    return sorted.slice(0, 3);
  }, [bets]);

  // Scroll to match card when clicking on a top bet
  const scrollToMatch = useCallback((fixtureId) => {
    const element = document.getElementById(`match-${fixtureId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add a highlight effect
      element.classList.add('ring-2', 'ring-yellow-400/50');
      setTimeout(() => {
        element.classList.remove('ring-2', 'ring-yellow-400/50');
      }, 2000);
    }
  }, []);

  if (topBets.length === 0) return null;

  const medals = ['🥇', '🥈', '🥉'];
  const medalColors = ['from-yellow-500/20 to-amber-500/10', 'from-gray-400/20 to-slate-400/10', 'from-orange-600/20 to-amber-600/10'];

  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, type: 'spring' }}
      className="glass-card rounded-xl p-5 relative overflow-hidden"
    >
      {/* Background glow effect */}
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-yellow-500/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl" />

      <div className="flex items-center gap-3 mb-4 relative">
        <motion.div
          animate={{
            rotate: [-5, 5, -5],
            y: [0, -5, 0],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Trophy className="w-7 h-7 text-yellow-400 drop-shadow-lg" />
        </motion.div>
        <div>
          <h3 className="font-bold text-white text-lg">Today's Best Value Bets</h3>
          <p className="text-xs text-dark-400">Top picks ranked by confidence grade • Click to jump to bet</p>
        </div>
        <motion.div
          className="ml-auto"
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        >
          <Sparkles className="w-5 h-5 text-yellow-400/50" />
        </motion.div>
      </div>

      <div className="space-y-3 relative">
        {topBets.map((bet, index) => (
          <motion.div
            key={`${bet.fixture?.id}-${bet.market}-${index}`}
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.15, type: 'spring', stiffness: 100 }}
            whileHover={{ scale: 1.02, x: 5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => scrollToMatch(bet.fixture?.id)}
            className={`flex items-center justify-between bg-gradient-to-r ${medalColors[index]} backdrop-blur-sm rounded-xl p-3 border border-dark-700/50 hover:border-yellow-500/50 transition-all cursor-pointer hover-lift group`}
          >
            <div className="flex items-center gap-3">
              <motion.span
                className="text-2xl medal-shine"
                animate={index === 0 ? { scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] } : {}}
                transition={{ duration: 2, repeat: Infinity }}
              >
                {medals[index]}
              </motion.span>
              <div>
                <div className="text-sm text-white font-semibold flex items-center gap-2">
                  {bet.selectionName || bet.market}
                  {index === 0 && (
                    <motion.span
                      className="text-[10px] bg-gradient-to-r from-yellow-500 to-amber-400 text-dark-900 px-2 py-0.5 rounded-full font-bold"
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      TOP PICK
                    </motion.span>
                  )}
                </div>
                <div className="text-xs text-dark-400 group-hover:text-dark-300 transition-colors">
                  {bet.fixture?.homeTeam?.name} vs {bet.fixture?.awayTeam?.name}
                  <span className="ml-2 text-yellow-400/60 group-hover:text-yellow-400 transition-colors">↓ Click to view</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ConfidenceGradeBadge bet={bet} size="sm" />
              <span className="text-sm text-dark-400 font-mono">@{bet.bookmakerOdds?.toFixed(2)}</span>
              <motion.div
                className={`font-bold text-lg ${getEdgeColor(bet.edge)} text-glow-green cursor-help`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5 + index * 0.15, type: 'spring' }}
                title="Edge %: Your advantage over the bookmaker. Higher edge = better value bet."
              >
                <AnimatedCounter value={(bet.edge * 100).toFixed(1)} className={getEdgeColor(bet.edge)} />
              </motion.div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
};

// Grouped bets by market type component
const GroupedBets = ({ bets, maxInitialShow = 3 }) => {
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedBets, setExpandedBets] = useState({});

  // Group bets by type and prioritize primary bookmakers
  const groupedBets = useMemo(() => {
    const groups = {
      goals: { label: 'Goals', icon: Circle, color: 'green', bets: [], primaryBets: [], benchmarkBets: [] },
      btts: { label: 'BTTS', icon: Users, color: 'purple', bets: [], primaryBets: [], benchmarkBets: [] },
      corners: { label: 'Corners', icon: CornerDownRight, color: 'blue', bets: [], primaryBets: [], benchmarkBets: [] },
      cards: { label: 'Cards', icon: Square, color: 'yellow', bets: [], primaryBets: [], benchmarkBets: [] },
      player_shots: { label: 'Player Shots', icon: Crosshair, color: 'cyan', bets: [], primaryBets: [], benchmarkBets: [] },
      player_sot: { label: 'Player SoT', icon: Target, color: 'teal', bets: [], primaryBets: [], benchmarkBets: [] },
      goalscorer: { label: 'Goalscorer', icon: User, color: 'pink', bets: [], primaryBets: [], benchmarkBets: [] },
      team_shots: { label: 'Team Shots', icon: Crosshair, color: 'indigo', bets: [], primaryBets: [], benchmarkBets: [] },
      offsides: { label: 'Offsides', icon: AlertTriangle, color: 'orange', bets: [], primaryBets: [], benchmarkBets: [] },
      throw_ins: { label: 'Throw-Ins', icon: ArrowRight, color: 'lime', bets: [], primaryBets: [], benchmarkBets: [] },
    };

    bets.forEach(bet => {
      if (groups[bet.betType]) {
        const isPrimary = isPrimaryBookmaker(bet.bookmaker);
        if (isPrimary) {
          groups[bet.betType].primaryBets.push({ ...bet, isPrimary: true });
        } else {
          groups[bet.betType].benchmarkBets.push({ ...bet, isPrimary: false });
        }
      }
    });

    // Combine and sort: Primary bets first (by edge), then benchmark bets (by edge)
    Object.values(groups).forEach(group => {
      group.primaryBets.sort((a, b) => b.edge - a.edge);
      group.benchmarkBets.sort((a, b) => b.edge - a.edge);
      // Primary bets come first, then benchmarks
      group.bets = [...group.primaryBets, ...group.benchmarkBets];
      // Count for display
      group.primaryCount = group.primaryBets.length;
      group.benchmarkCount = group.benchmarkBets.length;
    });

    // Filter out empty groups and sort by best primary edge (or benchmark if no primary)
    return Object.entries(groups)
      .filter(([_, group]) => group.bets.length > 0)
      .sort((a, b) => {
        const bestA = a[1].primaryBets[0]?.edge || a[1].benchmarkBets[0]?.edge || 0;
        const bestB = b[1].primaryBets[0]?.edge || b[1].benchmarkBets[0]?.edge || 0;
        return bestB - bestA;
      });
  }, [bets]);

  const toggleGroup = (type) => {
    setExpandedGroups(prev => ({
      ...prev,
      [type]: !prev[type]
    }));
  };

  const toggleBetExpansion = (betKey) => {
    setExpandedBets(prev => ({
      ...prev,
      [betKey]: !prev[betKey]
    }));
  };

  const colorClasses = {
    green: 'bg-green-500/20 text-green-400 border-green-500/30',
    purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    cyan: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    teal: 'bg-teal-500/20 text-teal-400 border-teal-500/30',
    pink: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
    indigo: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  };

  return (
    <div className="space-y-2">
      {groupedBets.map(([type, group]) => {
        const Icon = group.icon;
        const isExpanded = expandedGroups[type] !== false; // Default to expanded
        const visibleBets = isExpanded ? group.bets : group.bets.slice(0, maxInitialShow);
        const hiddenCount = group.bets.length - maxInitialShow;
        const bestEdge = group.bets[0]?.edge || 0;

        return (
          <div key={type} className="bg-dark-900/30 rounded-lg overflow-hidden">
            {/* Group header */}
            <button
              onClick={() => toggleGroup(type)}
              className="w-full flex items-center justify-between p-3 hover:bg-dark-800/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg border ${colorClasses[group.color]}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="font-medium text-white">{group.label}</span>
                <div className="flex items-center gap-1.5">
                  {group.primaryCount > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30">
                      {group.primaryCount} playable
                    </span>
                  )}
                  {group.benchmarkCount > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-dark-700 text-dark-400 border border-dark-600">
                      {group.benchmarkCount} benchmark
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${getEdgeColor(bestEdge)}`}>
                  Best: +{(bestEdge * 100).toFixed(1)}%
                </span>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-dark-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-dark-400" />
                )}
              </div>
            </button>

            {/* Group bets */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 space-y-2">
                    {visibleBets.map((bet, betIndex) => {
                      const betKey = `${type}-${betIndex}`;
                      const selectionStr = (bet.selection || bet.selectionName || bet.market || '').toLowerCase();
                      const isOver = selectionStr.includes('over') || selectionStr.includes('yes');
                      const isUnder = selectionStr.includes('under') || selectionStr.includes('no');
                      const isBetExpanded = expandedBets[betKey];
                      const ev10 = (bet.edge * 10).toFixed(2); // EV per €10 bet

                      return (
                        <div key={betKey}>
                          <div
                            className={`flex items-center justify-between rounded-lg p-3 cursor-pointer transition-colors ${
                              bet.isPrimary
                                ? 'bg-dark-800/50 hover:bg-dark-800 border-l-2 border-green-500/50'
                                : 'bg-dark-900/30 hover:bg-dark-900/50 border-l-2 border-dark-600 opacity-75'
                            }`}
                            onClick={() => toggleBetExpansion(betKey)}
                          >
                            <div className="flex items-center gap-3">
                              {/* Direction indicator */}
                              <div className={`p-1 rounded ${
                                isOver ? 'bg-green-500/20 text-green-400' :
                                isUnder ? 'bg-red-500/20 text-red-400' :
                                'bg-dark-700 text-dark-400'
                              }`}>
                                {isOver ? <ArrowUp className="w-3 h-3" /> :
                                 isUnder ? <ArrowDown className="w-3 h-3" /> :
                                 <Target className="w-3 h-3" />}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-white font-medium">
                                    {bet.player && <span className="text-cyan-400">{bet.player}: </span>}
                                    {bet.selectionName || bet.market}
                                  </span>
                                  {betIndex === 0 && (
                                    <motion.span
                                      className="text-xs shimmer-badge text-white px-2 py-0.5 rounded-full font-semibold"
                                      initial={{ scale: 0 }}
                                      animate={{ scale: 1 }}
                                      transition={{ type: 'spring', stiffness: 500 }}
                                    >
                                      ⭐ Best
                                    </motion.span>
                                  )}
                                </div>
                                <div className="text-xs text-dark-400 flex items-center gap-1 flex-wrap">
                                  <span
                                    className="underline decoration-dotted decoration-dark-500 cursor-help"
                                    title="Probability: The calculated likelihood of this outcome happening based on team statistics. Higher = more likely."
                                  >
                                    {(bet.probability * 100).toFixed(1)}% prob
                                  </span>
                                  <span>•</span>
                                  <span
                                    className="underline decoration-dotted decoration-dark-500 cursor-help"
                                    title="Fair Odds: What this bet should be priced at. If bookmaker odds are higher, it's a value bet."
                                  >
                                    Fair: {bet.fairOdds?.toFixed(2)}
                                  </span>
                                  <span>•</span>
                                  <span
                                    className="underline decoration-dotted decoration-dark-500 cursor-help"
                                    title="Expected Value: Average profit per €10 bet. Positive EV means long-term profit expected."
                                  >
                                    EV: +€{ev10}/€10
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              {/* Bookmaker with playable/benchmark indicator */}
                              <div className="text-right">
                                <div className={`font-medium ${bet.isPrimary ? 'text-white' : 'text-dark-400'}`}>
                                  @{bet.bookmakerOdds?.toFixed(2)}
                                </div>
                                <div className="flex items-center gap-1 justify-end">
                                  <span className={`text-xs ${bet.isPrimary ? 'text-green-400' : 'text-dark-500'}`}>
                                    {getBookmakerDisplayName(bet.bookmaker)}
                                  </span>
                                  {!bet.isPrimary && (
                                    <span className="text-[9px] px-1 py-0.5 rounded bg-orange-500/20 text-orange-400">
                                      REF
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <ConfidenceGradeBadge bet={bet} size="sm" />
                                <span
                                  className={`px-2 py-1 rounded-lg text-sm font-bold cursor-help ${
                                    bet.isPrimary ? getEdgeColor(bet.edge) : 'text-dark-400 bg-dark-700'
                                  }`}
                                  title="Edge %: Your advantage over the bookmaker. Higher edge = better value bet."
                                >
                                  +{bet.edgePercent}
                                </span>
                              </div>
                              <ChevronDown className={`w-4 h-4 text-dark-400 transition-transform ${isBetExpanded ? 'rotate-180' : ''}`} />
                            </div>
                          </div>

                          {/* Expanded bet details */}
                          <AnimatePresence>
                            {isBetExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                              >
                                <WhyThisIsValue bet={bet} />
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}

                    {/* Show more button */}
                    {!isExpanded && hiddenCount > 0 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleGroup(type);
                        }}
                        className="w-full text-center text-sm text-primary-400 hover:text-primary-300 py-2"
                      >
                        + Show {hiddenCount} more {group.label.toLowerCase()} bet{hiddenCount !== 1 ? 's' : ''}
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
};

// Helper functions
const getEdgeColor = (edge) => {
  if (edge >= 0.1) return 'text-green-400';
  if (edge >= 0.05) return 'text-emerald-400';
  if (edge >= 0.03) return 'text-yellow-400';
  return 'text-dark-300';
};

const getEdgeBgColor = (edge) => {
  if (edge >= 0.1) return 'bg-green-500/20 border-green-500/30';
  if (edge >= 0.05) return 'bg-emerald-500/20 border-emerald-500/30';
  if (edge >= 0.03) return 'bg-yellow-500/20 border-yellow-500/30';
  return 'bg-dark-700 border-dark-600';
};

// Sort options
const SORT_OPTIONS = [
  { value: 'grade', label: 'Confidence', icon: CheckCircle },
  { value: 'edge', label: 'Best Edge', icon: Percent },
  { value: 'probability', label: 'Probability', icon: Target },
  { value: 'time', label: 'Kick-off Time', icon: Clock },
  { value: 'odds', label: 'Odds', icon: TrendingUp },
];

// Grade filter options
const GRADE_FILTERS = [
  { value: 'all', label: 'All Grades', description: 'Show all bets' },
  { value: 'a', label: 'Grade A', description: 'Excellent - playable bets' },
  { value: 'ab', label: 'A + B', description: 'Good confidence bets' },
  { value: 'abc', label: 'A + B + C', description: 'Exclude low confidence' },
];

// Bookmaker filter options
const BOOKMAKER_FILTERS = [
  { value: 'playable', label: 'Playable Only', description: 'All your playable bookmakers', icon: CheckCircle },
  { value: 'kambi', label: 'Kambi Network', description: 'Unibet, LeoVegas, Betsson, etc. (shared odds)', icon: null },
  { value: 'all', label: 'All Bookmakers', description: 'Include benchmark odds', icon: null },
];

// Individual bookmaker options for multi-select
const INDIVIDUAL_BOOKMAKERS = [
  // Independent (unique odds - both recommended)
  { id: 'betano', name: 'Betano', network: 'Independent', emoji: '🅱️' },
  { id: 'unibet', name: 'Unibet', network: 'Kambi', emoji: '🇺' },
  { id: 'bet365', name: 'Bet365', network: 'Independent', emoji: '⭐' },
  { id: 'expekt', name: 'Expekt', network: 'Kambi', emoji: '🇪' },
  { id: 'leovegas', name: 'LeoVegas', network: 'Kambi', emoji: '🦁' },
  { id: 'campobet', name: 'Campobet', network: 'Other', emoji: '⛺' },
  { id: 'betinia', name: 'Betinia', network: 'Other', emoji: '🅱️' },
  { id: 'betsson', name: 'Betsson', network: 'Kambi', emoji: '🅱️' },
  { id: 'nordicbet', name: 'Nordicbet', network: 'Kambi', emoji: '❄️' },
];

// Filter presets
const FILTER_PRESETS = [
  { id: 'grade-a', label: 'Grade A Only', icon: CheckCircle, config: { gradeFilter: 'a', bookmakerFilter: 'playable' } },
  { id: 'grade-ab', label: 'Grade A+B', icon: Star, config: { gradeFilter: 'ab', bookmakerFilter: 'playable' } },
  { id: 'goals-only', label: 'Goals Only', icon: Circle, config: { betTypes: ['goals'], bookmakerFilter: 'playable' } },
  { id: 'corners-only', label: 'Corners Only', icon: CornerDownRight, config: { betTypes: ['corners'], bookmakerFilter: 'playable' } },
  { id: 'player-props', label: 'Player Props', icon: User, config: { betTypes: ['player_shots', 'player_sot', 'goalscorer'], bookmakerFilter: 'playable' } },
  { id: 'all-bets', label: 'All Bets', icon: Zap, config: { betTypes: ['goals', 'btts', 'corners', 'cards', 'player_shots', 'player_sot', 'goalscorer', 'team_shots', 'offsides', 'throw_ins'], gradeFilter: 'all', bookmakerFilter: 'all' } },
];

export default function ValueBetsDashboard() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [valueBets, setValueBets] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetched, setLastFetched] = useState(null);

  // Filters
  const [minEdge, setMinEdge] = useState(2);
  const [maxEdge, setMaxEdge] = useState(100);
  const [minOdds, setMinOdds] = useState(1.2); // Default min odds 1.20
  const [maxOdds, setMaxOdds] = useState(3); // Default max odds 3.00
  const [selectedLeagues, setSelectedLeagues] = useState([]);
  const [selectedBetTypes, setSelectedBetTypes] = useState(['goals', 'btts', 'corners', 'cards', 'player_shots', 'player_sot', 'goalscorer', 'team_shots', 'offsides', 'throw_ins']);
  const [gradeFilter, setGradeFilter] = useState('all'); // 'all', 'a', 'ab', 'abc'
  const [bookmakerFilter, setBookmakerFilter] = useState('playable'); // 'playable', 'kambi', 'all', or 'custom'
  const [selectedBookmakers, setSelectedBookmakers] = useState(INDIVIDUAL_BOOKMAKERS.map(b => b.id)); // All selected by default
  const [showFilters, setShowFilters] = useState(true); // Default to expanded
  const [showBookmakersInfo, setShowBookmakersInfo] = useState(false); // Bookmakers info panel
  const [smartFilter, setSmartFilter] = useState(true); // Smart filter: show only best bet per market category
  const [sortBy, setSortBy] = useState('grade'); // Default to sort by confidence grade
  const [sortOrder, setSortOrder] = useState('desc');
  const [activePreset, setActivePreset] = useState(null);

  // Reset all filters to defaults
  const resetFilters = () => {
    setMinEdge(2);
    setMaxEdge(100);
    setMinOdds(1.2);
    setMaxOdds(3);
    setSelectedLeagues([]);
    setSelectedBetTypes(['goals', 'btts', 'corners', 'cards', 'player_shots', 'player_sot', 'goalscorer', 'team_shots', 'offsides', 'throw_ins']);
    setGradeFilter('all');
    setBookmakerFilter('playable');
    setSelectedBookmakers(INDIVIDUAL_BOOKMAKERS.map(b => b.id));
    setSmartFilter(true);
    setSortBy('grade');
    setSortOrder('desc');
    setActivePreset(null);
  };

  // Check if any filters are modified from defaults
  const hasActiveFilters = selectedLeagues.length > 0 || minEdge !== 2 || maxEdge !== 100 || minOdds !== 1.2 || maxOdds !== 3 || gradeFilter !== 'all' || bookmakerFilter !== 'all' || activePreset;

  // Fetch value bets - ONLY on date change, filters are applied client-side
  const fetchValueBets = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    setError(null);

    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      // Always fetch ALL bet types - filtering happens client-side for instant response
      const response = await probabilityApi.getValueBets({
        date: dateStr,
        minEdge: 0, // Get all bets, filter client-side
        betTypes: 'goals,btts,corners,cards,player_shots,player_sot,goalscorer,team_shots,offsides,throw_ins',
      });

      if (response.success) {
        setValueBets(response.data || []);
        setMeta(response.meta || null);
        setLastFetched(new Date());
      } else {
        setError('Failed to load value bets');
      }
    } catch (err) {
      console.error('Error fetching value bets:', err);
      setError('Failed to load value bets. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Only re-fetch when DATE changes - all other filters work client-side instantly
  useEffect(() => {
    fetchValueBets();
  }, [selectedDate]);

  // Filter by all criteria - ALL filtering happens client-side for instant response
  const filteredBets = useMemo(() => {
    let filtered = valueBets;

    // Filter by minimum edge (was previously server-side)
    if (minEdge > 0) {
      filtered = filtered.filter(bet => bet.edge * 100 >= minEdge);
    }

    // Filter by selected bet types (was previously server-side)
    if (selectedBetTypes.length > 0 && selectedBetTypes.length < 10) {
      filtered = filtered.filter(bet => selectedBetTypes.includes(bet.betType));
    }

    if (selectedLeagues.length > 0) {
      filtered = filtered.filter(bet =>
        selectedLeagues.includes(bet.fixture?.league?.id)
      );
    }

    if (maxEdge < 100) {
      filtered = filtered.filter(bet => bet.edge * 100 <= maxEdge);
    }

    // Filter by odds range
    if (minOdds > 1) {
      filtered = filtered.filter(bet => bet.bookmakerOdds >= minOdds);
    }
    if (maxOdds < 8) {
      filtered = filtered.filter(bet => bet.bookmakerOdds <= maxOdds);
    }

    // Filter by bookmaker
    if (bookmakerFilter !== 'all') {
      filtered = filtered.filter(bet => {
        const bookmaker = bet.bookmaker?.toLowerCase() || '';
        switch (bookmakerFilter) {
          case 'playable':
            // Only show playable bookmakers
            return isPrimaryBookmaker(bet.bookmaker);
          case 'kambi':
            // Only Kambi network bookmakers
            return bookmaker.includes('kambi') || bookmaker.includes('unibet') ||
                   bookmaker.includes('leovegas') || bookmaker.includes('betsson') ||
                   bookmaker.includes('betsafe') || bookmaker.includes('nordicbet') ||
                   bookmaker.includes('expekt') || bookmaker.includes('rizk');
          case 'custom':
            // Filter by individually selected bookmakers
            return selectedBookmakers.some(selected =>
              bookmaker.includes(selected.toLowerCase())
            );
          default:
            return true;
        }
      });
    }

    // Filter by confidence grade
    if (gradeFilter !== 'all') {
      filtered = filtered.filter(bet => {
        const { grade } = getConfidenceGrade(bet);
        switch (gradeFilter) {
          case 'a':
            return grade === 'A';
          case 'ab':
            return grade === 'A' || grade === 'B';
          case 'abc':
            return grade === 'A' || grade === 'B' || grade === 'C';
          default:
            return true;
        }
      });
    }

    // Apply smart deduplication if enabled
    if (smartFilter) {
      return deduplicateBets(filtered);
    }

    return filtered;
  }, [valueBets, selectedLeagues, minEdge, maxEdge, minOdds, maxOdds, selectedBetTypes, bookmakerFilter, selectedBookmakers, gradeFilter, smartFilter]);

  // Sort bets
  const sortedBets = useMemo(() => {
    const sorted = [...filteredBets];

    sorted.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'grade':
          // Sort by confidence grade score (higher is better)
          const gradeA = calculateConfidenceScore(a);
          const gradeB = calculateConfidenceScore(b);
          comparison = gradeB - gradeA;
          // If same grade, sort by edge as secondary
          if (comparison === 0) comparison = b.edge - a.edge;
          break;
        case 'edge':
          comparison = b.edge - a.edge;
          break;
        case 'probability':
          comparison = b.probability - a.probability;
          break;
        case 'time':
          comparison = new Date(a.fixture?.startingAt) - new Date(b.fixture?.startingAt);
          break;
        case 'odds':
          comparison = b.bookmakerOdds - a.bookmakerOdds;
          break;
        default:
          comparison = b.edge - a.edge;
      }

      return sortOrder === 'asc' ? -comparison : comparison;
    });

    return sorted;
  }, [filteredBets, sortBy, sortOrder]);

  // Group bets by match
  const betsByMatch = useMemo(() => {
    const groups = {};
    sortedBets.forEach(bet => {
      const matchId = bet.fixture?.id;
      if (!groups[matchId]) {
        groups[matchId] = {
          fixture: bet.fixture,
          bets: [],
          bestEdge: 0,
          bestGradeBet: null,
          bestGradeScore: 0,
        };
      }
      groups[matchId].bets.push(bet);
      if (bet.edge > groups[matchId].bestEdge) {
        groups[matchId].bestEdge = bet.edge;
      }
      // Track best graded bet
      const gradeScore = calculateConfidenceScore(bet);
      if (gradeScore > groups[matchId].bestGradeScore) {
        groups[matchId].bestGradeScore = gradeScore;
        groups[matchId].bestGradeBet = bet;
      }
    });

    // Sort by best edge or time depending on sort setting
    return Object.values(groups).sort((a, b) => {
      if (sortBy === 'time') {
        return new Date(a.fixture?.startingAt) - new Date(b.fixture?.startingAt);
      }
      return b.bestEdge - a.bestEdge;
    });
  }, [sortedBets, sortBy]);

  const toggleLeague = (leagueId) => {
    setSelectedLeagues(prev =>
      prev.includes(leagueId)
        ? prev.filter(id => id !== leagueId)
        : [...prev, leagueId]
    );
  };

  const toggleBetType = (type) => {
    setSelectedBetTypes(prev => {
      if (prev.includes(type)) {
        if (prev.length === 1) return prev;
        return prev.filter(t => t !== type);
      }
      return [...prev, type];
    });
    setActivePreset(null);
  };

  const applyPreset = (preset) => {
    if (preset.config.betTypes) {
      setSelectedBetTypes(preset.config.betTypes);
    }
    if (preset.config.minEdge !== undefined) {
      setMinEdge(preset.config.minEdge);
    }
    if (preset.config.maxEdge !== undefined) {
      setMaxEdge(preset.config.maxEdge);
    } else {
      setMaxEdge(100);
    }
    // Handle grade filter
    if (preset.config.gradeFilter !== undefined) {
      setGradeFilter(preset.config.gradeFilter);
    }
    // Handle bookmaker filter
    if (preset.config.bookmakerFilter !== undefined) {
      setBookmakerFilter(preset.config.bookmakerFilter);
    }
    setActivePreset(preset.id);
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    // Sportmonks API returns UTC times - ensure proper parsing
    let date = new Date(dateStr);
    // If string doesn't have timezone info, treat it as UTC
    if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
      date = new Date(dateStr + 'Z');
    }
    return format(date, 'HH:mm');
  };

  // Calculate countdown to match kickoff
  const getCountdown = (dateStr) => {
    if (!dateStr) return null;
    // Sportmonks API returns UTC times - ensure proper parsing
    let kickoff = new Date(dateStr);
    if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
      kickoff = new Date(dateStr + 'Z');
    }
    const now = new Date();
    const diff = kickoff - now;
    
    if (diff <= 0) return { text: 'Started', isLive: true };
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) {
      return { text: `${days}d ${hours}h`, isLive: false };
    } else if (hours > 0) {
      return { text: `${hours}h ${minutes}m`, isLive: false };
    } else {
      return { text: `${minutes}m`, isLive: false, isSoon: minutes <= 30 };
    }
  };

  // Get live match info (minutes played, state, scores)
  const getLiveMatchInfo = (group) => {
    const countdown = getCountdown(group.fixture.startingAt);
    if (!countdown?.isLive) return null;

    // Check matchState from first bet (all bets in group share same fixture)
    const matchState = group.bets[0]?.matchState;
    const scores = group.bets[0]?.scores;

    // Calculate minutes played from kickoff time
    let kickoff = new Date(group.fixture.startingAt);
    if (!group.fixture.startingAt?.endsWith('Z')) {
      kickoff = new Date(group.fixture.startingAt + 'Z');
    }
    const now = new Date();
    const elapsedMs = now - kickoff;
    const minutesPlayed = Math.max(0, Math.floor(elapsedMs / (1000 * 60)));

    // Determine period and display time
    let period = '1st Half';
    let displayMinute = minutesPlayed;

    if (matchState?.shortName) {
      const state = matchState.shortName.toUpperCase();
      if (state === 'HT' || state === 'BREAK') {
        period = 'Half Time';
        displayMinute = 45;
      } else if (state === '2H' || state === 'LIVE' && minutesPlayed > 50) {
        period = '2nd Half';
        displayMinute = Math.min(90, minutesPlayed);
      } else if (state === 'FT' || state === 'AET' || state === 'PEN') {
        period = 'Full Time';
        displayMinute = 90;
      }
    } else {
      // Estimate period from elapsed time
      if (minutesPlayed > 45 && minutesPlayed <= 60) {
        period = 'Half Time';
        displayMinute = 45;
      } else if (minutesPlayed > 60) {
        period = '2nd Half';
        displayMinute = Math.min(90, minutesPlayed);
      }
    }

    // Parse scores if available
    let homeScore = null;
    let awayScore = null;
    if (scores && Array.isArray(scores)) {
      const currentScore = scores.find(s => s.description === 'CURRENT');
      if (currentScore) {
        homeScore = currentScore.score?.participant === 'home' ? currentScore.score?.goals : null;
        awayScore = currentScore.score?.participant === 'away' ? currentScore.score?.goals : null;
      }
    }

    return {
      isLive: true,
      period,
      minutesPlayed: displayMinute,
      homeScore,
      awayScore,
      stateName: matchState?.name || period,
    };
  };

  const getOddsFreshness = () => {
    if (!lastFetched) return 'Not fetched';
    return formatDistanceToNow(lastFetched, { addSuffix: true });
  };

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
  };

  return (
    <div className="space-y-6 relative">
      {/* Floating particles background */}
      <FloatingParticles />

      {/* Header with enhanced animation */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, type: 'spring' }}
        className="text-center mb-8 relative"
      >
        <motion.div
          className="inline-block"
          whileHover={{ scale: 1.02 }}
        >
          <h1 className="text-5xl font-bold mb-3 relative">
            <span className="text-gradient">Value Bets</span>
            <motion.span
              className="absolute -top-2 -right-8"
              animate={{ rotate: [0, 20, 0], scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Zap className="w-6 h-6 text-yellow-400" />
            </motion.span>
          </h1>
        </motion.div>
        <motion.p
          className="text-dark-400 text-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Matches ranked by edge - find the best betting opportunities
        </motion.p>
      </motion.div>

      {/* Date picker */}
      <DatePicker selectedDate={selectedDate} onDateChange={setSelectedDate} />

      {/* Stats bar with enhanced animations */}
      {meta && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-wrap gap-3 justify-center"
        >
          <motion.div
            className="glass-card px-5 py-3 rounded-xl flex items-center gap-3"
            whileHover={{ scale: 1.05, y: -2 }}
            transition={{ type: 'spring', stiffness: 400 }}
          >
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <Calendar className="w-5 h-5 text-primary-400" />
            </motion.div>
            <span className="text-white font-medium">{meta.totalFixtures} matches</span>
          </motion.div>

          <motion.div
            className="glass-card px-5 py-3 rounded-xl flex items-center gap-3 relative overflow-hidden"
            whileHover={{ scale: 1.05, y: -2 }}
            transition={{ type: 'spring', stiffness: 400 }}
          >
            <motion.div
              animate={{ y: [0, -3, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <TrendingUp className="w-5 h-5 text-green-400" />
            </motion.div>
            <span className="text-white font-medium">
              <motion.span
                key={filteredBets.length}
                initial={{ scale: 1.5, color: '#22c55e' }}
                animate={{ scale: 1, color: '#ffffff' }}
                transition={{ duration: 0.5 }}
              >
                {filteredBets.length}
              </motion.span>
              {' '}value bets found
            </span>
            {/* Shimmer effect */}
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-green-500/10 to-transparent"
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            />
          </motion.div>

          {/* Odds freshness indicator */}
          <motion.div
            className="glass-card px-5 py-3 rounded-xl flex items-center gap-3"
            whileHover={{ scale: 1.05, y: -2 }}
            transition={{ type: 'spring', stiffness: 400 }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
            >
              <Clock className={`w-5 h-5 ${lastFetched && (Date.now() - lastFetched) > 600000 ? 'text-yellow-400' : 'text-cyan-400'}`} />
            </motion.div>
            <span className="text-dark-300 text-sm">Odds: {getOddsFreshness()}</span>
          </motion.div>

          <motion.button
            onClick={() => fetchValueBets(true)}
            disabled={refreshing}
            className="glass-card px-5 py-3 rounded-xl flex items-center gap-3 hover:bg-dark-700/50 transition-all neon-button"
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.95 }}
          >
            <motion.div
              animate={refreshing ? { rotate: 360 } : {}}
              transition={{ duration: 1, repeat: refreshing ? Infinity : 0, ease: 'linear' }}
            >
              <RefreshCw className="w-5 h-5 text-primary-400" />
            </motion.div>
            <span className="text-white font-medium">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </motion.button>
        </motion.div>
      )}

      {/* Best bets summary */}
      {/* Best Bets Summary - only for pre-match bets */}
      {!loading && !error && filteredBets.length > 0 && (() => {
        const preMatchBetsForSummary = filteredBets.filter(bet => {
          const countdown = getCountdown(bet.startingAt);
          return !countdown?.isLive;
        });
        return preMatchBetsForSummary.length > 0 ? <BestBetsSummary bets={preMatchBetsForSummary} /> : null;
      })()}

      {/* Suggested Builders - only for pre-match bets */}
      {!loading && !error && filteredBets.length > 0 && (() => {
        // Filter out live matches from builders
        const preMatchBets = filteredBets.filter(bet => {
          const countdown = getCountdown(bet.startingAt);
          return !countdown?.isLive;
        });
        return preMatchBets.length > 0 ? <SuggestedBuilders allBets={preMatchBets} /> : null;
      })()}

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-dark-800 rounded-xl p-4"
      >
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-primary-400" />
            <span className="font-medium text-white">Filters</span>
            {hasActiveFilters && (
              <span className="px-2 py-0.5 bg-primary-500/20 text-primary-400 text-xs rounded-full">
                Active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  resetFilters();
                }}
                className="px-3 py-1 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                Reset All
              </button>
            )}
            {showFilters ? (
              <ChevronUp className="w-5 h-5 text-dark-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-dark-400" />
            )}
          </div>
        </button>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-4 space-y-4">
                {/* Quick Presets */}
                <div>
                  <label className="block text-sm text-dark-400 mb-2">Quick Presets</label>
                  <div className="flex flex-wrap gap-2">
                    {FILTER_PRESETS.map((preset) => {
                      const Icon = preset.icon;
                      return (
                        <button
                          key={preset.id}
                          onClick={() => applyPreset(preset)}
                          className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                            activePreset === preset.id
                              ? 'bg-primary-500 text-white'
                              : 'bg-dark-700 text-dark-400 hover:bg-dark-600'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {preset.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Confidence Grade Filter */}
                <div>
                  <label className="block text-sm text-dark-400 mb-2">
                    Confidence Grade
                    {gradeFilter !== 'all' && (
                      <span className="ml-2 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                        {gradeFilter === 'a' ? 'Grade A' : gradeFilter === 'ab' ? 'A + B' : 'A + B + C'}
                      </span>
                    )}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {GRADE_FILTERS.map((filter) => (
                      <button
                        key={filter.value}
                        onClick={() => {
                          setGradeFilter(filter.value);
                          setActivePreset(null);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                          gradeFilter === filter.value
                            ? filter.value === 'a'
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30 ring-1 ring-green-500/50'
                              : filter.value === 'ab'
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 ring-1 ring-blue-500/50'
                              : 'bg-primary-500/20 text-primary-400 border border-primary-500/30 ring-1 ring-primary-500/50'
                            : 'bg-dark-700 text-dark-400 hover:bg-dark-600 border border-transparent'
                        }`}
                        title={filter.description}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bookmaker Filter */}
                <div>
                  <label className="block text-sm text-dark-400 mb-2">
                    Bookmaker
                    {bookmakerFilter !== 'all' && bookmakerFilter !== 'playable' && (
                      <span className="ml-2 px-2 py-0.5 bg-cyan-500/20 text-cyan-400 text-xs rounded-full">
                        {bookmakerFilter === 'kambi' ? 'Kambi Network' : bookmakerFilter === 'custom' ? `${selectedBookmakers.length} selected` : bookmakerFilter}
                      </span>
                    )}
                  </label>

                  {/* Quick Presets */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {BOOKMAKER_FILTERS.map((filter) => (
                      <button
                        key={filter.value}
                        onClick={() => {
                          setBookmakerFilter(filter.value);
                          setActivePreset(null);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-all ${
                          bookmakerFilter === filter.value
                            ? filter.value === 'playable'
                              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 ring-1 ring-cyan-500/50'
                              : 'bg-primary-500/20 text-primary-400 border border-primary-500/30 ring-1 ring-primary-500/50'
                            : 'bg-dark-700 text-dark-400 hover:bg-dark-600 border border-transparent'
                        }`}
                        title={filter.description}
                      >
                        {filter.icon && <filter.icon className="w-4 h-4" />}
                        {filter.label}
                      </button>
                    ))}
                  </div>

                  {/* Individual Bookmaker Selection */}
                  <div className="space-y-2">
                    <div className="text-xs text-dark-500 mb-2">Select individual bookmakers:</div>
                    <div className="grid grid-cols-3 gap-2">
                      {INDIVIDUAL_BOOKMAKERS.map((book) => (
                        <button
                          key={book.id}
                          onClick={() => {
                            const newSelected = selectedBookmakers.includes(book.id)
                              ? selectedBookmakers.filter(id => id !== book.id)
                              : [...selectedBookmakers, book.id];
                            setSelectedBookmakers(newSelected);
                            setBookmakerFilter('custom');
                            setActivePreset(null);
                          }}
                          className={`px-2 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-all ${
                            selectedBookmakers.includes(book.id)
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                              : 'bg-dark-700 text-dark-500 hover:bg-dark-600 border border-transparent'
                          }`}
                        >
                          <span>{book.emoji}</span>
                          <span>{book.name}</span>
                          {book.network === 'Kambi' && (
                            <span className="text-[9px] text-dark-500 ml-auto">Kambi</span>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => {
                          setSelectedBookmakers(INDIVIDUAL_BOOKMAKERS.map(b => b.id));
                          setBookmakerFilter('custom');
                        }}
                        className="text-xs text-blue-400 hover:text-blue-300"
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => {
                          setSelectedBookmakers([]);
                          setBookmakerFilter('custom');
                        }}
                        className="text-xs text-dark-400 hover:text-dark-300"
                      >
                        Clear All
                      </button>
                    </div>
                  </div>

                  {bookmakerFilter === 'all' && (
                    <p className="text-xs text-orange-400 mt-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Includes benchmark odds that may not be available to bet on
                    </p>
                  )}

                  {/* Bookmakers Info Panel Toggle */}
                  <button
                    onClick={() => setShowBookmakersInfo(!showBookmakersInfo)}
                    className="mt-3 w-full text-left text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                  >
                    <Info className="w-3 h-3" />
                    {showBookmakersInfo ? 'Hide' : 'View'} all {ALL_BOOKMAKERS.length} bookmakers we compare
                    <ChevronDown className={`w-3 h-3 transition-transform ${showBookmakersInfo ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Expandable Bookmakers Info */}
                  <AnimatePresence>
                    {showBookmakersInfo && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-3 overflow-hidden"
                      >
                        <div className="bg-dark-800/50 rounded-lg border border-dark-700 p-4 space-y-4">
                          <div className="text-sm text-white font-medium mb-3">
                            Odds Data Sources ({ALL_BOOKMAKERS.length} bookmakers)
                          </div>

                          {/* Sharp Books */}
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                              <span className="text-xs font-medium text-yellow-400">Sharp Books ({SHARP_BOOKMAKERS.length})</span>
                              <span className="text-[10px] text-dark-500">- Used for true probability calculation</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              {SHARP_BOOKMAKERS.map((book) => (
                                <div key={book.id} className="flex items-center justify-between bg-yellow-500/5 border border-yellow-500/10 rounded px-2 py-1">
                                  <span className="text-xs text-yellow-300">{book.name}</span>
                                  <span className="text-[10px] text-dark-500">{book.description.split(' - ')[0]}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Playable Books */}
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-2 h-2 rounded-full bg-green-400"></div>
                              <span className="text-xs font-medium text-green-400">Playable Books ({PLAYABLE_BOOKMAKERS.length})</span>
                              <span className="text-[10px] text-dark-500">- Available for betting</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              {PLAYABLE_BOOKMAKERS.map((book) => (
                                <div key={book.id} className="flex items-center justify-between bg-green-500/5 border border-green-500/10 rounded px-2 py-1.5">
                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs text-green-300">{book.name}</span>
                                      {book.network && (
                                        <span className="text-[9px] px-1 py-0.5 bg-green-500/20 text-green-400 rounded">{book.network}</span>
                                      )}
                                    </div>
                                    {book.aliases && book.aliases.length > 0 && (
                                      <div className="flex items-center gap-1 mt-0.5">
                                        <span className="text-[9px] text-dark-500">= </span>
                                        {book.aliases.map((alias, idx) => (
                                          <span key={alias} className="text-[9px] text-cyan-400/80">
                                            {alias}{idx < book.aliases.length - 1 ? ', ' : ''}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <CheckCircle className="w-3 h-3 text-green-500" />
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Unavailable Books (Requested but not in API) */}
                          {UNAVAILABLE_BOOKMAKERS.length > 0 && (
                            <div>
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-2 h-2 rounded-full bg-red-400"></div>
                                <span className="text-xs font-medium text-red-400">Requested but Unavailable ({UNAVAILABLE_BOOKMAKERS.length})</span>
                                <span className="text-[10px] text-dark-500">- Not in OpticOdds API</span>
                              </div>
                              <div className="grid grid-cols-2 gap-1.5">
                                {UNAVAILABLE_BOOKMAKERS.map((book) => (
                                  <div key={book.id} className="flex items-center justify-between bg-red-500/5 border border-red-500/10 rounded px-2 py-1">
                                    <span className="text-xs text-red-300/70">{book.name}</span>
                                    <span className="text-[10px] text-dark-500 truncate max-w-[100px]" title={book.description}>{book.description}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Benchmark Only Books */}
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-2 h-2 rounded-full bg-dark-400"></div>
                              <span className="text-xs font-medium text-dark-400">Benchmark Books ({BENCHMARK_ONLY_BOOKMAKERS.length})</span>
                              <span className="text-[10px] text-dark-500">- For odds comparison only</span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              {BENCHMARK_ONLY_BOOKMAKERS.map((book) => (
                                <div key={book.id} className="flex items-center justify-between bg-dark-700/50 border border-dark-600 rounded px-2 py-1">
                                  <span className="text-xs text-dark-400">{book.name}</span>
                                  <span className="text-[10px] text-dark-500">Benchmark</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Info footer */}
                          <div className="pt-3 border-t border-dark-700 text-[10px] text-dark-500 space-y-1">
                            <p>• <span className="text-yellow-400">Sharp books</span> provide the most accurate odds for calculating true probability</p>
                            <p>• <span className="text-green-400">Playable books</span> are where you can actually place bets</p>
                            <p>• <span className="text-cyan-400">= Name</span> means identical odds (same provider) - e.g., Betsson = Nordicbet, LeoVegas = Expekt</p>
                            <p>• <span className="text-red-400">Unavailable</span> = requested but not available in OpticOdds API</p>
                            <p>• <span className="text-dark-400">Benchmark books</span> help identify value by comparing market prices</p>
                            <p>• <span className="text-blue-400">Kambi network</span> books share the same odds (Unibet, Betsson, Betsafe, Rizk)</p>
                            <p>• Data sourced from OpticOdds API • Updated every 60 seconds</p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {/* Smart Filter Toggle */}
                <div>
                  <label className="block text-sm text-dark-400 mb-2">
                    Smart Filter
                    {smartFilter && (
                      <span className="ml-2 px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">
                        Active
                      </span>
                    )}
                  </label>
                  <button
                    onClick={() => setSmartFilter(!smartFilter)}
                    className={`w-full px-4 py-3 rounded-lg text-sm flex items-center justify-between transition-all ${
                      smartFilter
                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                        : 'bg-dark-700 text-dark-400 hover:bg-dark-600 border border-dark-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-5 h-5" />
                      <div className="text-left">
                        <div className="font-medium">Show Best Bet Only</div>
                        <div className="text-xs text-dark-500">
                          {smartFilter
                            ? 'Showing one optimal bet per market (balances probability vs EV)'
                            : 'Showing all available lines (e.g., Over 8.5, Over 9.5, Over 12.5)'
                          }
                        </div>
                      </div>
                    </div>
                    <div className={`w-12 h-6 rounded-full transition-all relative ${
                      smartFilter ? 'bg-green-500' : 'bg-dark-600'
                    }`}>
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${
                        smartFilter ? 'left-7' : 'left-1'
                      }`} />
                    </div>
                  </button>
                </div>


                {/* Edge Range */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-dark-400 mb-2">
                      Minimum Edge: {minEdge}%
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="20"
                      step="1"
                      value={minEdge}
                      onChange={(e) => {
                        setMinEdge(parseInt(e.target.value));
                        setActivePreset(null);
                      }}
                      className="w-full h-2 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
                    />
                    <div className="flex justify-between text-xs text-dark-500 mt-1">
                      <span>0%</span>
                      <span>10%</span>
                      <span>20%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-dark-400 mb-2">
                      Maximum Edge: {maxEdge === 100 ? 'No limit' : `${maxEdge}%`}
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      step="5"
                      value={maxEdge}
                      onChange={(e) => {
                        setMaxEdge(parseInt(e.target.value));
                        setActivePreset(null);
                      }}
                      className="w-full h-2 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-primary-500"
                    />
                    <div className="flex justify-between text-xs text-dark-500 mt-1">
                      <span>10%</span>
                      <span>50%</span>
                      <span>No limit</span>
                    </div>
                  </div>
                </div>

                {/* Odds Range Filter */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-dark-400 mb-2">
                      Minimum Odds: @{minOdds.toFixed(2)}
                      <span className="text-dark-500 ml-2">
                        (≥ {(100 / minOdds).toFixed(0)}% implied)
                      </span>
                    </label>
                    <input
                      type="range"
                      min="1"
                      max="2"
                      step="0.1"
                      value={minOdds}
                      onChange={(e) => {
                        setMinOdds(parseFloat(e.target.value));
                        setActivePreset(null);
                      }}
                      className="w-full h-2 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                    <div className="flex justify-between text-xs text-dark-500 mt-1">
                      <span>@1.00</span>
                      <span>@1.50</span>
                      <span>@2.00</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-dark-400 mb-2">
                      Maximum Odds: {maxOdds >= 8 ? 'No limit' : `@${maxOdds.toFixed(1)}`}
                      <span className="text-dark-500 ml-2">
                        ({maxOdds >= 8 ? 'All odds' : `≤ ${(100 / maxOdds).toFixed(0)}% implied`})
                      </span>
                    </label>
                    <input
                      type="range"
                      min="1.5"
                      max="8"
                      step="0.5"
                      value={maxOdds}
                      onChange={(e) => {
                        setMaxOdds(parseFloat(e.target.value));
                        setActivePreset(null);
                      }}
                      className="w-full h-2 bg-dark-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <div className="flex justify-between text-xs text-dark-500 mt-1">
                      <span>@1.5</span>
                      <span>@3.0</span>
                      <span>@5.0</span>
                      <span>No limit</span>
                    </div>
                  </div>
                </div>

                {/* Sort Options */}
                <div>
                  <label className="block text-sm text-dark-400 mb-2">Sort By</label>
                  <div className="flex flex-wrap gap-2">
                    {SORT_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      return (
                        <button
                          key={option.value}
                          onClick={() => {
                            if (sortBy === option.value) {
                              toggleSortOrder();
                            } else {
                              setSortBy(option.value);
                              setSortOrder('desc');
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                            sortBy === option.value
                              ? 'bg-primary-500 text-white'
                              : 'bg-dark-700 text-dark-400 hover:bg-dark-600'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {option.label}
                          {sortBy === option.value && (
                            sortOrder === 'desc' ?
                            <SortDesc className="w-3 h-3" /> :
                            <SortAsc className="w-3 h-3" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Bet Types */}
                <div>
                  <label className="block text-sm text-dark-400 mb-2">Bet Types</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => toggleBetType('goals')}
                      className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                        selectedBetTypes.includes('goals')
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : 'bg-dark-700 text-dark-400 hover:bg-dark-600 border border-transparent'
                      }`}
                    >
                      <Circle className="w-4 h-4" />
                      Goals O/U
                    </button>
                    <button
                      onClick={() => toggleBetType('btts')}
                      className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                        selectedBetTypes.includes('btts')
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                          : 'bg-dark-700 text-dark-400 hover:bg-dark-600 border border-transparent'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                      BTTS
                    </button>
                    <button
                      onClick={() => toggleBetType('corners')}
                      className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                        selectedBetTypes.includes('corners')
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'bg-dark-700 text-dark-400 hover:bg-dark-600 border border-transparent'
                      }`}
                    >
                      <CornerDownRight className="w-4 h-4" />
                      Corners
                    </button>
                    <button
                      onClick={() => toggleBetType('cards')}
                      className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                        selectedBetTypes.includes('cards')
                          ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                          : 'bg-dark-700 text-dark-400 hover:bg-dark-600 border border-transparent'
                      }`}
                    >
                      <Square className="w-4 h-4" />
                      Cards
                    </button>
                    <button
                      onClick={() => toggleBetType('player_shots')} className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${selectedBetTypes.includes('player_shots') ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-dark-700 text-dark-400 hover:bg-dark-600 border border-transparent'}`}
                    >
                      <Crosshair className="w-4 h-4" />
                      Player Shots
                    </button>
                    <button
                      onClick={() => toggleBetType('player_sot')} className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${selectedBetTypes.includes('player_sot') ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30' : 'bg-dark-700 text-dark-400 hover:bg-dark-600 border border-transparent'}`}
                    >
                      <Target className="w-4 h-4" />
                      Player SoT
                    </button>
                    <button
                      onClick={() => toggleBetType('goalscorer')} className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${selectedBetTypes.includes('goalscorer') ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30' : 'bg-dark-700 text-dark-400 hover:bg-dark-600 border border-transparent'}`}
                    >
                      <User className="w-4 h-4" />
                      Goalscorer
                    </button>
                    <button
                      onClick={() => toggleBetType('team_shots')} className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${selectedBetTypes.includes('team_shots') ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-dark-700 text-dark-400 hover:bg-dark-600 border border-transparent'}`}
                    >
                      <Crosshair className="w-4 h-4" />
                      Team Shots
                    </button>
                    <button
                      onClick={() => toggleBetType('offsides')} className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${selectedBetTypes.includes('offsides') ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-dark-700 text-dark-400 hover:bg-dark-600 border border-transparent'}`}
                    >
                      <AlertTriangle className="w-4 h-4" />
                      Offsides
                    </button>
                    <button
                      onClick={() => toggleBetType('throw_ins')} className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${selectedBetTypes.includes('throw_ins') ? 'bg-lime-500/20 text-lime-400 border border-lime-500/30' : 'bg-dark-700 text-dark-400 hover:bg-dark-600 border border-transparent'}`}
                    >
                      <ArrowRight className="w-4 h-4" />
                      Throw-Ins
                    </button>
                  </div>
                </div>

                {/* Leagues */}
                {meta?.leagues?.length > 0 && (
                  <div>
                    <label className="block text-sm text-dark-400 mb-2">
                      Leagues {selectedLeagues.length > 0 && `(${selectedLeagues.length} selected)`}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {meta.leagues.map((league) => (
                        <button
                          key={league.id}
                          onClick={() => toggleLeague(league.id)}
                          className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                            selectedLeagues.includes(league.id)
                              ? 'bg-primary-500 text-white'
                              : selectedLeagues.length === 0
                              ? 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                              : 'bg-dark-700 text-dark-500 hover:bg-dark-600'
                          }`}
                        >
                          {league.image && (
                            <img src={league.image} alt="" className="w-4 h-4 object-contain" />
                          )}
                          {league.name}
                        </button>
                      ))}
                    </div>
                    {selectedLeagues.length > 0 && (
                      <button
                        onClick={() => setSelectedLeagues([])}
                        className="text-xs text-primary-400 mt-2 hover:underline flex items-center gap-1"
                      >
                        <X className="w-3 h-3" />
                        Clear league filter
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Loading state with skeleton cards */}
      {loading && (
        <div className="space-y-4">
          <div className="flex justify-center py-4">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <RefreshCw className="w-8 h-8 text-primary-400" />
            </motion.div>
          </div>
          {[1, 2, 3].map((i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <SkeletonCard />
            </motion.div>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <p className="text-accent-red mb-4">{error}</p>
          <button onClick={() => fetchValueBets()} className="btn-primary">
            Retry
          </button>
        </motion.div>
      )}

      {/* Value bets list */}
      {!loading && !error && (
        <div className="space-y-4">
          {betsByMatch.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12 bg-dark-800 rounded-xl px-6"
            >
              <TrendingUp className="w-14 h-14 text-dark-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">No value bets found</h3>
              <p className="text-dark-400 mb-6 max-w-md mx-auto">
                {bookmakerFilter === 'playable'
                  ? "No playable bookmaker odds available. Try including all bookmakers to see more opportunities."
                  : minEdge > 0
                    ? "No bets match your current filters. Try adjusting your criteria."
                    : "Corner and card prop odds are limited. Check individual match pages for detailed analysis."}
              </p>

              {/* Quick action buttons */}
              <div className="flex flex-wrap gap-3 justify-center">
                {bookmakerFilter === 'playable' && (
                  <button
                    onClick={() => setBookmakerFilter('all')}
                    className="px-4 py-2 bg-primary-500/20 text-primary-400 rounded-lg hover:bg-primary-500/30 transition-colors text-sm font-medium"
                  >
                    Include All Bookmakers
                  </button>
                )}
                {minEdge > 0 && (
                  <button
                    onClick={() => setMinEdge(0)}
                    className="px-4 py-2 bg-dark-700 text-dark-300 rounded-lg hover:bg-dark-600 transition-colors text-sm font-medium"
                  >
                    Show All Bets (0% Edge)
                  </button>
                )}
                {hasActiveFilters && (
                  <button
                    onClick={resetFilters}
                    className="px-4 py-2 bg-dark-700 text-dark-300 rounded-lg hover:bg-dark-600 transition-colors text-sm font-medium"
                  >
                    Reset All Filters
                  </button>
                )}
              </div>

              {/* Helpful tip */}
              <p className="text-dark-500 text-xs mt-6 max-w-sm mx-auto">
                Tip: Value bets are opportunities where our calculated probability exceeds the bookmaker's implied odds.
              </p>
            </motion.div>
          ) : (
            betsByMatch.map((group, index) => (
              <motion.div
                key={group.fixture.id}
                id={`match-${group.fixture.id}`}
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{
                  delay: index * 0.05,
                  type: 'spring',
                  stiffness: 100,
                  damping: 15
                }}
                whileHover={{ y: -4 }}
                className="glass-card rounded-xl overflow-hidden hover-lift relative group scroll-mt-24"
              >
                {/* Gradient border on hover */}
                <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-primary-500/20 via-purple-500/20 to-cyan-500/20 blur-sm" />
                </div>

                {/* Match header - clickable to navigate */}
                <Link to={`/match/${group.fixture.id}`}>
                  <div className="p-4 border-b border-dark-700/50 hover:bg-dark-800/50 transition-all duration-300 relative">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {group.fixture.league?.image && (
                          <motion.img
                            src={group.fixture.league.image}
                            alt=""
                            className="w-7 h-7 object-contain drop-shadow-lg"
                            whileHover={{ scale: 1.2, rotate: 10 }}
                          />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-dark-400 text-sm font-medium">
                              {group.fixture.league?.name}
                            </span>
                            <span className="text-dark-600">•</span>
                            <motion.span
                              className="text-dark-400 text-sm flex items-center gap-1 bg-dark-800/50 px-2 py-0.5 rounded-full"
                              whileHover={{ scale: 1.05 }}
                            >
                              <Clock className="w-3 h-3" />
                              {formatTime(group.fixture.startingAt)}
                            </motion.span>
                            {(() => {
                              const countdown = getCountdown(group.fixture.startingAt);
                              if (!countdown) return null;
                              return (
                                <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${
                                  countdown.isLive 
                                    ? 'bg-red-500/20 text-red-400 animate-pulse' 
                                    : countdown.isSoon 
                                      ? 'bg-orange-500/20 text-orange-400'
                                      : 'bg-dark-700 text-dark-400'
                                }`}>
                                  {countdown.isLive ? (
                                    <>
                                      <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                                      Live
                                    </>
                                  ) : (
                                    <>
                                      <span className="text-dark-500">in</span>
                                      {countdown.text}
                                    </>
                                  )}
                                </span>
                              );
                            })()}
                          </div>
                          <div className="text-white font-semibold mt-1 text-lg">
                            {group.fixture.homeTeam?.name}
                            <span className="text-dark-500 mx-2">vs</span>
                            {group.fixture.awayTeam?.name}
                          </div>
                        </div>
                      </div>

                      {/* Best edge badge OR live status */}
                      {(() => {
                        const liveInfo = getLiveMatchInfo(group);
                        if (liveInfo) {
                          // Live match - show status badge
                          return (
                            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-center min-w-[140px]">
                              <div className="flex items-center justify-center gap-2">
                                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                                <span className="text-red-400 font-bold text-lg">{liveInfo.minutesPlayed}'</span>
                              </div>
                              <div className="text-xs text-red-400/80 mt-1">
                                {liveInfo.period}
                              </div>
                            </div>
                          );
                        }
                        // Upcoming match - show edge badge
                        return (
                          <GlowingEdgeBadge edge={group.bestEdge}>
                            <div className="flex items-center gap-2 relative z-10">
                              {group.bestGradeBet && <ConfidenceGradeBadge bet={group.bestGradeBet} size="sm" />}
                              <Percent className={`w-4 h-4 ${getEdgeColor(group.bestEdge)}`} />
                              <span className={`font-bold text-lg ${getEdgeColor(group.bestEdge)}`}>
                                <AnimatedCounter value={(group.bestEdge * 100).toFixed(1)} className={getEdgeColor(group.bestEdge)} />
                              </span>
                            </div>
                            <div className="text-xs text-dark-400 mt-1">
                              {group.bets.length} bet{group.bets.length !== 1 ? 's' : ''} • best edge
                            </div>
                          </GlowingEdgeBadge>
                        );
                      })()}
                    </div>
                  </div>
                </Link>

                {/* Grouped bets by market type OR live match message */}
                {(() => {
                  const liveInfo = getLiveMatchInfo(group);
                  if (liveInfo) {
                    return (
                      <div className="p-4 bg-red-500/5 border-t border-red-500/20">
                        <div className="flex items-center justify-center gap-3 text-dark-400">
                          <Clock className="w-4 h-4 text-red-400" />
                          <span className="text-sm">
                            Live match in progress • Pre-match odds no longer valid
                          </span>
                        </div>
                        <p className="text-center text-xs text-dark-500 mt-2">
                          Visit the match page for live updates
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div className="p-4">
                      <GroupedBets bets={group.bets} />
                    </div>
                  );
                })()}
              </motion.div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
