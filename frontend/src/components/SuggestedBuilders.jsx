import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Target,
  TrendingUp,
  Layers,
  ChevronRight,
  Sparkles,
  CornerUpRight,
  CircleDot,
  Square,
  Crosshair,
  AlertCircle,
  Shield,
  Percent,
} from 'lucide-react';

// Same-match builder templates - combine different market types from ONE match
const BUILDER_TEMPLATES = [
  {
    id: 'corners-cards',
    name: 'Corners & Cards',
    description: 'Stats from different categories',
    icon: CornerUpRight,
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    marketTypes: ['corners', 'cards'],
    maxOddsPerBet: 2.0, // High probability bets only
    strategy: 'Low correlation - different stat categories',
  },
  {
    id: 'shots-corners',
    name: 'Shots & Corners',
    description: 'Team attacking stats combo',
    icon: Crosshair,
    color: 'from-purple-500 to-pink-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    marketTypes: ['team_shots', 'corners'],
    maxOddsPerBet: 2.0,
    strategy: 'Attacking stats combination',
  },
  {
    id: 'goals-corners',
    name: 'Goals & Corners',
    description: 'Goal markets with corners',
    icon: CircleDot,
    color: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
    marketTypes: ['goals', 'corners'],
    maxOddsPerBet: 2.5,
    strategy: 'Popular attacking combo',
  },
  {
    id: 'cards-shots',
    name: 'Cards & Shots',
    description: 'Booking + shooting stats',
    icon: Square,
    color: 'from-yellow-500 to-amber-500',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    marketTypes: ['cards', 'team_shots'],
    maxOddsPerBet: 2.0,
    strategy: 'Different stat categories',
  },
  {
    id: 'triple-stats',
    name: 'Triple Stats',
    description: '3 different stat markets',
    icon: Layers,
    color: 'from-indigo-500 to-violet-500',
    bgColor: 'bg-indigo-500/10',
    borderColor: 'border-indigo-500/30',
    marketTypes: ['corners', 'cards', 'team_shots'],
    maxOddsPerBet: 1.8, // Need higher prob for 3-leg
    strategy: 'Three uncorrelated markets',
  },
  {
    id: 'safe-double',
    name: 'Safe Double',
    description: 'Two high-probability picks',
    icon: Shield,
    color: 'from-teal-500 to-cyan-500',
    bgColor: 'bg-teal-500/10',
    borderColor: 'border-teal-500/30',
    marketTypes: 'any_two_different', // Special: pick 2 highest prob from different types
    maxOddsPerBet: 1.6, // Very high probability
    strategy: 'Maximum safety - two strong selections',
  },
];

// Calculate combined stats for a builder
const calculateBuilderStats = (bets) => {
  if (!bets || bets.length === 0) {
    return { combinedOdds: 0, combinedProbability: 0, combinedEV: 0, fairOdds: 0 };
  }

  const combinedOdds = bets.reduce((acc, bet) => acc * bet.bookmakerOdds, 1);
  const combinedProbability = bets.reduce((acc, bet) => acc * bet.probability, 1);
  const fairOdds = combinedProbability > 0 ? 1 / combinedProbability : 0;
  const combinedEV = bets.reduce((acc, bet) => acc * (1 + bet.edge), 1) - 1;

  return { combinedOdds, combinedProbability, combinedEV, fairOdds };
};

// Find best bet for a market type within odds limit
const findBestBetForType = (bets, marketType, maxOdds) => {
  const matching = bets.filter(bet =>
    bet.betType === marketType &&
    bet.bookmakerOdds <= maxOdds &&
    bet.edge > 0 // Only positive EV
  );

  if (matching.length === 0) return null;

  // Sort by edge (best value first)
  return matching.sort((a, b) => b.edge - a.edge)[0];
};

// Generate builders for a single match
const generateMatchBuilders = (matchBets, fixtureInfo) => {
  if (!matchBets || matchBets.length < 2) return [];

  const builders = [];

  for (const template of BUILDER_TEMPLATES) {
    let selectedBets = [];

    if (template.marketTypes === 'any_two_different') {
      // Special case: pick 2 highest probability bets from different market types
      const sortedByProb = [...matchBets]
        .filter(bet => bet.bookmakerOdds <= template.maxOddsPerBet && bet.edge > 0)
        .sort((a, b) => b.probability - a.probability);

      const usedTypes = new Set();
      for (const bet of sortedByProb) {
        if (selectedBets.length >= 2) break;
        if (!usedTypes.has(bet.betType)) {
          selectedBets.push(bet);
          usedTypes.add(bet.betType);
        }
      }
    } else {
      // Standard case: find best bet for each market type
      for (const marketType of template.marketTypes) {
        const bet = findBestBetForType(matchBets, marketType, template.maxOddsPerBet);
        if (bet) {
          selectedBets.push(bet);
        }
      }
    }

    // Need at least 2 bets for a builder
    if (selectedBets.length >= 2) {
      const stats = calculateBuilderStats(selectedBets);

      // Only include if combined EV is positive and odds are reasonable
      if (stats.combinedEV > 0 && stats.combinedOdds <= 5.0) {
        builders.push({
          ...template,
          bets: selectedBets,
          stats,
          fixture: fixtureInfo,
        });
      }
    }
  }

  // Sort by combined EV
  return builders.sort((a, b) => b.stats.combinedEV - a.stats.combinedEV);
};

// Group bets by match and generate builders
const generateAllBuilders = (allBets) => {
  // Group bets by fixture
  const byFixture = {};

  for (const bet of allBets) {
    const fixtureId = bet.fixture?.id;
    if (!fixtureId) continue;

    if (!byFixture[fixtureId]) {
      byFixture[fixtureId] = {
        fixture: bet.fixture,
        bets: [],
      };
    }
    byFixture[fixtureId].bets.push(bet);
  }

  // Generate builders for each match
  const allBuilders = [];

  for (const fixtureId of Object.keys(byFixture)) {
    const { fixture, bets } = byFixture[fixtureId];
    const matchBuilders = generateMatchBuilders(bets, fixture);
    allBuilders.push(...matchBuilders);
  }

  // Sort all builders by combined EV
  return allBuilders.sort((a, b) => b.stats.combinedEV - a.stats.combinedEV);
};

const SuggestedBuilders = ({
  allBets = [],
  isExpanded: externalIsExpanded,
  onToggleExpanded,
}) => {
  const [internalIsExpanded, setInternalIsExpanded] = useState(true);

  const isExpanded = externalIsExpanded !== undefined ? externalIsExpanded : internalIsExpanded;
  const toggleExpanded = onToggleExpanded || (() => setInternalIsExpanded(!internalIsExpanded));

  // Generate suggested builders
  const suggestedBuilders = useMemo(() => {
    return generateAllBuilders(allBets);
  }, [allBets]);

  if (suggestedBuilders.length === 0) {
    return null;
  }

  return (
    <div className="bg-dark-800/50 rounded-2xl border border-dark-700 overflow-hidden">
      {/* Header */}
      <button
        onClick={toggleExpanded}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-dark-700/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-primary-500/20 to-cyan-500/20 rounded-xl">
            <Sparkles className="w-5 h-5 text-primary-400" />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-white flex items-center gap-2">
              Same-Match Builders
              <span className="text-xs font-normal text-dark-400 bg-dark-700 px-2 py-0.5 rounded-full">
                {suggestedBuilders.length} combos
              </span>
            </h3>
            <p className="text-xs text-dark-400">High-probability combinations from same match</p>
          </div>
        </div>
        <ChevronRight
          className={`w-5 h-5 text-dark-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
        />
      </button>

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-5 pb-5 space-y-3">
              {suggestedBuilders.slice(0, 6).map((builder, index) => (
                <BuilderCard
                  key={`${builder.id}-${builder.fixture?.id}-${index}`}
                  builder={builder}
                />
              ))}
              {suggestedBuilders.length > 6 && (
                <p className="text-xs text-dark-500 text-center py-2">
                  +{suggestedBuilders.length - 6} more builders available
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Individual builder card component
const BuilderCard = ({ builder }) => {
  const [showDetails, setShowDetails] = useState(false);
  const Icon = builder.icon;

  const matchName = builder.fixture
    ? `${builder.fixture.homeTeam?.name || 'Home'} vs ${builder.fixture.awayTeam?.name || 'Away'}`
    : 'Unknown Match';

  return (
    <motion.div
      layout
      className={`rounded-xl border ${builder.borderColor} ${builder.bgColor} overflow-hidden`}
    >
      {/* Card Header */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-xl bg-gradient-to-br ${builder.color} bg-opacity-20`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="font-bold text-white flex items-center gap-2">
                {builder.name}
                <span className="text-[10px] text-dark-400 bg-dark-700 px-1.5 py-0.5 rounded">
                  {builder.bets.length} legs
                </span>
              </h4>
              <p className="text-xs text-dark-400">{builder.description}</p>
              <p className="text-xs text-primary-400 mt-1 truncate max-w-[200px]">{matchName}</p>
            </div>
          </div>

          {/* Combined Stats */}
          <div className="text-right">
            <div className="text-lg font-bold text-cyan-400">
              @{builder.stats.combinedOdds.toFixed(2)}
            </div>
            <div className="text-xs text-green-400">
              +{(builder.stats.combinedEV * 100).toFixed(1)}% EV
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="mt-3 flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <Percent className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-dark-300">{(builder.stats.combinedProbability * 100).toFixed(0)}% prob</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-dark-300">Fair @{builder.stats.fairOdds.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-green-400" />
            <span className="text-dark-300">+€{(10 * builder.stats.combinedEV).toFixed(2)}/€10</span>
          </div>
        </div>

        {/* Included Bets Preview */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {builder.bets.map((bet, idx) => (
            <span
              key={idx}
              className="text-[10px] bg-dark-900/50 text-dark-300 px-2 py-1 rounded-lg"
            >
              {bet.selectionName || bet.market} @{bet.bookmakerOdds.toFixed(2)}
            </span>
          ))}
        </div>

        {/* Action Button */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className={`mt-4 w-full py-2.5 px-4 rounded-xl bg-gradient-to-r ${builder.color} text-white font-medium text-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2`}
        >
          {showDetails ? 'Hide Details' : 'View Details'}
        </button>
      </div>

      {/* Details Section */}
      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-dark-700/50"
          >
            <div className="p-4 space-y-3">
              {/* Strategy */}
              <div className="text-xs text-dark-400 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>{builder.strategy}</span>
              </div>

              {/* Included Bets */}
              <div className="space-y-2">
                <div className="text-xs text-dark-500 font-medium">Selections:</div>
                {builder.bets.map((bet, index) => (
                  <div
                    key={index}
                    className="bg-dark-900/50 rounded-lg p-3 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-white font-medium">
                          {bet.selectionName || bet.market}
                        </div>
                        <div className="text-xs text-dark-400 mt-0.5 capitalize">
                          {bet.betType?.replace('_', ' ')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-cyan-400 font-medium">@{bet.bookmakerOdds?.toFixed(2)}</div>
                        <div className="text-xs text-green-400">+{(bet.edge * 100).toFixed(1)}% EV</div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-xs text-dark-400">
                      <span>{(bet.probability * 100).toFixed(0)}% probability</span>
                      <span>Fair @{(1/bet.probability).toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Combined Calculation */}
              <div className="bg-dark-900/30 rounded-lg p-3 text-[11px]">
                <div className="text-dark-500 mb-1">Combined odds:</div>
                <code className="text-cyan-400">
                  {builder.bets.map(b => `@${b.bookmakerOdds.toFixed(2)}`).join(' × ')} = @{builder.stats.combinedOdds.toFixed(2)}
                </code>
                <div className="text-dark-500 mt-2 mb-1">Combined probability:</div>
                <code className="text-purple-400">
                  {builder.bets.map(b => `${(b.probability * 100).toFixed(0)}%`).join(' × ')} = {(builder.stats.combinedProbability * 100).toFixed(1)}%
                </code>
                <div className="text-dark-500 mt-2 mb-1">Expected value (€10 stake):</div>
                <code className="text-green-400">
                  +{(builder.stats.combinedEV * 100).toFixed(1)}% = €{(10 * builder.stats.combinedEV).toFixed(2)} expected profit
                </code>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default SuggestedBuilders;
