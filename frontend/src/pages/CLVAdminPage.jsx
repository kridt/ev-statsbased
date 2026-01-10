import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  Target,
  BarChart3,
  RefreshCw,
  Filter,
  ChevronDown,
  ChevronUp,
  AlertCircle
} from 'lucide-react';
import { clvApi } from '../services/api';

// Stats Card Component
function StatCard({ title, value, subtitle, icon: Icon, color = 'primary', trend }) {
  const colorClasses = {
    primary: 'from-primary-500/20 to-primary-600/10 border-primary-500/30',
    green: 'from-green-500/20 to-green-600/10 border-green-500/30',
    yellow: 'from-yellow-500/20 to-yellow-600/10 border-yellow-500/30',
    red: 'from-red-500/20 to-red-600/10 border-red-500/30',
    cyan: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30',
  };

  const iconColors = {
    primary: 'text-primary-400',
    green: 'text-green-400',
    yellow: 'text-yellow-400',
    red: 'text-red-400',
    cyan: 'text-cyan-400',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-gradient-to-br ${colorClasses[color]} border rounded-xl p-5`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-dark-400 text-sm mb-1">{title}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {subtitle && <p className="text-dark-500 text-xs mt-1">{subtitle}</p>}
        </div>
        <div className={`p-2 rounded-lg bg-dark-800/50 ${iconColors[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {trend !== undefined && (
        <div className={`flex items-center gap-1 mt-2 text-sm ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {trend >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          <span>{trend >= 0 ? '+' : ''}{trend.toFixed(2)}%</span>
        </div>
      )}
    </motion.div>
  );
}

// Grade Badge Component
function GradeBadge({ grade }) {
  const colors = {
    A: 'bg-green-500/20 text-green-400 border-green-500/30',
    B: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    C: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    D: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold border ${colors[grade] || colors.C}`}>
      {grade}
    </span>
  );
}

// Outcome Badge Component
function OutcomeBadge({ outcome }) {
  if (!outcome) return <span className="text-dark-500 text-sm">Pending</span>;

  const colors = {
    win: 'bg-green-500/20 text-green-400',
    loss: 'bg-red-500/20 text-red-400',
    push: 'bg-yellow-500/20 text-yellow-400',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold ${colors[outcome]}`}>
      {outcome.toUpperCase()}
    </span>
  );
}

// Bet Row Component
function BetRow({ bet, expanded, onToggle }) {
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatOdds = (odds) => {
    if (!odds) return '-';
    return odds.toFixed(2);
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined) return '-';
    return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`;
  };

  return (
    <>
      <tr
        className="border-b border-dark-700/50 hover:bg-dark-800/30 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronUp className="w-4 h-4 text-dark-500" /> : <ChevronDown className="w-4 h-4 text-dark-500" />}
            <div>
              <p className="text-white font-medium text-sm">{bet.fixtureName}</p>
              <p className="text-dark-500 text-xs">{formatDate(bet.matchStartTime)}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <p className="text-white text-sm">{bet.selectionName || bet.selection}</p>
          <p className="text-dark-500 text-xs">{bet.market}</p>
        </td>
        <td className="px-4 py-3 text-center">
          <GradeBadge grade={bet.confidence} />
        </td>
        <td className="px-4 py-3 text-right">
          <span className="text-primary-400 font-mono">{formatOdds(bet.openingOdds)}</span>
        </td>
        <td className="px-4 py-3 text-right">
          <span className={`font-mono ${bet.closingOdds ? 'text-white' : 'text-dark-500'}`}>
            {formatOdds(bet.closingOdds)}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <span className={`font-mono ${
            bet.clvPercent > 0 ? 'text-green-400' :
            bet.clvPercent < 0 ? 'text-red-400' : 'text-dark-500'
          }`}>
            {bet.clvPercent !== null ? `${bet.clvPercent > 0 ? '+' : ''}${bet.clvPercent.toFixed(2)}%` : '-'}
          </span>
        </td>
        <td className="px-4 py-3 text-center">
          <OutcomeBadge outcome={bet.outcome} />
        </td>
      </tr>
      {expanded && (
        <tr className="bg-dark-800/20">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-dark-500">Model Probability</p>
                <p className="text-white">{formatPercent(bet.modelProbability)}</p>
              </div>
              <div>
                <p className="text-dark-500">Fair Odds</p>
                <p className="text-white">{formatOdds(bet.modelFairOdds)}</p>
              </div>
              <div>
                <p className="text-dark-500">Model Edge</p>
                <p className="text-white">{formatPercent(bet.modelEdge)}</p>
              </div>
              <div>
                <p className="text-dark-500">Bookmaker</p>
                <p className="text-white">{bet.openingBookmaker || '-'}</p>
              </div>
              <div>
                <p className="text-dark-500">Bet Type</p>
                <p className="text-white capitalize">{bet.betType || '-'}</p>
              </div>
              <div>
                <p className="text-dark-500">Line</p>
                <p className="text-white">{bet.line || '-'}</p>
              </div>
              <div>
                <p className="text-dark-500">Recorded At</p>
                <p className="text-white">{formatDate(bet.recordedAt)}</p>
              </div>
              <div>
                <p className="text-dark-500">Beat Closing Line</p>
                <p className={bet.beatClosingLine ? 'text-green-400' : bet.beatClosingLine === false ? 'text-red-400' : 'text-dark-500'}>
                  {bet.beatClosingLine === true ? 'Yes' : bet.beatClosingLine === false ? 'No' : '-'}
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function CLVAdminPage() {
  const [stats, setStats] = useState(null);
  const [pendingBets, setPendingBets] = useState([]);
  const [completedBets, setCompletedBets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedBets, setExpandedBets] = useState(new Set());
  const [activeTab, setActiveTab] = useState('pending');
  const [marketFilter, setMarketFilter] = useState('all');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, pendingRes, completedRes] = await Promise.all([
        clvApi.getStats(),
        clvApi.getPending(),
        clvApi.getCompleted(100),
      ]);

      setStats(statsRes.data);
      setPendingBets(pendingRes.data || []);
      setCompletedBets(completedRes.data || []);
    } catch (err) {
      console.error('Error fetching CLV data:', err);
      setError(err.message || 'Failed to fetch CLV data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh every 60 seconds
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  const toggleBetExpanded = (betId) => {
    setExpandedBets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(betId)) {
        newSet.delete(betId);
      } else {
        newSet.add(betId);
      }
      return newSet;
    });
  };

  // Get unique markets for filter
  const allBets = [...pendingBets, ...completedBets];
  const uniqueMarkets = [...new Set(allBets.map(b => b.betType).filter(Boolean))];

  // Filter bets
  const filterBets = (bets) => {
    if (marketFilter === 'all') return bets;
    return bets.filter(b => b.betType === marketFilter);
  };

  const filteredPending = filterBets(pendingBets);
  const filteredCompleted = filterBets(completedBets);
  const displayBets = activeTab === 'pending' ? filteredPending : filteredCompleted;

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-primary-400 animate-spin mx-auto mb-4" />
          <p className="text-dark-400">Loading CLV data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold text-gradient">CLV Tracking</h1>
          <p className="text-dark-400 mt-1">Monitor closing line value performance</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-dark-800 hover:bg-dark-700 rounded-lg text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </motion.div>

      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-center gap-3"
        >
          <AlertCircle className="w-5 h-5 text-red-400" />
          <p className="text-red-400">{error}</p>
        </motion.div>
      )}

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            title="Total Bets"
            value={stats.totalBets}
            icon={BarChart3}
            color="primary"
          />
          <StatCard
            title="Pending"
            value={stats.pendingBets}
            icon={Clock}
            color="yellow"
          />
          <StatCard
            title="Settled"
            value={stats.settledBets}
            icon={CheckCircle}
            color="green"
          />
          <StatCard
            title="Win Rate"
            value={`${stats.winRate?.toFixed(1) || 0}%`}
            subtitle={`${stats.wins}W - ${stats.losses}L`}
            icon={Target}
            color="cyan"
          />
          <StatCard
            title="Avg CLV"
            value={`${stats.avgCLV >= 0 ? '+' : ''}${stats.avgCLV?.toFixed(2) || 0}%`}
            icon={TrendingUp}
            color={stats.avgCLV >= 0 ? 'green' : 'red'}
          />
          <StatCard
            title="CLV Hit Rate"
            value={`${stats.clvHitRate?.toFixed(1) || 0}%`}
            subtitle="Beat closing line"
            icon={Target}
            color={stats.clvHitRate >= 50 ? 'green' : 'yellow'}
          />
        </div>
      )}

      {/* Grade Breakdown */}
      {stats && stats.settledBets > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-5"
        >
          <h3 className="text-lg font-bold text-white mb-4">Performance by Grade</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['A', 'B', 'C', 'D'].map(grade => {
              const gradeData = stats.byGrade?.[grade] || { bets: 0, avgCLV: 0, winRate: 0 };
              return (
                <div key={grade} className="bg-dark-800/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <GradeBadge grade={grade} />
                    <span className="text-dark-500 text-sm">{gradeData.bets} bets</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-dark-400">Win Rate</span>
                      <span className="text-white">{gradeData.winRate?.toFixed(1) || 0}%</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-dark-400">Avg CLV</span>
                      <span className={gradeData.avgCLV >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {gradeData.avgCLV >= 0 ? '+' : ''}{gradeData.avgCLV?.toFixed(2) || 0}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Bets Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card overflow-hidden"
      >
        {/* Tabs and Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-b border-dark-700">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'pending'
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                  : 'text-dark-400 hover:text-white'
              }`}
            >
              Pending ({filteredPending.length})
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'completed'
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                  : 'text-dark-400 hover:text-white'
              }`}
            >
              Completed ({filteredCompleted.length})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-dark-500" />
            <select
              value={marketFilter}
              onChange={(e) => setMarketFilter(e.target.value)}
              className="bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-primary-500"
            >
              <option value="all">All Markets</option>
              {uniqueMarkets.map(market => (
                <option key={market} value={market} className="capitalize">
                  {market}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-dark-400 text-sm font-medium">Match</th>
                <th className="px-4 py-3 text-left text-dark-400 text-sm font-medium">Selection</th>
                <th className="px-4 py-3 text-center text-dark-400 text-sm font-medium">Grade</th>
                <th className="px-4 py-3 text-right text-dark-400 text-sm font-medium">Open</th>
                <th className="px-4 py-3 text-right text-dark-400 text-sm font-medium">Close</th>
                <th className="px-4 py-3 text-right text-dark-400 text-sm font-medium">CLV</th>
                <th className="px-4 py-3 text-center text-dark-400 text-sm font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {displayBets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Clock className="w-12 h-12 text-dark-600 mx-auto mb-3" />
                    <p className="text-dark-400">No {activeTab} bets found</p>
                  </td>
                </tr>
              ) : (
                displayBets.map(bet => (
                  <BetRow
                    key={bet.id}
                    bet={bet}
                    expanded={expandedBets.has(bet.id)}
                    onToggle={() => toggleBetExpanded(bet.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
}
