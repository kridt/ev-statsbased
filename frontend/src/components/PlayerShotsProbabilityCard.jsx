import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, ChevronDown, ChevronUp, User, Info, Zap, TrendingUp } from 'lucide-react';
import { probabilityApi } from '../services/api';

// Format probability as percentage
const formatProb = (prob) => `${(prob * 100).toFixed(1)}%`;

// Format odds
const formatOdds = (odds) => odds?.toFixed(2) || '-';

// Determine color based on probability
const getProbabilityColor = (prob) => {
  if (prob >= 0.65) return 'text-accent-green';
  if (prob >= 0.5) return 'text-green-400';
  if (prob >= 0.4) return 'text-dark-300';
  if (prob >= 0.3) return 'text-orange-400';
  return 'text-accent-red';
};

// Get background color for probability bar
const getProbabilityBgColor = (prob) => {
  if (prob >= 0.65) return 'bg-accent-green';
  if (prob >= 0.5) return 'bg-green-400';
  if (prob >= 0.4) return 'bg-dark-400';
  if (prob >= 0.3) return 'bg-orange-400';
  return 'bg-accent-red';
};

// Info box component
function InfoBox({ title, children, variant = 'info' }) {
  const variants = {
    info: 'bg-primary-500/10 border-primary-500/30 text-primary-300',
    tip: 'bg-accent-green/10 border-accent-green/30 text-accent-green',
    warning: 'bg-orange-500/10 border-orange-500/30 text-orange-300',
  };

  return (
    <div className={`p-3 rounded-lg border ${variants[variant]}`}>
      <div className="flex items-start gap-2">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          {title && <div className="font-medium text-sm mb-1">{title}</div>}
          <div className="text-xs opacity-90">{children}</div>
        </div>
      </div>
    </div>
  );
}

// Market card for a single line
function MarketCard({ line, probability, fairOdds, label }) {
  return (
    <div className="p-3 bg-dark-800/50 rounded-lg text-center">
      <div className="text-xs text-dark-400 mb-1">{label} {line}</div>
      <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full ${getProbabilityBgColor(probability)} rounded-full transition-all`}
          style={{ width: `${probability * 100}%` }}
        />
      </div>
      <div className={`text-lg font-bold ${getProbabilityColor(probability)}`}>
        {formatProb(probability)}
      </div>
      <div className="text-xs text-dark-500">Fair: {formatOdds(fairOdds)}</div>
      {probability >= 0.5 && (
        <div className="mt-1 text-xs text-accent-green flex items-center justify-center gap-1">
          <Zap className="w-3 h-3" /> Likely
        </div>
      )}
    </div>
  );
}

// Individual player row component
function PlayerShotRow({ player, expanded, onToggle }) {
  const { expected, markets, quickMarkets } = player;

  // Determine if this player has good shot markets
  const hasGoodShotChance = expected.shots >= 1.5;
  const hasGoodSoTChance = quickMarkets['1+_sot'].probability >= 0.4;

  return (
    <div className="border-b border-dark-700/50 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-dark-800/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            hasGoodShotChance ? 'bg-accent-cyan/20' : 'bg-dark-700'
          }`}>
            <User className={`w-5 h-5 ${hasGoodShotChance ? 'text-accent-cyan' : 'text-dark-400'}`} />
          </div>
          <div className="text-left">
            <div className="text-white font-medium flex items-center gap-2">
              {player.player}
              {hasGoodShotChance && (
                <span className="text-xs bg-accent-cyan/20 text-accent-cyan px-2 py-0.5 rounded-full">
                  High Volume
                </span>
              )}
            </div>
            <div className="text-xs text-dark-400 mt-0.5">
              Expected: <span className="text-white">{expected.shots.toFixed(1)}</span> shots,{' '}
              <span className="text-white">{expected.shotsOnTarget.toFixed(1)}</span> on target
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* Quick 1+ SoT market */}
          <div className="text-right">
            <div className={`text-sm font-bold ${getProbabilityColor(quickMarkets['1+_sot'].probability)}`}>
              {formatProb(quickMarkets['1+_sot'].probability)}
            </div>
            <div className="text-xs text-dark-500">1+ Shot on Target</div>
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-dark-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-dark-400" />
          )}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4">
              {/* Player Stats Summary */}
              <div className="p-3 bg-dark-800/30 rounded-lg">
                <h5 className="text-xs text-dark-400 mb-2 font-medium">Player Season Averages</h5>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-xl font-bold text-white">{expected.shots.toFixed(1)}</div>
                    <div className="text-xs text-dark-500">Shots/Game</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-accent-cyan">{expected.shotsOnTarget.toFixed(1)}</div>
                    <div className="text-xs text-dark-500">SoT/Game</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-dark-300">{(expected.sotRate * 100).toFixed(0)}%</div>
                    <div className="text-xs text-dark-500">Accuracy</div>
                  </div>
                </div>
              </div>

              {/* Shots markets */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-accent-cyan" />
                  <h5 className="text-sm text-dark-300 font-medium">Total Shots Markets</h5>
                </div>
                <p className="text-xs text-dark-500 mb-3">
                  "Over 1.5" means 2+ shots in the match. Based on player's average of {expected.shots.toFixed(1)} shots/game.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {markets.shots.slice(0, 4).map((market) => (
                    <MarketCard
                      key={market.line}
                      line={market.line}
                      probability={market.over.probability}
                      fairOdds={market.over.fairOdds}
                      label="Over"
                    />
                  ))}
                </div>
              </div>

              {/* Shots on Target markets */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-accent-green" />
                  <h5 className="text-sm text-dark-300 font-medium">Shots on Target Markets</h5>
                </div>
                <p className="text-xs text-dark-500 mb-3">
                  Shots that would go in if not saved. Player averages {expected.shotsOnTarget.toFixed(1)} SoT/game.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {markets.shotsOnTarget.slice(0, 4).map((market) => (
                    <MarketCard
                      key={market.line}
                      line={market.line}
                      probability={market.over.probability}
                      fairOdds={market.over.fairOdds}
                      label="Over"
                    />
                  ))}
                </div>
              </div>

              {/* Popular Markets Highlight */}
              <div className="p-4 bg-gradient-to-r from-accent-green/10 to-accent-cyan/10 rounded-xl border border-accent-green/20">
                <h5 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-accent-green" />
                  Popular Markets (Most Common Bets)
                </h5>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-xs text-dark-400 mb-1">1+ Shot on Target</div>
                    <div className={`text-2xl font-bold ${getProbabilityColor(quickMarkets['1+_sot'].probability)}`}>
                      {formatProb(quickMarkets['1+_sot'].probability)}
                    </div>
                    <div className="text-sm text-dark-400">
                      Fair odds: <span className="text-white font-medium">{formatOdds(quickMarkets['1+_sot'].fairOdds)}</span>
                    </div>
                    <div className="h-2 bg-dark-700 rounded-full overflow-hidden mt-2">
                      <div
                        className={`h-full ${getProbabilityBgColor(quickMarkets['1+_sot'].probability)} rounded-full`}
                        style={{ width: `${quickMarkets['1+_sot'].probability * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-dark-400 mb-1">2+ Shots on Target</div>
                    <div className={`text-2xl font-bold ${getProbabilityColor(quickMarkets['2+_sot'].probability)}`}>
                      {formatProb(quickMarkets['2+_sot'].probability)}
                    </div>
                    <div className="text-sm text-dark-400">
                      Fair odds: <span className="text-white font-medium">{formatOdds(quickMarkets['2+_sot'].fairOdds)}</span>
                    </div>
                    <div className="h-2 bg-dark-700 rounded-full overflow-hidden mt-2">
                      <div
                        className={`h-full ${getProbabilityBgColor(quickMarkets['2+_sot'].probability)} rounded-full`}
                        style={{ width: `${quickMarkets['2+_sot'].probability * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PlayerShotsProbabilityCard({ fixtureId, compact = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(!compact);
  const [expandedPlayers, setExpandedPlayers] = useState({});

  useEffect(() => {
    const fetchProbabilities = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await probabilityApi.getFixturePlayerProbabilities(fixtureId);
        setData(response.data);

        // Auto-expand top player
        if (response.data?.players?.length > 0) {
          setExpandedPlayers({ [response.data.players[0].player]: true });
        }
      } catch (err) {
        console.error('Error fetching player shot probabilities:', err);
        setError('Failed to load player shot probabilities');
      } finally {
        setLoading(false);
      }
    };

    if (fixtureId) {
      fetchProbabilities();
    }
  }, [fixtureId]);

  const togglePlayer = (playerName) => {
    setExpandedPlayers((prev) => ({
      ...prev,
      [playerName]: !prev[playerName],
    }));
  };

  if (loading) {
    return (
      <div className="card p-4 animate-pulse">
        <div className="h-6 bg-dark-700 rounded w-1/3 mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-dark-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data || !data.players?.length) {
    return (
      <div className="card p-4 text-dark-400 text-sm">
        {error || 'No player shot data available'}
      </div>
    );
  }

  const { fixture, players } = data;

  // Sort players by expected shots (highest first)
  const sortedPlayers = [...players].sort((a, b) => b.expected.shots - a.expected.shots);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card overflow-hidden"
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center justify-between bg-dark-800/50 hover:bg-dark-800 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-cyan/20 flex items-center justify-center">
            <Target className="w-5 h-5 text-accent-cyan" />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-white">Player Shot Markets</h3>
            <p className="text-sm text-dark-400">
              {players.length} players with shot data
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-5 h-5 text-dark-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-dark-400" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {/* How to use guide */}
            <div className="px-4 pt-4">
              <InfoBox title="How Player Shot Markets Work" variant="tip">
                <strong>1+ SoT</strong> = Player has at least 1 shot on target.{' '}
                Compare the <strong>fair odds</strong> with your bookmaker.
                If bookmaker offers higher odds, it's a value bet.
                Players are sorted by expected shots (highest first).
              </InfoBox>
            </div>

            {/* Quick Stats Bar */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-accent-cyan/20" />
                  <span className="text-dark-400">High Volume = 1.5+ shots/game</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-accent-green">Green</span>
                  <span className="text-dark-400">= 50%+ chance</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-accent-red">Red</span>
                  <span className="text-dark-400">= {"<"}30% chance</span>
                </div>
              </div>
            </div>

            {/* Players list */}
            <div className="divide-y divide-dark-700/50">
              {sortedPlayers.map((player, index) => (
                <PlayerShotRow
                  key={player.player || index}
                  player={player}
                  expanded={expandedPlayers[player.player]}
                  onToggle={() => togglePlayer(player.player)}
                />
              ))}
            </div>

            {/* Glossary */}
            <div className="p-4 border-t border-dark-700/50">
              <div className="p-4 bg-dark-800/20 rounded-xl border border-dark-700/50">
                <h4 className="text-sm font-medium text-dark-300 mb-2">Quick Reference</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-dark-400">Shot on Target (SoT):</span>
                    <span className="text-dark-300 ml-1">A shot going into the goal if not saved</span>
                  </div>
                  <div>
                    <span className="text-dark-400">Expected Shots:</span>
                    <span className="text-dark-300 ml-1">Based on player's season average</span>
                  </div>
                  <div>
                    <span className="text-dark-400">Fair Odds:</span>
                    <span className="text-dark-300 ml-1">True odds with 0% bookmaker margin</span>
                  </div>
                  <div>
                    <span className="text-dark-400">Value Bet:</span>
                    <span className="text-dark-300 ml-1">When bookmaker odds {">"} fair odds</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
