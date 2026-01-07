import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CornerUpRight, TrendingUp, TrendingDown, ChevronDown, ChevronUp, Info, Zap, CloudRain, Users, Trophy, Clock, DollarSign, RefreshCw, AlertTriangle } from 'lucide-react';
import { probabilityApi, oddsApi } from '../services/api';

// Format relative time
const formatRelativeTime = (isoString) => {
  if (!isoString) return 'Unknown';
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffSeconds < 30) return 'Just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  return date.toLocaleString();
};

const isOddsStale = (isoString, thresholdMinutes = 5) => {
  if (!isoString) return true;
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  return Math.floor(diffMs / 1000 / 60) >= thresholdMinutes;
};

// Format probability as percentage
const formatProb = (prob) => `${(prob * 100).toFixed(1)}%`;

// Format odds
const formatOdds = (odds) => odds?.toFixed(2) || '-';

// Calculate EV percentage
const calculateEV = (probability, bookmakerOdds) => {
  if (!probability || !bookmakerOdds) return null;
  // EV = (probability * bookmakerOdds) - 1
  // Positive EV = value bet
  return ((probability * bookmakerOdds) - 1) * 100;
};

// Get EV color and indicator
const getEVColor = (ev) => {
  if (ev === null) return 'text-dark-500';
  if (ev >= 10) return 'text-accent-green';
  if (ev >= 5) return 'text-green-400';
  if (ev >= 0) return 'text-yellow-400';
  return 'text-dark-500';
};

// Parse corner odds from bookmaker data
const parseCornerOdds = (oddsData) => {
  if (!oddsData?.odds?.bookmakers) return null;

  const cornerOdds = {};

  // Find Bet365 odds (primary) or any available bookmaker
  const bookmakers = oddsData.odds.bookmakers;
  const preferredOrder = ['Bet365', 'Kambi', 'Pinnacle', 'Unibet DK', 'DraftKings', 'FanDuel', '888Sport', 'Betano'];

  let selectedBookmaker = null;
  let selectedData = null;

  for (const bm of preferredOrder) {
    if (bookmakers[bm]) {
      selectedBookmaker = bm;
      selectedData = bookmakers[bm];
      break;
    }
  }

  // Fallback to first available bookmaker
  if (!selectedData) {
    const available = Object.keys(bookmakers);
    if (available.length > 0) {
      selectedBookmaker = available[0];
      selectedData = bookmakers[available[0]];
    }
  }

  if (!selectedData) return null;

  // Find Corners Totals market
  const cornersTotals = selectedData.find(m => m.name === 'Corners Totals');

  if (cornersTotals?.odds) {
    cornersTotals.odds.forEach(odd => {
      const line = parseFloat(odd.hdp);
      cornerOdds[line] = {
        over: parseFloat(odd.over),
        under: parseFloat(odd.under),
        bookmaker: selectedBookmaker
      };
    });
  }

  return Object.keys(cornerOdds).length > 0 ? cornerOdds : null;
};

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

// Probability bar component
function ProbabilityBar({ probability, label, fairOdds, showLabel = true }) {
  const percentage = Math.min(probability * 100, 100);
  const bgColor = getProbabilityBgColor(probability);
  const textColor = getProbabilityColor(probability);

  return (
    <div className="flex-1">
      {showLabel && (
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-dark-400">{label}</span>
          <span className={`text-sm font-medium ${textColor}`}>
            {formatProb(probability)}
          </span>
        </div>
      )}
      <div className="h-2 bg-dark-700 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={`h-full ${bgColor} rounded-full`}
        />
      </div>
      <div className="flex justify-between items-center mt-1">
        <span className="text-xs text-dark-500">Fair odds: {formatOdds(fairOdds)}</span>
        {probability >= 0.5 && (
          <span className="text-xs text-accent-green flex items-center gap-1">
            <Zap className="w-3 h-3" /> Likely
          </span>
        )}
      </div>
    </div>
  );
}

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

export default function CornersProbabilityCard({ fixtureId, compact = false }) {
  const [data, setData] = useState(null);
  const [bookmakerOdds, setBookmakerOdds] = useState(null);
  const [oddsBookmaker, setOddsBookmaker] = useState(null);
  const [oddsMeta, setOddsMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(!compact);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      // Fetch probabilities and odds in parallel using Promise.allSettled
      // This ensures all requests complete even if some fail
      const results = await Promise.allSettled([
        probabilityApi.getCornerProbabilities(fixtureId),
        oddsApi.getForFixture(fixtureId)
      ]);

      // Extract results
      const probResponse = results[0].status === 'fulfilled' ? results[0].value : null;
      const oddsResponse = results[1].status === 'fulfilled' ? results[1].value : { data: null };

      if (!probResponse?.data) {
        setError('Failed to load corner probabilities');
        return;
      }

      setData(probResponse.data);

      // Parse corner odds from bookmaker data
      if (oddsResponse?.data) {
        // Capture odds metadata for freshness display
        if (oddsResponse.data.meta) {
          setOddsMeta(oddsResponse.data.meta);
        }

        const parsedOdds = parseCornerOdds(oddsResponse.data);
        if (parsedOdds) {
          setBookmakerOdds(parsedOdds);
          // Get bookmaker name from first entry
          const firstLine = Object.values(parsedOdds)[0];
          setOddsBookmaker(firstLine?.bookmaker);
        }
      }
    } catch (err) {
      console.error('Error fetching corner probabilities:', err);
      setError('Failed to load corner probabilities');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (fixtureId) {
      fetchData(false);
    }
  }, [fixtureId]);

  const handleRefresh = () => {
    if (!refreshing) {
      fetchData(true);
    }
  };

  if (loading) {
    return (
      <div className="card p-4 animate-pulse">
        <div className="h-6 bg-dark-700 rounded w-1/3 mb-4" />
        <div className="space-y-2">
          <div className="h-4 bg-dark-700 rounded w-full" />
          <div className="h-4 bg-dark-700 rounded w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card p-4 text-dark-400 text-sm">
        {error || 'No corner data available'}
      </div>
    );
  }

  const { probabilities, teamStats, fixture, enhancedFactors } = data;
  const { expected, totalMarkets, homeTeamMarkets, awayTeamMarkets } = probabilities;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 flex items-center justify-between bg-dark-800/50">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3 flex-1 hover:bg-dark-800/50 -m-2 p-2 rounded-lg transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-primary-500/20 flex items-center justify-center">
            <CornerUpRight className="w-5 h-5 text-primary-400" />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-white">Corner Markets</h3>
            <p className="text-sm text-dark-400">
              Expected: {expected.total.toFixed(1)} total corners
            </p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          {/* Odds Freshness Indicator */}
          {oddsMeta?.fetchedAt && (
            <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${
              isOddsStale(oddsMeta.fetchedAt, 5)
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-dark-700 text-dark-400'
            }`}>
              {isOddsStale(oddsMeta.fetchedAt, 5) && <AlertTriangle className="w-3 h-3" />}
              <Clock className="w-3 h-3" />
              <span>{formatRelativeTime(oddsMeta.fetchedAt)}</span>
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleRefresh(); }}
            disabled={refreshing}
            className={`p-1.5 rounded-lg transition-colors ${
              refreshing ? 'bg-dark-700 text-dark-500' : 'bg-dark-700 text-dark-300 hover:bg-dark-600 hover:text-white'
            }`}
            title="Refresh odds"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setExpanded(!expanded)} className="p-1">
            {expanded ? <ChevronUp className="w-5 h-5 text-dark-400" /> : <ChevronDown className="w-5 h-5 text-dark-400" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-6">
              {/* How to Use Guide */}
              <InfoBox title="How to Find Value" variant="tip">
                Compare <strong>Fair Odds</strong> with your bookmaker's odds.
                If the bookmaker offers <strong>higher odds</strong> than the fair odds shown here,
                it's a <strong>value bet (+EV)</strong>. Example: If fair odds are 2.00 and bookmaker offers 2.20, that's value.
              </InfoBox>

              {/* Enhanced Factors - Match Insights */}
              {enhancedFactors && enhancedFactors.reasoning && enhancedFactors.reasoning !== 'Standard match conditions' && (
                <div className="p-4 bg-gradient-to-r from-primary-500/10 to-accent-cyan/10 rounded-xl border border-primary-500/20">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                      <Info className="w-4 h-4 text-primary-400" />
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-white mb-1">Match Factors</h4>
                      <p className="text-sm text-dark-300">{enhancedFactors.reasoning}</p>
                      {enhancedFactors.applied?.corners && enhancedFactors.applied.corners !== 1 && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-xs text-dark-400">Adjustment:</span>
                          <span className={`text-xs font-medium ${enhancedFactors.applied.corners > 1 ? 'text-accent-green' : 'text-accent-red'}`}>
                            {enhancedFactors.applied.corners > 1 ? '+' : ''}{((enhancedFactors.applied.corners - 1) * 100).toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Factor Details */}
                  {enhancedFactors.details && (
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                      {enhancedFactors.details.weather?.available && enhancedFactors.details.weather.condition !== 'normal' && (
                        <div className="flex items-center gap-2 text-xs bg-dark-800/50 px-2 py-1 rounded-lg">
                          <CloudRain className="w-3 h-3 text-accent-cyan" />
                          <span className="text-dark-300">{enhancedFactors.details.weather.description}</span>
                        </div>
                      )}
                      {enhancedFactors.details.h2h?.available && enhancedFactors.details.h2h.totalMatches >= 3 && (
                        <div className="flex items-center gap-2 text-xs bg-dark-800/50 px-2 py-1 rounded-lg">
                          <Users className="w-3 h-3 text-primary-400" />
                          <span className="text-dark-300">{enhancedFactors.details.h2h.description}</span>
                        </div>
                      )}
                      {enhancedFactors.details.importance?.available && enhancedFactors.details.importance.importance !== 'normal' && (
                        <div className="flex items-center gap-2 text-xs bg-dark-800/50 px-2 py-1 rounded-lg">
                          <Trophy className="w-3 h-3 text-yellow-400" />
                          <span className="text-dark-300">{enhancedFactors.details.importance.importance}</span>
                        </div>
                      )}
                      {enhancedFactors.details.restDays?.advantage !== 'none' && (
                        <div className="flex items-center gap-2 text-xs bg-dark-800/50 px-2 py-1 rounded-lg">
                          <Clock className="w-3 h-3 text-orange-400" />
                          <span className="text-dark-300">{enhancedFactors.details.restDays.description}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Expected Corners Summary */}
              <div>
                <h4 className="text-sm font-medium text-dark-300 mb-3">Expected Corners (Based on Season Averages)</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 bg-dark-800/50 rounded-xl">
                    <div className="text-2xl font-bold text-white">{expected.home.toFixed(1)}</div>
                    <div className="text-xs text-dark-400">{fixture.homeTeam.name}</div>
                    <div className="text-xs text-dark-500 mt-1">
                      Avg: {teamStats.home.corners?.average?.toFixed(1) || 'N/A'}/game
                    </div>
                  </div>
                  <div className="text-center p-3 bg-primary-500/10 rounded-xl border border-primary-500/20">
                    <div className="text-2xl font-bold text-primary-400">{expected.total.toFixed(1)}</div>
                    <div className="text-xs text-dark-400">Total Expected</div>
                    <div className="text-xs text-primary-400/70 mt-1">Combined prediction</div>
                  </div>
                  <div className="text-center p-3 bg-dark-800/50 rounded-xl">
                    <div className="text-2xl font-bold text-white">{expected.away.toFixed(1)}</div>
                    <div className="text-xs text-dark-400">{fixture.awayTeam.name}</div>
                    <div className="text-xs text-dark-500 mt-1">
                      Avg: {teamStats.away.corners?.average?.toFixed(1) || 'N/A'}/game
                    </div>
                  </div>
                </div>
              </div>

              {/* Total Corners Markets */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-dark-300">Total Corners Markets</h4>
                  {oddsBookmaker && (
                    <span className="text-xs text-primary-400 bg-primary-500/20 px-2 py-0.5 rounded">
                      Odds from {oddsBookmaker}
                    </span>
                  )}
                </div>
                <p className="text-xs text-dark-500 mb-3">
                  "Over 9.5" means 10+ corners in the match. "Under 9.5" means 9 or fewer corners.
                </p>
                <div className="space-y-4">
                  {totalMarkets.map((market) => {
                    const bmOdds = bookmakerOdds?.[market.line];
                    const overEV = bmOdds ? calculateEV(market.over.probability, bmOdds.over) : null;
                    const underEV = bmOdds ? calculateEV(market.under.probability, bmOdds.under) : null;

                    return (
                      <div
                        key={market.line}
                        className={`p-4 rounded-xl ${(overEV > 0 || underEV > 0) ? 'bg-accent-green/10 border border-accent-green/30' : 'bg-dark-800/30'}`}
                      >
                        <div className="flex items-center justify-center mb-3">
                          <span className="text-lg font-bold text-white bg-dark-700 px-4 py-1 rounded-full">
                            {market.line} corners
                          </span>
                          {(overEV > 0 || underEV > 0) && (
                            <span className="ml-2 text-xs font-bold text-accent-green bg-accent-green/20 px-2 py-0.5 rounded">
                              VALUE BET
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <TrendingUp className="w-4 h-4 text-accent-green" />
                              <span className="text-sm text-white font-medium">Over {market.line}</span>
                            </div>
                            <ProbabilityBar
                              probability={market.over.probability}
                              fairOdds={market.over.fairOdds}
                              showLabel={false}
                            />
                            <div className="mt-2 text-center">
                              <span className={`text-lg font-bold ${getProbabilityColor(market.over.probability)}`}>
                                {formatProb(market.over.probability)}
                              </span>
                              <div className="text-xs text-dark-500">
                                Fair: <span className="text-dark-300">{formatOdds(market.over.fairOdds)}</span>
                                {bmOdds && (
                                  <>
                                    <span className="mx-1">|</span>
                                    <span className={bmOdds.over > market.over.fairOdds ? 'text-accent-green font-bold' : 'text-dark-400'}>
                                      {oddsBookmaker}: {formatOdds(bmOdds.over)}
                                    </span>
                                  </>
                                )}
                              </div>
                              {overEV !== null && (
                                <div className={`text-xs mt-1 font-medium ${getEVColor(overEV)}`}>
                                  EV: {overEV > 0 ? '+' : ''}{overEV.toFixed(1)}%
                                </div>
                              )}
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              <TrendingDown className="w-4 h-4 text-accent-red" />
                              <span className="text-sm text-white font-medium">Under {market.line}</span>
                            </div>
                            <ProbabilityBar
                              probability={market.under.probability}
                              fairOdds={market.under.fairOdds}
                              showLabel={false}
                            />
                            <div className="mt-2 text-center">
                              <span className={`text-lg font-bold ${getProbabilityColor(market.under.probability)}`}>
                                {formatProb(market.under.probability)}
                              </span>
                              <div className="text-xs text-dark-500">
                                Fair: <span className="text-dark-300">{formatOdds(market.under.fairOdds)}</span>
                                {bmOdds && (
                                  <>
                                    <span className="mx-1">|</span>
                                    <span className={bmOdds.under > market.under.fairOdds ? 'text-accent-green font-bold' : 'text-dark-400'}>
                                      {oddsBookmaker}: {formatOdds(bmOdds.under)}
                                    </span>
                                  </>
                                )}
                              </div>
                              {underEV !== null && (
                                <div className={`text-xs mt-1 font-medium ${getEVColor(underEV)}`}>
                                  EV: {underEV > 0 ? '+' : ''}{underEV.toFixed(1)}%
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Team Corners Markets */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Home Team */}
                <div className="p-4 bg-dark-800/30 rounded-xl">
                  <h4 className="text-sm font-medium text-white mb-1">
                    {fixture.homeTeam.name} Corners
                  </h4>
                  <p className="text-xs text-dark-500 mb-3">Individual team corner markets</p>
                  <div className="space-y-3">
                    {homeTeamMarkets.slice(0, 4).map((market) => (
                      <div key={market.line} className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-dark-300">Over {market.line}</span>
                          <span className={`text-sm font-medium ${getProbabilityColor(market.over.probability)}`}>
                            {formatProb(market.over.probability)}
                          </span>
                        </div>
                        <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getProbabilityBgColor(market.over.probability)} rounded-full transition-all`}
                            style={{ width: `${market.over.probability * 100}%` }}
                          />
                        </div>
                        <div className="text-xs text-dark-500 text-right">
                          Fair: {formatOdds(market.over.fairOdds)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Away Team */}
                <div className="p-4 bg-dark-800/30 rounded-xl">
                  <h4 className="text-sm font-medium text-white mb-1">
                    {fixture.awayTeam.name} Corners
                  </h4>
                  <p className="text-xs text-dark-500 mb-3">Individual team corner markets</p>
                  <div className="space-y-3">
                    {awayTeamMarkets.slice(0, 4).map((market) => (
                      <div key={market.line} className="space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-dark-300">Over {market.line}</span>
                          <span className={`text-sm font-medium ${getProbabilityColor(market.over.probability)}`}>
                            {formatProb(market.over.probability)}
                          </span>
                        </div>
                        <div className="h-1.5 bg-dark-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${getProbabilityBgColor(market.over.probability)} rounded-full transition-all`}
                            style={{ width: `${market.over.probability * 100}%` }}
                          />
                        </div>
                        <div className="text-xs text-dark-500 text-right">
                          Fair: {formatOdds(market.over.fairOdds)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Glossary */}
              <div className="p-4 bg-dark-800/20 rounded-xl border border-dark-700/50">
                <h4 className="text-sm font-medium text-dark-300 mb-2">Quick Reference</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-dark-400">Fair Odds:</span>
                    <span className="text-dark-300 ml-1">The "true" odds with 0% bookmaker margin</span>
                  </div>
                  <div>
                    <span className="text-dark-400">Value Bet:</span>
                    <span className="text-dark-300 ml-1">When bookmaker odds {">"} fair odds</span>
                  </div>
                  <div>
                    <span className="text-accent-green">Green</span>
                    <span className="text-dark-300 ml-1">= High probability (50%+)</span>
                  </div>
                  <div>
                    <span className="text-accent-red">Red</span>
                    <span className="text-dark-300 ml-1">= Low probability ({"<"}30%)</span>
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
