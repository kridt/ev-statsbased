import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Calculator,
  Trash2,
  AlertTriangle,
  TrendingUp,
  Target,
  Percent,
  DollarSign,
  Layers,
  Settings,
  Info,
} from 'lucide-react';

// Calculate combined EV using multiplicative formula
const calculateCombinedStats = (bets) => {
  if (bets.length === 0) {
    return { combinedOdds: 0, combinedProbability: 0, combinedEV: 0, fairOdds: 0 };
  }

  // Combined odds = product of individual odds
  const combinedOdds = bets.reduce((acc, bet) => acc * bet.bookmakerOdds, 1);

  // Combined probability = product of individual probabilities (assuming independence)
  const combinedProbability = bets.reduce((acc, bet) => acc * bet.probability, 1);

  // Fair odds for combined bet
  const fairOdds = combinedProbability > 0 ? 1 / combinedProbability : 0;

  // Combined EV using multiplicative formula: (1 + EV1) * (1 + EV2) * ... - 1
  const combinedEV = bets.reduce((acc, bet) => acc * (1 + bet.edge), 1) - 1;

  return {
    combinedOdds,
    combinedProbability,
    combinedEV,
    fairOdds,
  };
};

// Check if two bets are correlated (same match or related markets)
const checkCorrelation = (bet1, bet2) => {
  // Same match
  if (bet1.fixture?.id === bet2.fixture?.id) {
    // Check for correlated markets
    const correlatedPairs = [
      ['goals', 'btts'],
      ['goals', 'goalscorer'],
      ['btts', 'goalscorer'],
      ['team_shots', 'player_shots'],
      ['team_shots', 'player_sot'],
      ['player_shots', 'player_sot'],
    ];

    for (const [type1, type2] of correlatedPairs) {
      if (
        (bet1.betType === type1 && bet2.betType === type2) ||
        (bet1.betType === type2 && bet2.betType === type1)
      ) {
        return { correlated: true, reason: `${type1} and ${type2} from same match are correlated` };
      }
    }

    // Same bet type in same match
    if (bet1.betType === bet2.betType) {
      return { correlated: true, reason: `Multiple ${bet1.betType} bets from same match` };
    }
  }

  return { correlated: false };
};

// Get all correlations in a list of bets
const getAllCorrelations = (bets) => {
  const correlations = [];
  for (let i = 0; i < bets.length; i++) {
    for (let j = i + 1; j < bets.length; j++) {
      const result = checkCorrelation(bets[i], bets[j]);
      if (result.correlated) {
        correlations.push({
          bet1: bets[i],
          bet2: bets[j],
          reason: result.reason,
        });
      }
    }
  }
  return correlations;
};

const BetBuilder = ({
  selectedBets = [],
  onAddBet,
  onRemoveBet,
  onClearAll,
  builderOddsRange = { min: 1.2, max: 5.0 },
  onOddsRangeChange,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [stakeAmount, setStakeAmount] = useState(10);

  // Load visibility state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('betBuilderVisible');
    if (saved !== null) {
      setIsVisible(JSON.parse(saved));
    }
  }, []);

  // Save visibility state to localStorage
  useEffect(() => {
    localStorage.setItem('betBuilderVisible', JSON.stringify(isVisible));
  }, [isVisible]);

  // Calculate combined stats
  const stats = useMemo(() => calculateCombinedStats(selectedBets), [selectedBets]);

  // Check for correlations
  const correlations = useMemo(() => getAllCorrelations(selectedBets), [selectedBets]);
  const hasCorrelations = correlations.length > 0;

  // Calculate potential returns
  const potentialReturn = stakeAmount * stats.combinedOdds;
  const expectedReturn = stakeAmount * (1 + stats.combinedEV);
  const expectedProfit = expectedReturn - stakeAmount;

  // Format bet name
  const formatBetName = (bet) => {
    if (bet.player) {
      return `${bet.player}: ${bet.market}`;
    }
    return bet.market;
  };

  // Format match name
  const formatMatchName = (bet) => {
    const home = bet.fixture?.homeTeam?.name || 'Home';
    const away = bet.fixture?.awayTeam?.name || 'Away';
    return `${home} vs ${away}`;
  };

  if (!isVisible) {
    return (
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-primary-500 to-cyan-500 text-white p-4 rounded-full shadow-lg hover:shadow-xl transition-shadow"
        onClick={() => setIsVisible(true)}
        title="Show Bet Builder"
      >
        <Layers className="w-6 h-6" />
        {selectedBets.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
            {selectedBets.length}
          </span>
        )}
      </motion.button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 100 }}
      className="fixed bottom-6 right-6 z-50 w-96 max-h-[80vh] overflow-hidden"
    >
      <div className="bg-dark-800/95 backdrop-blur-xl rounded-2xl border border-dark-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary-500/20 to-cyan-500/20 border-b border-dark-700">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-500/20 rounded-lg">
                <Layers className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <h3 className="font-bold text-white">Bet Builder</h3>
                <p className="text-xs text-dark-400">
                  {selectedBets.length} selection{selectedBets.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 rounded-lg transition-colors ${
                  showSettings ? 'bg-primary-500/20 text-primary-400' : 'hover:bg-dark-700 text-dark-400'
                }`}
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-2 hover:bg-dark-700 rounded-lg text-dark-400 transition-colors"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setIsVisible(false)}
                className="p-2 hover:bg-dark-700 rounded-lg text-dark-400 transition-colors"
                title="Hide Bet Builder"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Settings Panel */}
          <AnimatePresence>
            {showSettings && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 space-y-3">
                  <div className="text-xs text-dark-400 mb-2">Odds Range Filter</div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-dark-500 block mb-1">Min Odds</label>
                      <input
                        type="number"
                        min="1.01"
                        max={builderOddsRange.max}
                        step="0.1"
                        value={builderOddsRange.min}
                        onChange={(e) => onOddsRangeChange?.({ ...builderOddsRange, min: parseFloat(e.target.value) || 1.2 })}
                        className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-primary-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-dark-500 block mb-1">Max Odds</label>
                      <input
                        type="number"
                        min={builderOddsRange.min}
                        max="20"
                        step="0.1"
                        value={builderOddsRange.max}
                        onChange={(e) => onOddsRangeChange?.({ ...builderOddsRange, max: parseFloat(e.target.value) || 5.0 })}
                        className="w-full bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-primary-500 focus:outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="range"
                      min="1.01"
                      max="10"
                      step="0.1"
                      value={builderOddsRange.min}
                      onChange={(e) => onOddsRangeChange?.({ ...builderOddsRange, min: parseFloat(e.target.value) })}
                      className="flex-1 accent-primary-500"
                    />
                    <span className="text-xs text-dark-400 w-10">@{builderOddsRange.min.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="1.5"
                      max="20"
                      step="0.1"
                      value={builderOddsRange.max}
                      onChange={(e) => onOddsRangeChange?.({ ...builderOddsRange, max: parseFloat(e.target.value) })}
                      className="flex-1 accent-cyan-500"
                    />
                    <span className="text-xs text-dark-400 w-10">@{builderOddsRange.max.toFixed(2)}</span>
                  </div>
                  <p className="text-[10px] text-dark-500">
                    Only bets with odds between @{builderOddsRange.min.toFixed(2)} and @{builderOddsRange.max.toFixed(2)} can be added
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <div className="max-h-[50vh] overflow-y-auto">
                {/* Selected Bets */}
                {selectedBets.length === 0 ? (
                  <div className="p-6 text-center">
                    <div className="w-12 h-12 bg-dark-700 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Plus className="w-6 h-6 text-dark-400" />
                    </div>
                    <p className="text-dark-400 text-sm">No selections yet</p>
                    <p className="text-dark-500 text-xs mt-1">
                      Click the <span className="text-primary-400">+ Add</span> button on any bet to add it
                    </p>
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    {selectedBets.map((bet, index) => (
                      <motion.div
                        key={`${bet.fixture?.id}-${bet.betType}-${bet.market}-${index}`}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="bg-dark-900/50 rounded-lg p-3 border border-dark-700"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-dark-500 bg-dark-700 px-1.5 py-0.5 rounded">
                                #{index + 1}
                              </span>
                              <span className="text-white font-medium text-sm truncate">
                                {formatBetName(bet)}
                              </span>
                            </div>
                            <p className="text-xs text-dark-400 truncate mt-1">
                              {formatMatchName(bet)}
                            </p>
                            <div className="flex items-center gap-3 mt-2 text-xs">
                              <span className="text-cyan-400">@{bet.bookmakerOdds?.toFixed(2)}</span>
                              <span className="text-green-400">+{(bet.edge * 100).toFixed(1)}% EV</span>
                              <span className="text-dark-400">{(bet.probability * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                          <button
                            onClick={() => onRemoveBet(index)}
                            className="p-1.5 hover:bg-red-500/20 rounded-lg text-dark-400 hover:text-red-400 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    ))}

                    {/* Clear All Button */}
                    {selectedBets.length > 1 && (
                      <button
                        onClick={onClearAll}
                        className="w-full py-2 text-xs text-dark-400 hover:text-red-400 flex items-center justify-center gap-1 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                        Clear all selections
                      </button>
                    )}
                  </div>
                )}

                {/* Correlation Warning */}
                {hasCorrelations && (
                  <div className="mx-3 mb-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-orange-400 font-medium">Correlated Bets Detected</p>
                        <p className="text-xs text-orange-300/70 mt-1">
                          Some selections may be correlated, which affects actual EV:
                        </p>
                        <ul className="text-xs text-orange-300/60 mt-1 space-y-0.5">
                          {correlations.slice(0, 2).map((c, i) => (
                            <li key={i}>• {c.reason}</li>
                          ))}
                          {correlations.length > 2 && (
                            <li>• +{correlations.length - 2} more</li>
                          )}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Combined Stats */}
                {selectedBets.length > 0 && (
                  <div className="p-4 bg-gradient-to-br from-dark-900 to-dark-800 border-t border-dark-700">
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-dark-800/50 rounded-lg p-3 border border-dark-700">
                        <div className="flex items-center gap-2 text-dark-400 text-xs mb-1">
                          <Target className="w-3 h-3" />
                          Combined Odds
                        </div>
                        <div className="text-xl font-bold text-white">
                          @{stats.combinedOdds.toFixed(2)}
                        </div>
                      </div>
                      <div className="bg-dark-800/50 rounded-lg p-3 border border-dark-700">
                        <div className="flex items-center gap-2 text-dark-400 text-xs mb-1">
                          <TrendingUp className="w-3 h-3" />
                          Combined EV
                        </div>
                        <div className={`text-xl font-bold ${stats.combinedEV > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {stats.combinedEV > 0 ? '+' : ''}{(stats.combinedEV * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="bg-dark-800/50 rounded-lg p-3 border border-dark-700">
                        <div className="flex items-center gap-2 text-dark-400 text-xs mb-1">
                          <Percent className="w-3 h-3" />
                          Probability
                        </div>
                        <div className="text-xl font-bold text-cyan-400">
                          {(stats.combinedProbability * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="bg-dark-800/50 rounded-lg p-3 border border-dark-700">
                        <div className="flex items-center gap-2 text-dark-400 text-xs mb-1">
                          <Calculator className="w-3 h-3" />
                          Fair Odds
                        </div>
                        <div className="text-xl font-bold text-purple-400">
                          @{stats.fairOdds.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Stake Calculator */}
                    <div className="bg-dark-800/50 rounded-lg p-3 border border-dark-700 mb-3">
                      <div className="flex items-center gap-2 text-dark-400 text-xs mb-2">
                        <DollarSign className="w-3 h-3" />
                        Stake Calculator
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        <input
                          type="number"
                          min="1"
                          value={stakeAmount}
                          onChange={(e) => setStakeAmount(Math.max(1, parseFloat(e.target.value) || 1))}
                          className="w-24 bg-dark-900 border border-dark-600 rounded-lg px-3 py-2 text-white text-sm focus:border-primary-500 focus:outline-none"
                        />
                        <span className="text-dark-400 text-sm">EUR</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-dark-400">Potential Return:</span>
                          <span className="text-white font-medium ml-2">€{potentialReturn.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-dark-400">Expected Profit:</span>
                          <span className={`font-medium ml-2 ${expectedProfit > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            €{expectedProfit.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Formula Explanation */}
                    <div className="text-[10px] text-dark-500 bg-dark-900/30 rounded-lg p-2">
                      <div className="flex items-center gap-1 mb-1">
                        <Info className="w-3 h-3" />
                        <span className="font-medium">EV Formula:</span>
                      </div>
                      <code className="text-primary-400">
                        Combined EV = {selectedBets.map((_, i) => `(1 + EV${i + 1})`).join(' × ')} - 1
                      </code>
                      <div className="mt-1 text-dark-400">
                        = {selectedBets.map(b => `(1 + ${(b.edge * 100).toFixed(1)}%)`).join(' × ')} - 1 = <span className="text-green-400">+{(stats.combinedEV * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default BetBuilder;
