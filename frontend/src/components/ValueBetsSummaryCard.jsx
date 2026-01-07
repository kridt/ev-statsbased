import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, TrendingUp, TrendingDown, CornerUpRight, CreditCard, Target, ChevronDown, ChevronUp, DollarSign, BarChart3, Calculator, Info, Users, Trophy, CloudRain, Clock, User, RefreshCw, AlertTriangle } from 'lucide-react';
import { probabilityApi, oddsApi } from '../services/api';

// Format relative time (e.g., "2 minutes ago")
const formatRelativeTime = (isoString) => {
  if (!isoString) return 'Unknown';

  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 30) return 'Just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleString();
};

// Check if odds are stale (older than threshold)
const isOddsStale = (isoString, thresholdMinutes = 5) => {
  if (!isoString) return true;

  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMinutes = Math.floor(diffMs / 1000 / 60);

  return diffMinutes >= thresholdMinutes;
};

// Calculate EV percentage
const calculateEV = (probability, bookmakerOdds) => {
  if (!probability || !bookmakerOdds) return null;
  return ((probability * bookmakerOdds) - 1) * 100;
};

// Parse corner odds from ALL bookmakers (for multi-bookmaker comparison)
const parseAllCornerOdds = (oddsData) => {
  if (!oddsData?.odds?.bookmakers) return null;

  const allBookmakerOdds = {};
  const bookmakers = oddsData.odds.bookmakers;
  const preferredOrder = ['Bet365', 'Kambi', 'Pinnacle', 'Unibet DK', 'DraftKings', 'FanDuel', '888Sport', 'Betano'];

  // Collect odds from all bookmakers
  Object.entries(bookmakers).forEach(([bmName, bmData]) => {
    const cornersTotals = bmData.find(m => m.name === 'Corners Totals');
    if (cornersTotals?.odds) {
      cornersTotals.odds.forEach(odd => {
        const line = parseFloat(odd.hdp);
        if (!allBookmakerOdds[line]) {
          allBookmakerOdds[line] = {};
        }
        allBookmakerOdds[line][bmName] = {
          over: parseFloat(odd.over),
          under: parseFloat(odd.under)
        };
      });
    }
  });

  // Select primary bookmaker
  let primaryBookmaker = null;
  for (const bm of preferredOrder) {
    if (bookmakers[bm]) {
      primaryBookmaker = bm;
      break;
    }
  }
  if (!primaryBookmaker && Object.keys(bookmakers).length > 0) {
    primaryBookmaker = Object.keys(bookmakers)[0];
  }

  return {
    allOdds: allBookmakerOdds,
    primaryBookmaker,
    bookmakerList: Object.keys(bookmakers)
  };
};

// Parse corner odds from bookmaker data (legacy - for primary bookmaker selection)
const parseCornerOdds = (oddsData) => {
  if (!oddsData?.odds?.bookmakers) return null;

  const cornerOdds = {};
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

  if (!selectedData) {
    const available = Object.keys(bookmakers);
    if (available.length > 0) {
      selectedBookmaker = available[0];
      selectedData = bookmakers[available[0]];
    }
  }

  if (!selectedData) return null;

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

  return { odds: Object.keys(cornerOdds).length > 0 ? cornerOdds : null, bookmaker: selectedBookmaker };
};

// Parse card odds from ALL bookmakers (for multi-bookmaker comparison)
const parseAllCardOdds = (oddsData) => {
  if (!oddsData?.odds?.bookmakers) return null;

  const allBookmakerOdds = {};
  const bookmakers = oddsData.odds.bookmakers;
  const preferredOrder = ['Bet365', 'Kambi', 'Pinnacle', 'Unibet DK', 'DraftKings', 'FanDuel', '888Sport', 'Betano'];

  // Collect odds from all bookmakers
  Object.entries(bookmakers).forEach(([bmName, bmData]) => {
    const bookingsTotals = bmData.find(m => m.name === 'Bookings Totals');
    if (bookingsTotals?.odds) {
      bookingsTotals.odds.forEach(odd => {
        const line = parseFloat(odd.hdp);
        if (!allBookmakerOdds[line]) {
          allBookmakerOdds[line] = {};
        }
        allBookmakerOdds[line][bmName] = {
          over: parseFloat(odd.over),
          under: parseFloat(odd.under)
        };
      });
    }
  });

  // Select primary bookmaker
  let primaryBookmaker = null;
  for (const bm of preferredOrder) {
    if (bookmakers[bm]) {
      primaryBookmaker = bm;
      break;
    }
  }
  if (!primaryBookmaker && Object.keys(bookmakers).length > 0) {
    primaryBookmaker = Object.keys(bookmakers)[0];
  }

  return {
    allOdds: allBookmakerOdds,
    primaryBookmaker,
    bookmakerList: Object.keys(bookmakers)
  };
};

// Parse card odds from bookmaker data (legacy - for primary bookmaker selection)
const parseCardOdds = (oddsData) => {
  if (!oddsData?.odds?.bookmakers) return null;

  const cardOdds = {};
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

  if (!selectedData) {
    const available = Object.keys(bookmakers);
    if (available.length > 0) {
      selectedBookmaker = available[0];
      selectedData = bookmakers[available[0]];
    }
  }

  if (!selectedData) return null;

  const bookingsTotals = selectedData.find(m => m.name === 'Bookings Totals');

  if (bookingsTotals?.odds) {
    bookingsTotals.odds.forEach(odd => {
      const line = parseFloat(odd.hdp);
      cardOdds[line] = {
        over: parseFloat(odd.over),
        under: parseFloat(odd.under),
        bookmaker: selectedBookmaker
      };
    });
  }

  return { odds: Object.keys(cardOdds).length > 0 ? cardOdds : null, bookmaker: selectedBookmaker };
};

// Get EV badge color based on value
const getEVBadgeColor = (ev) => {
  if (ev >= 20) return 'bg-accent-green text-dark-900';
  if (ev >= 10) return 'bg-green-500 text-white';
  if (ev >= 5) return 'bg-green-400 text-dark-900';
  return 'bg-yellow-400 text-dark-900';
};

// Get market type icon
const getMarketIcon = (marketType) => {
  switch (marketType) {
    case 'corners':
      return <CornerUpRight className="w-4 h-4" />;
    case 'cards':
      return <CreditCard className="w-4 h-4" />;
    default:
      return <Target className="w-4 h-4" />;
  }
};

// Stat pill component
function StatPill({ icon: Icon, label, value, color = 'text-dark-300' }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 bg-dark-800/50 rounded-lg text-xs">
      {Icon && <Icon className={`w-3 h-3 ${color}`} />}
      <span className="text-dark-400">{label}:</span>
      <span className={`font-medium ${color}`}>{value}</span>
    </div>
  );
}

export default function ValueBetsSummaryCard({ fixtureId }) {
  const [valueBets, setValueBets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(true);
  const [expandedBets, setExpandedBets] = useState({});
  const [oddsMeta, setOddsMeta] = useState(null); // Track odds freshness
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);

  // Function to fetch data (reusable for refresh)
  const fetchAllData = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      // Fetch all probabilities and odds in parallel using Promise.allSettled
      // This ensures all requests complete even if some fail, preventing unhandled rejections
      const results = await Promise.allSettled([
        probabilityApi.getCornerProbabilities(fixtureId),
        probabilityApi.getCardProbabilities(fixtureId),
        oddsApi.getForFixture(fixtureId)
      ]);

      // Extract results, using null for failed requests
      const cornerProbs = results[0].status === 'fulfilled' ? results[0].value : null;
      const cardProbs = results[1].status === 'fulfilled' ? results[1].value : null;
      const oddsData = results[2].status === 'fulfilled' ? results[2].value : { data: null };

      // Capture odds metadata for "last updated" display
      if (oddsData?.data?.meta) {
        setOddsMeta(oddsData.data.meta);
      }
      setLastRefreshTime(new Date().toISOString());

      const allValueBets = [];

        // Parse bookmaker odds - both primary and all bookmakers
        const cornerOddsData = oddsData?.data ? parseCornerOdds(oddsData.data) : null;
        const cardOddsData = oddsData?.data ? parseCardOdds(oddsData.data) : null;
        const allCornerOddsData = oddsData?.data ? parseAllCornerOdds(oddsData.data) : null;
        const allCardOddsData = oddsData?.data ? parseAllCardOdds(oddsData.data) : null;

        // Process corner markets
        if (cornerProbs?.data?.probabilities?.totalMarkets && cornerOddsData?.odds) {
          const markets = cornerProbs.data.probabilities.totalMarkets;
          const bookmakerOdds = cornerOddsData.odds;
          const bookmaker = cornerOddsData.bookmaker;
          const { expected, homeTeamMarkets, awayTeamMarkets } = cornerProbs.data.probabilities;
          const { teamStats, fixture, enhancedFactors, modelInfo } = cornerProbs.data;

          markets.forEach(market => {
            const bmOdds = bookmakerOdds[market.line];
            if (bmOdds) {
              // Get all bookmaker odds for this line for comparison
              const allOddsForLine = allCornerOddsData?.allOdds?.[market.line] || {};

              // Check Over
              const overEV = calculateEV(market.over.probability, bmOdds.over);
              if (overEV > 0) {
                allValueBets.push({
                  marketType: 'corners',
                  selection: `Over ${market.line}`,
                  line: market.line,
                  direction: 'over',
                  probability: market.over.probability,
                  fairOdds: market.over.fairOdds,
                  bookmakerOdds: bmOdds.over,
                  bookmaker,
                  ev: overEV,
                  stats: {
                    expected: expected.total,
                    homeExpected: expected.home,
                    awayExpected: expected.away,
                    homeTeam: fixture.homeTeam.name,
                    awayTeam: fixture.awayTeam.name,
                    homeAvg: teamStats.home.corners?.average,
                    awayAvg: teamStats.away.corners?.average,
                    homeAvgFor: teamStats.home.corners?.averageFor,
                    homeAvgAgainst: teamStats.home.corners?.averageAgainst,
                    awayAvgFor: teamStats.away.corners?.averageFor,
                    awayAvgAgainst: teamStats.away.corners?.averageAgainst,
                    homeRecentForm: teamStats.home.recentForm?.corners,
                    awayRecentForm: teamStats.away.recentForm?.corners,
                    recentMatchesUsed: modelInfo?.recentMatchesUsed,
                    enhancedFactors,
                    allBookmakerOdds: allOddsForLine,
                    reasoning: `Expected ${expected.total.toFixed(1)} total corners. Line is ${market.line}, so Over requires ${Math.ceil(market.line)} or more corners. With ${(market.over.probability * 100).toFixed(1)}% probability, fair odds are ${market.over.fairOdds.toFixed(2)}. ${bookmaker} offers ${bmOdds.over.toFixed(2)}, giving +${overEV.toFixed(1)}% edge.`
                  }
                });
              }

              // Check Under
              const underEV = calculateEV(market.under.probability, bmOdds.under);
              if (underEV > 0) {
                allValueBets.push({
                  marketType: 'corners',
                  selection: `Under ${market.line}`,
                  line: market.line,
                  direction: 'under',
                  probability: market.under.probability,
                  fairOdds: market.under.fairOdds,
                  bookmakerOdds: bmOdds.under,
                  bookmaker,
                  ev: underEV,
                  stats: {
                    expected: expected.total,
                    homeExpected: expected.home,
                    awayExpected: expected.away,
                    homeTeam: fixture.homeTeam.name,
                    awayTeam: fixture.awayTeam.name,
                    homeAvg: teamStats.home.corners?.average,
                    awayAvg: teamStats.away.corners?.average,
                    homeAvgFor: teamStats.home.corners?.averageFor,
                    homeAvgAgainst: teamStats.home.corners?.averageAgainst,
                    awayAvgFor: teamStats.away.corners?.averageFor,
                    awayAvgAgainst: teamStats.away.corners?.averageAgainst,
                    homeRecentForm: teamStats.home.recentForm?.corners,
                    awayRecentForm: teamStats.away.recentForm?.corners,
                    recentMatchesUsed: modelInfo?.recentMatchesUsed,
                    enhancedFactors,
                    allBookmakerOdds: allOddsForLine,
                    reasoning: `Expected ${expected.total.toFixed(1)} total corners. Line is ${market.line}, so Under requires ${Math.floor(market.line)} or fewer corners. With ${(market.under.probability * 100).toFixed(1)}% probability, fair odds are ${market.under.fairOdds.toFixed(2)}. ${bookmaker} offers ${bmOdds.under.toFixed(2)}, giving +${underEV.toFixed(1)}% edge.`
                  }
                });
              }
            }
          });
        }

        // Process card markets
        if (cardProbs?.data?.probabilities?.totalMarkets && cardOddsData?.odds) {
          const markets = cardProbs.data.probabilities.totalMarkets;
          const bookmakerOdds = cardOddsData.odds;
          const bookmaker = cardOddsData.bookmaker;
          const { expected } = cardProbs.data.probabilities;
          const { teamStats, fixture, enhancedFactors, modelInfo } = cardProbs.data;

          markets.forEach(market => {
            const bmOdds = bookmakerOdds[market.line];
            if (bmOdds) {
              // Get all bookmaker odds for this line for comparison
              const allOddsForLine = allCardOddsData?.allOdds?.[market.line] || {};

              // Check Over
              const overEV = calculateEV(market.over.probability, bmOdds.over);
              if (overEV > 0) {
                allValueBets.push({
                  marketType: 'cards',
                  selection: `Over ${market.line}`,
                  line: market.line,
                  direction: 'over',
                  probability: market.over.probability,
                  fairOdds: market.over.fairOdds,
                  bookmakerOdds: bmOdds.over,
                  bookmaker,
                  ev: overEV,
                  stats: {
                    expected: expected.total.all,
                    expectedYellow: expected.total.yellow,
                    expectedRed: expected.total.red,
                    homeExpected: expected.home.yellow,
                    awayExpected: expected.away.yellow,
                    homeTeam: fixture.homeTeam.name,
                    awayTeam: fixture.awayTeam.name,
                    homeAvg: teamStats.home.recentForm?.yellowCards?.weighted,
                    awayAvg: teamStats.away.recentForm?.yellowCards?.weighted,
                    homeRecentForm: teamStats.home.recentForm?.yellowCards,
                    awayRecentForm: teamStats.away.recentForm?.yellowCards,
                    homeFouls: teamStats.home.recentForm?.fouls,
                    awayFouls: teamStats.away.recentForm?.fouls,
                    recentMatchesUsed: modelInfo?.recentMatchesUsed,
                    enhancedFactors,
                    allBookmakerOdds: allOddsForLine,
                    reasoning: `Expected ${expected.total.yellow.toFixed(1)} yellow cards. Line is ${market.line}, so Over requires ${Math.ceil(market.line)} or more cards. With ${(market.over.probability * 100).toFixed(1)}% probability, fair odds are ${market.over.fairOdds.toFixed(2)}. ${bookmaker} offers ${bmOdds.over.toFixed(2)}, giving +${overEV.toFixed(1)}% edge.`
                  }
                });
              }

              // Check Under
              const underEV = calculateEV(market.under.probability, bmOdds.under);
              if (underEV > 0) {
                allValueBets.push({
                  marketType: 'cards',
                  selection: `Under ${market.line}`,
                  line: market.line,
                  direction: 'under',
                  probability: market.under.probability,
                  fairOdds: market.under.fairOdds,
                  bookmakerOdds: bmOdds.under,
                  bookmaker,
                  ev: underEV,
                  stats: {
                    expected: expected.total.all,
                    expectedYellow: expected.total.yellow,
                    expectedRed: expected.total.red,
                    homeExpected: expected.home.yellow,
                    awayExpected: expected.away.yellow,
                    homeTeam: fixture.homeTeam.name,
                    awayTeam: fixture.awayTeam.name,
                    homeAvg: teamStats.home.recentForm?.yellowCards?.weighted,
                    awayAvg: teamStats.away.recentForm?.yellowCards?.weighted,
                    homeRecentForm: teamStats.home.recentForm?.yellowCards,
                    awayRecentForm: teamStats.away.recentForm?.yellowCards,
                    homeFouls: teamStats.home.recentForm?.fouls,
                    awayFouls: teamStats.away.recentForm?.fouls,
                    recentMatchesUsed: modelInfo?.recentMatchesUsed,
                    enhancedFactors,
                    allBookmakerOdds: allOddsForLine,
                    reasoning: `Expected ${expected.total.yellow.toFixed(1)} yellow cards. Line is ${market.line}, so Under requires ${Math.floor(market.line)} or fewer cards. With ${(market.under.probability * 100).toFixed(1)}% probability, fair odds are ${market.under.fairOdds.toFixed(2)}. ${bookmaker} offers ${bmOdds.under.toFixed(2)}, giving +${underEV.toFixed(1)}% edge.`
                  }
                });
              }
            }
          });
        }

        // Sort by EV descending
        allValueBets.sort((a, b) => b.ev - a.ev);
        setValueBets(allValueBets);

        // Auto-expand the first value bet
        if (allValueBets.length > 0) {
          setExpandedBets({ [`${allValueBets[0].marketType}-${allValueBets[0].selection}`]: true });
        }
      } catch (err) {
        console.error('Error fetching value bets:', err);
        setError('Failed to load value bets');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    };

  useEffect(() => {
    if (fixtureId) {
      fetchAllData(false);
    }
  }, [fixtureId]);

  // Refresh handler
  const handleRefresh = () => {
    if (!refreshing) {
      fetchAllData(true);
    }
  };

  const toggleBetExpanded = (betKey) => {
    setExpandedBets(prev => ({
      ...prev,
      [betKey]: !prev[betKey]
    }));
  };

  if (loading) {
    return (
      <div className="card p-4 animate-pulse bg-gradient-to-r from-accent-green/20 to-primary-500/20">
        <div className="h-6 bg-dark-700 rounded w-1/3 mb-4" />
        <div className="space-y-2">
          <div className="h-12 bg-dark-700 rounded w-full" />
          <div className="h-12 bg-dark-700 rounded w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-4 text-dark-400 text-sm">
        {error}
      </div>
    );
  }

  // Don't show the card if there are no value bets
  if (valueBets.length === 0) {
    return (
      <div className="card p-4 bg-dark-800/50 border border-dark-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-dark-700 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-dark-500" />
          </div>
          <div>
            <h3 className="font-bold text-dark-400">No Value Bets Found</h3>
            <p className="text-sm text-dark-500">
              No positive EV opportunities detected for this match
            </p>
          </div>
        </div>
      </div>
    );
  }

  const totalEV = valueBets.reduce((sum, bet) => sum + bet.ev, 0);
  const bestBet = valueBets[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card overflow-hidden bg-gradient-to-r from-accent-green/20 via-primary-500/10 to-accent-cyan/20 border-2 border-accent-green/50"
    >
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-3 flex-1 hover:bg-dark-800/30 -m-2 p-2 rounded-lg transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-accent-green/30 flex items-center justify-center">
            <Zap className="w-6 h-6 text-accent-green" />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-white text-lg flex items-center gap-2">
              Value Bets Found
              <span className="text-sm font-bold text-accent-green bg-accent-green/20 px-2 py-0.5 rounded-full">
                {valueBets.length}
              </span>
            </h3>
            <p className="text-sm text-dark-300">
              Best: <span className="text-accent-green font-bold">+{bestBet.ev.toFixed(1)}% EV</span>
              {' '}on {bestBet.marketType === 'corners' ? 'Corners' : 'Cards'} {bestBet.selection}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-3">
          {/* Last Updated Indicator */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <div className="text-right hidden sm:block">
                <div className="text-xs text-dark-400">Total Edge</div>
                <div className="text-lg font-bold text-accent-green">+{totalEV.toFixed(1)}%</div>
              </div>
            </div>
            {/* Odds Freshness */}
            <div className="flex items-center gap-2">
              {oddsMeta?.fetchedAt && (
                <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded ${
                  isOddsStale(oddsMeta.fetchedAt, 5)
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : 'bg-dark-700 text-dark-400'
                }`}>
                  {isOddsStale(oddsMeta.fetchedAt, 5) && (
                    <AlertTriangle className="w-3 h-3" />
                  )}
                  <Clock className="w-3 h-3" />
                  <span>Odds: {formatRelativeTime(oddsMeta.fetchedAt)}</span>
                </div>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRefresh();
                }}
                disabled={refreshing}
                className={`p-1.5 rounded-lg transition-colors ${
                  refreshing
                    ? 'bg-dark-700 text-dark-500 cursor-not-allowed'
                    : 'bg-dark-700 text-dark-300 hover:bg-dark-600 hover:text-white'
                }`}
                title="Refresh odds"
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
          <button onClick={() => setExpanded(!expanded)} className="p-1">
            {expanded ? (
              <ChevronUp className="w-5 h-5 text-dark-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-dark-400" />
            )}
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
            <div className="p-4 pt-0 space-y-3">
              {/* Value Bets List */}
              <div className="space-y-2">
                {valueBets.map((bet, index) => {
                  const betKey = `${bet.marketType}-${bet.selection}`;
                  const isExpanded = expandedBets[betKey];

                  return (
                    <motion.div
                      key={betKey}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={`rounded-xl overflow-hidden ${
                        bet.ev >= 20
                          ? 'bg-accent-green/20 border border-accent-green/50'
                          : bet.ev >= 10
                            ? 'bg-green-500/15 border border-green-500/40'
                            : 'bg-dark-800/50 border border-dark-700'
                      }`}
                    >
                      {/* Bet Header - Clickable */}
                      <button
                        onClick={() => toggleBetExpanded(betKey)}
                        className="w-full p-3 flex items-center justify-between hover:bg-dark-800/20 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {/* Market Type Icon */}
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            bet.marketType === 'corners'
                              ? 'bg-primary-500/20 text-primary-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {getMarketIcon(bet.marketType)}
                          </div>

                          {/* Bet Details */}
                          <div className="text-left">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white">
                                {bet.marketType === 'corners' ? 'Corners' : 'Cards'} {bet.selection}
                              </span>
                              {bet.direction === 'over' ? (
                                <TrendingUp className="w-4 h-4 text-accent-green" />
                              ) : (
                                <TrendingDown className="w-4 h-4 text-accent-red" />
                              )}
                            </div>
                            <div className="text-xs text-dark-400 flex items-center gap-2">
                              <span>Prob: {(bet.probability * 100).toFixed(1)}%</span>
                              <span className="text-dark-600">|</span>
                              <span>Fair: {bet.fairOdds.toFixed(2)}</span>
                              <span className="text-dark-600">|</span>
                              <span className="text-accent-green font-medium">
                                {bet.bookmaker}: {bet.bookmakerOdds.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {/* EV Badge */}
                          <div className={`px-3 py-1 rounded-lg font-bold text-sm ${getEVBadgeColor(bet.ev)}`}>
                            +{bet.ev.toFixed(1)}%
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-dark-500" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-dark-500" />
                          )}
                        </div>
                      </button>

                      {/* Expanded Stats */}
                      <AnimatePresence>
                        {isExpanded && bet.stats && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="px-3 pb-3 space-y-3 border-t border-dark-700/50 pt-3">
                              {/* Why This Is Value - Reasoning */}
                              <div className="p-3 bg-dark-900/50 rounded-lg">
                                <div className="flex items-start gap-2 mb-2">
                                  <Calculator className="w-4 h-4 text-accent-cyan mt-0.5" />
                                  <span className="text-sm font-medium text-accent-cyan">Why This Is Value</span>
                                </div>
                                <p className="text-sm text-dark-300 leading-relaxed">
                                  {bet.stats.reasoning}
                                </p>
                              </div>

                              {/* Key Stats Grid */}
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {/* Expected Value */}
                                <div className="p-2 bg-dark-800/50 rounded-lg text-center">
                                  <div className="text-lg font-bold text-primary-400">
                                    {bet.stats.expected?.toFixed(1) || '-'}
                                  </div>
                                  <div className="text-xs text-dark-500">
                                    Expected {bet.marketType === 'corners' ? 'Corners' : bet.marketType === 'team_shots' ? 'Shots' : 'Cards'}
                                  </div>
                                </div>

                                {/* Line */}
                                <div className="p-2 bg-dark-800/50 rounded-lg text-center">
                                  <div className="text-lg font-bold text-white">
                                    {bet.line}
                                  </div>
                                  <div className="text-xs text-dark-500">Line</div>
                                </div>

                                {/* Probability */}
                                <div className="p-2 bg-dark-800/50 rounded-lg text-center">
                                  <div className="text-lg font-bold text-accent-green">
                                    {(bet.probability * 100).toFixed(1)}%
                                  </div>
                                  <div className="text-xs text-dark-500">Our Probability</div>
                                </div>

                                {/* Edge */}
                                <div className="p-2 bg-accent-green/20 rounded-lg text-center">
                                  <div className="text-lg font-bold text-accent-green">
                                    +{bet.ev.toFixed(1)}%
                                  </div>
                                  <div className="text-xs text-dark-500">Edge vs {bet.bookmaker}</div>
                                </div>
                              </div>

                              {/* Team Stats */}
                              <div className="space-y-2">
                                <div className="text-xs font-medium text-dark-400 flex items-center gap-1">
                                  <BarChart3 className="w-3 h-3" /> Team Statistics
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  {/* Home Team */}
                                  <div className="p-2 bg-dark-800/30 rounded-lg">
                                    <div className="text-xs text-dark-400 mb-1">{bet.stats.homeTeam}</div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm text-dark-300">Expected:</span>
                                      <span className="text-sm font-medium text-white">
                                        {bet.stats.homeExpected?.toFixed(1) || '-'}
                                      </span>
                                    </div>
                                    {bet.stats.homeAvg && (
                                      <div className="flex items-center justify-between">
                                        <span className="text-sm text-dark-300">Season Avg:</span>
                                        <span className="text-sm font-medium text-dark-300">
                                          {bet.stats.homeAvg.toFixed(1)}
                                        </span>
                                      </div>
                                    )}
                                    {bet.marketType === 'corners' && bet.stats.homeAvgFor && (
                                      <div className="flex items-center justify-between text-xs mt-1">
                                        <span className="text-dark-500">Won/Conceded:</span>
                                        <span className="text-dark-400">
                                          {bet.stats.homeAvgFor?.toFixed(1)}/{bet.stats.homeAvgAgainst?.toFixed(1)}
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  {/* Away Team */}
                                  <div className="p-2 bg-dark-800/30 rounded-lg">
                                    <div className="text-xs text-dark-400 mb-1">{bet.stats.awayTeam}</div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm text-dark-300">Expected:</span>
                                      <span className="text-sm font-medium text-white">
                                        {bet.stats.awayExpected?.toFixed(1) || '-'}
                                      </span>
                                    </div>
                                    {bet.stats.awayAvg && (
                                      <div className="flex items-center justify-between">
                                        <span className="text-sm text-dark-300">Season Avg:</span>
                                        <span className="text-sm font-medium text-dark-300">
                                          {bet.stats.awayAvg.toFixed(1)}
                                        </span>
                                      </div>
                                    )}
                                    {bet.marketType === 'corners' && bet.stats.awayAvgFor && (
                                      <div className="flex items-center justify-between text-xs mt-1">
                                        <span className="text-dark-500">Won/Conceded:</span>
                                        <span className="text-dark-400">
                                          {bet.stats.awayAvgFor?.toFixed(1)}/{bet.stats.awayAvgAgainst?.toFixed(1)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Enhanced Factors (if any) */}
                              {bet.stats.enhancedFactors && bet.stats.enhancedFactors.reasoning &&
                               bet.stats.enhancedFactors.reasoning !== 'Standard match conditions' && (
                                <div className="p-2 bg-primary-500/10 rounded-lg border border-primary-500/20">
                                  <div className="flex items-start gap-2">
                                    <Info className="w-4 h-4 text-primary-400 mt-0.5 flex-shrink-0" />
                                    <div>
                                      <div className="text-xs font-medium text-primary-300 mb-1">Match Factors Applied</div>
                                      <p className="text-xs text-dark-300">{bet.stats.enhancedFactors.reasoning}</p>

                                      {/* Factor Pills */}
                                      {bet.stats.enhancedFactors.details && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                          {bet.stats.enhancedFactors.details.weather?.available &&
                                           bet.stats.enhancedFactors.details.weather.condition !== 'normal' && (
                                            <span className="text-xs px-2 py-0.5 bg-accent-cyan/20 text-accent-cyan rounded">
                                              {bet.stats.enhancedFactors.details.weather.description}
                                            </span>
                                          )}
                                          {bet.stats.enhancedFactors.details.h2h?.available &&
                                           bet.stats.enhancedFactors.details.h2h.totalMatches >= 3 && (
                                            <span className="text-xs px-2 py-0.5 bg-primary-500/20 text-primary-300 rounded">
                                              H2H: {bet.stats.enhancedFactors.details.h2h.description}
                                            </span>
                                          )}
                                          {bet.stats.enhancedFactors.details.importance?.available &&
                                           bet.stats.enhancedFactors.details.importance.importance !== 'normal' && (
                                            <span className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-300 rounded">
                                              {bet.stats.enhancedFactors.details.importance.importance}
                                            </span>
                                          )}
                                          {bet.stats.enhancedFactors.details.derby?.isDerby && (
                                            <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-300 rounded">
                                              {bet.stats.enhancedFactors.details.derby.derbyType}
                                            </span>
                                          )}
                                          {bet.stats.enhancedFactors.details.referee?.available &&
                                           bet.stats.enhancedFactors.details.referee.strictness !== 'average' && (
                                            <span className="text-xs px-2 py-0.5 bg-orange-500/20 text-orange-300 rounded">
                                              Ref: {bet.stats.enhancedFactors.details.referee.strictness}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Calculation Details (for team_shots) */}
                              {bet.stats.calculation && (
                                <div className="p-3 bg-dark-900/50 rounded-lg border border-dark-700/50">
                                  <div className="flex items-start gap-2 mb-2">
                                    <svg className="w-4 h-4 text-primary-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                    </svg>
                                    <span className="text-sm font-medium text-primary-400">Calculation Details</span>
                                  </div>
                                  <div className="space-y-2 text-xs">
                                    <div className="flex justify-between">
                                      <span className="text-dark-400">Model:</span>
                                      <span className="text-dark-200 font-mono">{bet.stats.calculation.model}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-dark-400">Lambda (λ):</span>
                                      <span className="text-primary-400 font-mono">{bet.stats.calculation.lambda}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-dark-400">Threshold:</span>
                                      <span className="text-dark-200 font-mono">{bet.stats.calculation.threshold}</span>
                                    </div>
                                    <div className="mt-2 pt-2 border-t border-dark-700">
                                      <span className="text-dark-500">Formula: </span>
                                      <span className="text-dark-300 font-mono text-[10px]">{bet.stats.calculation.formula}</span>
                                    </div>
                                    {bet.stats.matchesUsedHome && (
                                      <div className="flex justify-between text-dark-500">
                                        <span>Data based on:</span>
                                        <span>{bet.stats.matchesUsedHome} home / {bet.stats.matchesUsedAway} away matches</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Recent Form Stats */}
                              {(bet.stats.homeRecentForm || bet.stats.awayRecentForm) && (
                                <div className="space-y-2">
                                  <div className="text-xs font-medium text-dark-400 flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> Recent Form (Last {bet.stats.recentMatchesUsed?.home || 10} matches)
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    {/* Home Recent Form */}
                                    <div className="p-2 bg-dark-800/30 rounded-lg">
                                      <div className="text-xs text-dark-400 mb-1">{bet.stats.homeTeam}</div>
                                      {bet.stats.homeRecentForm && (
                                        <div className="space-y-1">
                                          <div className="flex justify-between text-xs">
                                            <span className="text-dark-500">Weighted Avg:</span>
                                            <span className="text-primary-400 font-medium">
                                              {bet.stats.homeRecentForm.weighted?.toFixed(1) || '-'}
                                            </span>
                                          </div>
                                          <div className="flex justify-between text-xs">
                                            <span className="text-dark-500">Simple Avg:</span>
                                            <span className="text-dark-300">
                                              {bet.stats.homeRecentForm.simple?.toFixed(1) || '-'}
                                            </span>
                                          </div>
                                          <div className="flex justify-between text-xs">
                                            <span className="text-dark-500">Last 3:</span>
                                            <span className="text-dark-300">
                                              {bet.stats.homeRecentForm.recent3?.toFixed(1) || '-'}
                                            </span>
                                          </div>
                                          {bet.stats.homeFouls && (
                                            <div className="flex justify-between text-xs border-t border-dark-700 pt-1 mt-1">
                                              <span className="text-dark-500">Fouls Avg:</span>
                                              <span className="text-orange-400">
                                                {bet.stats.homeFouls.weighted?.toFixed(1) || '-'}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    {/* Away Recent Form */}
                                    <div className="p-2 bg-dark-800/30 rounded-lg">
                                      <div className="text-xs text-dark-400 mb-1">{bet.stats.awayTeam}</div>
                                      {bet.stats.awayRecentForm && (
                                        <div className="space-y-1">
                                          <div className="flex justify-between text-xs">
                                            <span className="text-dark-500">Weighted Avg:</span>
                                            <span className="text-primary-400 font-medium">
                                              {bet.stats.awayRecentForm.weighted?.toFixed(1) || '-'}
                                            </span>
                                          </div>
                                          <div className="flex justify-between text-xs">
                                            <span className="text-dark-500">Simple Avg:</span>
                                            <span className="text-dark-300">
                                              {bet.stats.awayRecentForm.simple?.toFixed(1) || '-'}
                                            </span>
                                          </div>
                                          <div className="flex justify-between text-xs">
                                            <span className="text-dark-500">Last 3:</span>
                                            <span className="text-dark-300">
                                              {bet.stats.awayRecentForm.recent3?.toFixed(1) || '-'}
                                            </span>
                                          </div>
                                          {bet.stats.awayFouls && (
                                            <div className="flex justify-between text-xs border-t border-dark-700 pt-1 mt-1">
                                              <span className="text-dark-500">Fouls Avg:</span>
                                              <span className="text-orange-400">
                                                {bet.stats.awayFouls.weighted?.toFixed(1) || '-'}
                                              </span>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Multi-Bookmaker Odds Comparison */}
                              {bet.stats.allBookmakerOdds && Object.keys(bet.stats.allBookmakerOdds).length > 1 && (
                                <div className="space-y-2">
                                  <div className="text-xs font-medium text-dark-400 flex items-center gap-1">
                                    <Users className="w-3 h-3" /> Bookmaker Comparison
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="border-b border-dark-700">
                                          <th className="text-left py-1 px-2 text-dark-500">Bookmaker</th>
                                          <th className="text-right py-1 px-2 text-dark-500">{bet.direction === 'over' ? 'Over' : 'Under'}</th>
                                          <th className="text-right py-1 px-2 text-dark-500">EV</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {Object.entries(bet.stats.allBookmakerOdds)
                                          .map(([bmName, odds]) => {
                                            const oddValue = bet.direction === 'over' ? odds.over : odds.under;
                                            const ev = calculateEV(bet.probability, oddValue);
                                            return { bmName, oddValue, ev };
                                          })
                                          .sort((a, b) => b.ev - a.ev)
                                          .map(({ bmName, oddValue, ev }) => {
                                            const isBest = ev === Math.max(...Object.entries(bet.stats.allBookmakerOdds)
                                              .map(([, o]) => calculateEV(bet.probability, bet.direction === 'over' ? o.over : o.under)));
                                            const isSelected = bmName === bet.bookmaker;

                                            return (
                                              <tr
                                                key={bmName}
                                                className={`border-b border-dark-800 ${isBest ? 'bg-accent-green/10' : ''} ${isSelected ? 'font-medium' : ''}`}
                                              >
                                                <td className={`py-1.5 px-2 ${isSelected ? 'text-accent-green' : 'text-dark-300'}`}>
                                                  {bmName}
                                                  {isBest && <span className="ml-1 text-accent-green">★</span>}
                                                </td>
                                                <td className="text-right py-1.5 px-2 text-white">{oddValue?.toFixed(2)}</td>
                                                <td className={`text-right py-1.5 px-2 ${ev > 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                                                  {ev > 0 ? '+' : ''}{ev?.toFixed(1)}%
                                                </td>
                                              </tr>
                                            );
                                          })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* Odds Comparison (Primary) */}
                              <div className="grid grid-cols-3 gap-2">
                                <div className="p-2 bg-dark-800/30 rounded-lg text-center">
                                  <div className="text-sm font-bold text-dark-300">{bet.fairOdds.toFixed(2)}</div>
                                  <div className="text-xs text-dark-500">Fair Odds</div>
                                </div>
                                <div className="p-2 bg-accent-green/20 rounded-lg text-center">
                                  <div className="text-sm font-bold text-accent-green">{bet.bookmakerOdds.toFixed(2)}</div>
                                  <div className="text-xs text-dark-500">{bet.bookmaker}</div>
                                </div>
                                <div className="p-2 bg-dark-800/30 rounded-lg text-center">
                                  <div className="text-sm font-bold text-yellow-400">
                                    +{((bet.bookmakerOdds / bet.fairOdds - 1) * 100).toFixed(1)}%
                                  </div>
                                  <div className="text-xs text-dark-500">Odds Edge</div>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="text-center p-2 bg-dark-800/30 rounded-lg">
                  <div className="text-lg font-bold text-accent-green">{valueBets.length}</div>
                  <div className="text-xs text-dark-400">Value Bets</div>
                </div>
                <div className="text-center p-2 bg-dark-800/30 rounded-lg">
                  <div className="text-lg font-bold text-accent-green">+{bestBet.ev.toFixed(1)}%</div>
                  <div className="text-xs text-dark-400">Best EV</div>
                </div>
                <div className="text-center p-2 bg-dark-800/30 rounded-lg">
                  <div className="text-lg font-bold text-white">
                    {valueBets.filter(b => b.marketType === 'corners').length}/
                    {valueBets.filter(b => b.marketType === 'cards').length}
                  </div>
                  <div className="text-xs text-dark-400">Corners/Cards</div>
                </div>
              </div>

              {/* Tip */}
              <div className="p-3 bg-dark-800/30 rounded-lg border border-dark-700 text-xs text-dark-400">
                <strong className="text-dark-300">How EV Works:</strong> EV = (Probability × Odds) - 1.
                If our calculated probability is 85% and the bookmaker offers 1.80, EV = (0.85 × 1.80) - 1 = +53%.
                This means on average, you'd profit $53 per $100 wagered long-term.
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
