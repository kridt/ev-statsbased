import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import {
  ArrowLeft, Star, MapPin, Calendar, Clock, Users,
  Activity, BarChart3, List, Swords, TrendingUp, User, Target, Shield,
  Percent, CornerUpRight
} from 'lucide-react';

import { fixturesApi } from '../services/api';
import CornersProbabilityCard from '../components/CornersProbabilityCard';
import PlayerShotsProbabilityCard from '../components/PlayerShotsProbabilityCard';
import CardsProbabilityCard from '../components/CardsProbabilityCard';
import ValueBetsSummaryCard from '../components/ValueBetsSummaryCard';
import { useSocket } from '../context/SocketContext';
import { useFavorites } from '../context/FavoritesContext';
import { useToast } from '../context/ToastContext';
import LoadingSpinner from '../components/LoadingSpinner';

import StatBar from '../components/StatBar';

const CET_TIMEZONE = 'Europe/Berlin';

// Helper to parse UTC date string (SportMonks may not include Z suffix)
const parseUTCDate = (dateStr) => {
  if (!dateStr) return null;
  // If the string doesn't have timezone info, treat it as UTC
  if (!dateStr.includes('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
    return new Date(dateStr + 'Z');
  }
  return new Date(dateStr);
};

const tabs = [
  { id: 'statistics', label: 'Match Stats', icon: BarChart3 },
  { id: 'players', label: 'Player Stats', icon: User },
  { id: 'probability', label: 'Probabilities', icon: Percent },
  { id: 'events', label: 'Timeline', icon: List },
  { id: 'lineups', label: 'Lineups', icon: Users },
  { id: 'h2h', label: 'H2H', icon: Swords },
];

// Statistic categories for organization
const STAT_CATEGORIES = {
  'Possession & Passing': [
    'Ball Possession', 'Passes', 'Accurate Passes', 'Pass Accuracy',
    'Long Balls', 'Accurate Long Balls', 'Crosses', 'Accurate Crosses'
  ],
  'Attacking': [
    'Total Shots', 'Shots On Target', 'Shots Off Target', 'Blocked Shots',
    'Shots Inside Box', 'Shots Outside Box', 'Big Chances', 'Big Chances Missed',
    'Hit Woodwork', 'Attacks', 'Dangerous Attacks'
  ],
  'Defending': [
    'Tackles', 'Interceptions', 'Clearances', 'Blocked Shots',
    'Goalkeeper Saves', 'Goalkeeper Punches', 'Duels Won', 'Aerial Duels Won'
  ],
  'Discipline': [
    'Fouls', 'Yellow Cards', 'Red Cards', 'Offsides'
  ],
  'Set Pieces': [
    'Corners', 'Free Kicks', 'Throw Ins', 'Goal Kicks', 'Penalties'
  ],
};

// Player stat columns configuration
const PLAYER_STAT_COLUMNS = [
  { key: 'rating', label: 'Rating', highlight: true },
  { key: 'minutes_played', label: 'Min' },
  { key: 'goals', label: 'G', highlight: true },
  { key: 'assists', label: 'A', highlight: true },
  { key: 'shots_total', label: 'Shots' },
  { key: 'shots_on_target', label: 'On Target' },
  { key: 'passes', label: 'Passes' },
  { key: 'passes_accuracy', label: 'Pass %' },
  { key: 'key_passes', label: 'Key Pass' },
  { key: 'dribbles_attempts', label: 'Dribbles' },
  { key: 'dribbles_success', label: 'Drib. Won' },
  { key: 'duels_total', label: 'Duels' },
  { key: 'duels_won', label: 'Duels Won' },
  { key: 'tackles', label: 'Tackles' },
  { key: 'interceptions', label: 'Int' },
  { key: 'clearances', label: 'Clear' },
  { key: 'fouls_committed', label: 'Fouls' },
  { key: 'fouls_drawn', label: 'Fouled' },
];

export default function MatchPage() {
  const { id } = useParams();
  const [fixture, setFixture] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('statistics');
  const [h2hData, setH2hData] = useState([]);
  const [loadingH2H, setLoadingH2H] = useState(false);
  const [h2hFetched, setH2hFetched] = useState(false); // Track if H2H was already fetched
  const [selectedTeamStats, setSelectedTeamStats] = useState('all'); // 'all', 'home', 'away'

  const { subscribeMatch, unsubscribeMatch, socket } = useSocket();
  const { isFavoriteMatch, toggleFavoriteMatch } = useFavorites();
  const { showFavoriteAdded, showFavoriteRemoved } = useToast();

  // Fetch fixture details
  useEffect(() => {
    const fetchFixture = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fixturesApi.getById(id);
        setFixture(response.data);
      } catch (err) {
        console.error('Error fetching fixture:', err);
        setError('Failed to load match details.');
      } finally {
        setLoading(false);
      }
    };

    fetchFixture();
  }, [id]);

  // Subscribe to match updates
  useEffect(() => {
    subscribeMatch(id);
    return () => unsubscribeMatch(id);
  }, [id, subscribeMatch, unsubscribeMatch]);

  // Listen for match updates
  useEffect(() => {
    if (!socket) return;

    const handleMatchUpdate = (data) => {
      if (data.fixture?.id === parseInt(id)) {
        setFixture(data.fixture);
      }
    };

    socket.on('match:goal', handleMatchUpdate);
    socket.on('match:update', handleMatchUpdate);

    return () => {
      socket.off('match:goal', handleMatchUpdate);
      socket.off('match:update', handleMatchUpdate);
    };
  }, [socket, id]);

  // Fetch H2H data when tab is selected
  useEffect(() => {
    // Only fetch if tab is selected, fixture exists, and we haven't already fetched
    if (activeTab === 'h2h' && fixture && !h2hFetched) {
      const fetchH2H = async () => {
        const homeTeam = fixture.participants?.find(p => p.meta?.location === 'home');
        const awayTeam = fixture.participants?.find(p => p.meta?.location === 'away');
        if (!homeTeam || !awayTeam) return;

        setLoadingH2H(true);
        try {
          const response = await fixturesApi.getH2H(homeTeam.id, awayTeam.id);
          setH2hData(response.data || []);
        } catch (err) {
          console.error('Error fetching H2H:', err);
        } finally {
          setLoadingH2H(false);
          setH2hFetched(true); // Mark as fetched even if result is empty
        }
      };

      fetchH2H();
    }
  }, [activeTab, fixture, h2hFetched]);

  if (loading) return <LoadingSpinner text="Loading match details..." />;
  if (error) return (
    <div className="text-center py-12">
      <p className="text-accent-red mb-4">{error}</p>
      <Link to="/" className="btn-primary">Back to Home</Link>
    </div>
  );
  if (!fixture) return null;

  const homeTeam = fixture.participants?.find(p => p.meta?.location === 'home');
  const awayTeam = fixture.participants?.find(p => p.meta?.location === 'away');

  // Safety check: if participants data is missing or malformed, show error
  if (!homeTeam || !awayTeam) {
    return (
      <div className="text-center py-12">
        <p className="text-accent-red mb-4">Match data is incomplete. Unable to display teams.</p>
        <Link to="/" className="btn-primary">Back to Home</Link>
      </div>
    );
  }

  const scores = fixture.scores || [];
  const homeScore = scores.find(s => s.description === 'CURRENT' && s.score?.participant === 'home')?.score?.goals ?? 0;
  const awayScore = scores.find(s => s.description === 'CURRENT' && s.score?.participant === 'away')?.score?.goals ?? 0;

  const state = fixture.state?.state || fixture.state?.short_name || 'NS';
  const isLive = ['INPLAY_1ST_HALF', 'INPLAY_2ND_HALF', 'HT', 'BREAK', 'ET', 'PEN_LIVE', 'LIVE'].includes(state);
  const isFinished = ['FT', 'FT_PEN', 'AET'].includes(state);
  const matchMinute = fixture.state?.minute || '';

  const matchData = {
    id: fixture.id,
    homeTeam: homeTeam?.name,
    awayTeam: awayTeam?.name,
    league: fixture.league?.name,
  };

  // Process statistics into categories
  const statistics = fixture.statistics || [];
  const processedStats = processStatistics(statistics, homeTeam?.id, awayTeam?.id);

  // Process events
  const events = fixture.events || [];
  const sortedEvents = [...events].sort((a, b) => (a.minute || 0) - (b.minute || 0));

  // Process lineups with player stats
  const lineups = fixture.lineups || [];
  const homeLineup = lineups.filter(p => p.team_id === homeTeam?.id);
  const awayLineup = lineups.filter(p => p.team_id === awayTeam?.id);

  return (
    <div className="space-y-6">
      {/* Back button and favorite */}
      <div className="flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2 text-dark-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to matches</span>
        </Link>
        <button
          onClick={() => {
            const wasAlreadyFavorite = isFavoriteMatch(fixture.id);
            toggleFavoriteMatch(matchData);
            const matchName = `${homeTeam?.name || 'Home'} vs ${awayTeam?.name || 'Away'}`;
            if (wasAlreadyFavorite) {
              showFavoriteRemoved(matchName);
            } else {
              showFavoriteAdded(matchName);
            }
          }}
          className={`p-2 rounded-xl ${
            isFavoriteMatch(fixture.id)
              ? 'bg-accent-yellow/20 text-accent-yellow'
              : 'bg-dark-800 text-dark-400 hover:text-white'
          } transition-colors`}
        >
          <Star className={`w-5 h-5 ${isFavoriteMatch(fixture.id) ? 'fill-current' : ''}`} />
        </button>
      </div>

      {/* Match header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-6"
      >
        {/* League info */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {fixture.league?.image_path && (
            <img src={fixture.league.image_path} alt="" className="w-6 h-6" />
          )}
          <Link
            to={`/league/${fixture.league?.id}`}
            className="text-dark-400 hover:text-primary-400 transition-colors"
          >
            {fixture.league?.name}
          </Link>
        </div>

        {/* Teams and score */}
        <div className="flex items-center justify-center gap-8">
          {/* Home team */}
          <Link
            to={`/team/${homeTeam?.id}`}
            className="flex flex-col items-center gap-3 hover:opacity-80 transition-opacity"
          >
            {homeTeam?.image_path && (
              <motion.img
                whileHover={{ scale: 1.1 }}
                src={homeTeam.image_path}
                alt={homeTeam.name}
                className="w-20 h-20 object-contain"
              />
            )}
            <span className="text-lg font-bold text-white text-center max-w-[120px]">
              {homeTeam?.name}
            </span>
          </Link>

          {/* Score */}
          <div className="flex flex-col items-center">
            {isLive || isFinished ? (
              <>
                <div className="flex items-center gap-4 text-5xl font-bold">
                  <motion.span
                    key={`home-${homeScore}`}
                    initial={{ scale: 1.3 }}
                    animate={{ scale: 1 }}
                    className={homeScore > awayScore ? 'text-accent-green' : 'text-white'}
                  >
                    {homeScore}
                  </motion.span>
                  <span className="text-dark-600">:</span>
                  <motion.span
                    key={`away-${awayScore}`}
                    initial={{ scale: 1.3 }}
                    animate={{ scale: 1 }}
                    className={awayScore > homeScore ? 'text-accent-green' : 'text-white'}
                  >
                    {awayScore}
                  </motion.span>
                </div>
                {isLive && matchMinute && (
                  <div className="flex items-center gap-2 mt-2 text-accent-red">
                    <span className="w-3 h-3 bg-accent-red rounded-full animate-pulse" />
                    <span className="font-bold text-lg">{matchMinute}'</span>
                  </div>
                )}
                {isFinished && (
                  <span className="mt-2 text-dark-400 font-medium">Full Time</span>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2 text-2xl text-dark-300">
                  <Clock className="w-6 h-6" />
                  {fixture.starting_at && formatInTimeZone(parseUTCDate(fixture.starting_at), CET_TIMEZONE, 'HH:mm')}
                </div>
                <span className="text-dark-500 mt-1">
                  {fixture.starting_at && formatInTimeZone(parseUTCDate(fixture.starting_at), CET_TIMEZONE, 'MMM d, yyyy')}
                </span>
              </div>
            )}
          </div>

          {/* Away team */}
          <Link
            to={`/team/${awayTeam?.id}`}
            className="flex flex-col items-center gap-3 hover:opacity-80 transition-opacity"
          >
            {awayTeam?.image_path && (
              <motion.img
                whileHover={{ scale: 1.1 }}
                src={awayTeam.image_path}
                alt={awayTeam.name}
                className="w-20 h-20 object-contain"
              />
            )}
            <span className="text-lg font-bold text-white text-center max-w-[120px]">
              {awayTeam?.name}
            </span>
          </Link>
        </div>

        {/* Match info */}
        <div className="flex items-center justify-center gap-6 mt-6 text-sm text-dark-400">
          {fixture.venue && (
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              <span>{fixture.venue.name}</span>
            </div>
          )}
          {fixture.starting_at && (
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>{formatInTimeZone(parseUTCDate(fixture.starting_at), CET_TIMEZONE, 'MMMM d, yyyy')}</span>
            </div>
          )}
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-primary-500 text-white'
                : 'bg-dark-800/50 text-dark-400 hover:text-white hover:bg-dark-800'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          {activeTab === 'statistics' && (
            <DeepStatisticsTab
              stats={processedStats}
              homeTeam={homeTeam}
              awayTeam={awayTeam}
            />
          )}
          {activeTab === 'players' && (
            <PlayerStatisticsTab
              homeLineup={homeLineup}
              awayLineup={awayLineup}
              homeTeam={homeTeam}
              awayTeam={awayTeam}
              isMatchFinished={isFinished}
            />
          )}
          {activeTab === 'events' && (
            <EventsTab events={sortedEvents} homeTeam={homeTeam} awayTeam={awayTeam} />
          )}
          {activeTab === 'lineups' && (
            <LineupsTab
              homeLineup={homeLineup}
              awayLineup={awayLineup}
              homeTeam={homeTeam}
              awayTeam={awayTeam}
              formations={fixture.formations}
            />
          )}
          {activeTab === 'probability' && (
            <ProbabilityTab fixtureId={id} />
          )}
          {activeTab === 'h2h' && (
            <H2HTab matches={h2hData} loading={loadingH2H} homeTeam={homeTeam} awayTeam={awayTeam} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// Helper function to process statistics
function processStatistics(statistics, homeTeamId, awayTeamId) {
  const processed = {};

  statistics.forEach(stat => {
    const typeName = stat.type?.name || stat.type?.developer_name || 'Unknown';
    const value = stat.data?.value ?? stat.value ?? 0;
    const location = stat.location || (stat.participant_id === homeTeamId ? 'home' : 'away');

    if (!processed[typeName]) {
      processed[typeName] = { name: typeName, home: 0, away: 0 };
    }

    if (location === 'home') {
      processed[typeName].home = value;
    } else {
      processed[typeName].away = value;
    }
  });

  return processed;
}

// Deep Statistics Tab Component
function DeepStatisticsTab({ stats, homeTeam, awayTeam }) {
  const [expandedCategories, setExpandedCategories] = useState(
    Object.keys(STAT_CATEGORIES).reduce((acc, cat) => ({ ...acc, [cat]: true }), {})
  );

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  // Get all stats
  const allStatNames = Object.keys(stats);

  // Organize stats by category
  const organizedStats = {};
  const uncategorized = [];

  Object.entries(STAT_CATEGORIES).forEach(([category, statNames]) => {
    organizedStats[category] = [];
    statNames.forEach(name => {
      const matchingStat = allStatNames.find(s =>
        s.toLowerCase().includes(name.toLowerCase()) ||
        name.toLowerCase().includes(s.toLowerCase())
      );
      if (matchingStat && stats[matchingStat]) {
        organizedStats[category].push(stats[matchingStat]);
      }
    });
  });

  // Find uncategorized stats
  const categorizedNames = Object.values(STAT_CATEGORIES).flat();
  allStatNames.forEach(name => {
    const isCategorized = categorizedNames.some(catName =>
      name.toLowerCase().includes(catName.toLowerCase()) ||
      catName.toLowerCase().includes(name.toLowerCase())
    );
    if (!isCategorized) {
      uncategorized.push(stats[name]);
    }
  });

  if (uncategorized.length > 0) {
    organizedStats['Other Statistics'] = uncategorized;
  }

  if (Object.keys(stats).length === 0) {
    return (
      <div className="card p-8 text-center">
        <BarChart3 className="w-16 h-16 text-dark-600 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">Statistics Not Available</h3>
        <p className="text-dark-400">Match statistics will be available once the game starts.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Team legend */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {homeTeam?.image_path && <img src={homeTeam.image_path} alt="" className="w-8 h-8" />}
            <span className="font-bold text-white">{homeTeam?.name}</span>
            <div className="w-4 h-4 bg-primary-500 rounded" />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 bg-accent-purple rounded" />
            <span className="font-bold text-white">{awayTeam?.name}</span>
            {awayTeam?.image_path && <img src={awayTeam.image_path} alt="" className="w-8 h-8" />}
          </div>
        </div>
      </div>

      {/* Stats by category */}
      {Object.entries(organizedStats).map(([category, categoryStats]) => {
        if (categoryStats.length === 0) return null;

        return (
          <motion.div
            key={category}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="card overflow-hidden"
          >
            <button
              onClick={() => toggleCategory(category)}
              className="w-full flex items-center justify-between p-4 bg-dark-800/50 hover:bg-dark-800 transition-colors"
            >
              <div className="flex items-center gap-2">
                {category === 'Attacking' && <Target className="w-5 h-5 text-accent-red" />}
                {category === 'Defending' && <Shield className="w-5 h-5 text-accent-cyan" />}
                {category === 'Possession & Passing' && <Activity className="w-5 h-5 text-accent-green" />}
                {category === 'Discipline' && <div className="w-5 h-5 bg-accent-yellow rounded" />}
                {category === 'Set Pieces' && <div className="w-5 h-5 text-accent-orange">SP</div>}
                <h3 className="font-bold text-white">{category}</h3>
                <span className="text-xs text-dark-500 bg-dark-700 px-2 py-0.5 rounded">
                  {categoryStats.length}
                </span>
              </div>
              <motion.div
                animate={{ rotate: expandedCategories[category] ? 180 : 0 }}
                className="text-dark-400"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </motion.div>
            </button>

            <AnimatePresence>
              {expandedCategories[category] && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="p-4 space-y-4"
                >
                  {categoryStats.map((stat, index) => (
                    <motion.div
                      key={stat.name}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <StatBar
                        homeValue={stat.home}
                        awayValue={stat.away}
                        label={stat.name}
                        showPercentage={stat.name?.toLowerCase().includes('possession') || stat.name?.toLowerCase().includes('accuracy')}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}

// Season stat columns for pre-match squad view
const SEASON_STAT_COLUMNS = [
  { key: 'appearances', label: 'Apps', highlight: false },
  { key: 'goals', label: 'G', highlight: true },
  { key: 'assists', label: 'A', highlight: true },
  { key: 'minutes_per_match', label: 'Min/M', isAverage: true },
  { key: 'shots_per_match', label: 'Sh/M', isAverage: true },
  { key: 'shots_on_target_per_match', label: 'SoT/M', isAverage: true },
  { key: 'yellowcards', label: 'YC' },
  { key: 'redcards', label: 'RC' },
  { key: 'rating', label: 'Rating', highlight: true },
  { key: 'passes', label: 'Passes' },
  { key: 'passes_accuracy', label: 'Pass %' },
  { key: 'dribbles', label: 'Dribbles' },
  { key: 'tackles', label: 'Tackles' },
  { key: 'interceptions', label: 'Int' },
];

// Stats period options
const STATS_PERIODS = [
  { id: 'current', label: 'Current Season', description: 'Stats from current season only' },
  { id: 'last10', label: 'Last 10 Matches', description: 'Estimated from recent form' },
  { id: 'last20', label: 'Last 20 Matches', description: 'Estimated from recent games' },
  { id: 'season2', label: 'Last 2 Seasons', description: 'Combined stats from 2 seasons' },
  { id: 'career', label: 'Career Total', description: 'All-time statistics' },
];

// Period selector component for stats filtering
function StatsPeriodSelector({ statsPeriod, setStatsPeriod }) {
  const [isOpen, setIsOpen] = useState(false);
  const currentPeriod = STATS_PERIODS.find(p => p.id === statsPeriod);

  return (
    <div className="flex justify-center my-4">
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-5 py-2.5 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-full transition-colors text-sm"
        >
          <TrendingUp className="w-4 h-4 text-primary-400" />
          <span className="text-white font-medium">{currentPeriod?.label}</span>
          <svg
            className={`w-4 h-4 text-dark-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 bg-dark-800 border border-dark-700 rounded-xl shadow-xl z-20 overflow-hidden"
            >
              {STATS_PERIODS.map((period) => (
                <button
                  key={period.id}
                  onClick={() => {
                    setStatsPeriod(period.id);
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-3 text-left hover:bg-dark-700 transition-colors ${
                    statsPeriod === period.id ? 'bg-primary-500/10 border-l-2 border-primary-500' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-medium ${statsPeriod === period.id ? 'text-primary-400' : 'text-white'}`}>
                      {period.label}
                    </span>
                    {statsPeriod === period.id && (
                      <svg className="w-4 h-4 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs text-dark-400">{period.description}</span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Function to filter/calculate stats based on selected period
function calculateStatsForPeriod(allStats, period, totalAppearances) {
  // allStats is an array of season statistics
  if (!allStats || allStats.length === 0) return {};

  // Sort seasons by season_id (most recent first - higher ID = more recent)
  const sortedSeasons = [...allStats].sort((a, b) => (b.season_id || 0) - (a.season_id || 0));

  const aggregatedStats = {};

  const processDetails = (details, multiplier = 1) => {
    details.forEach(detail => {
      const typeName = detail.type?.developer_name || detail.type?.code || detail.type?.name || '';
      let key = typeName.toLowerCase().replace(/[-\s]+/g, '_').replace(/[^a-z0-9_]/g, '');

      const keyMappings = {
        'goals': 'goals',
        'assists': 'assists',
        'appearances': 'appearances',
        'minutes_played': 'minutes',
        'minutesplayed': 'minutes',
        'yellowcards': 'yellowcards',
        'yellow_cards': 'yellowcards',
        'redcards': 'redcards',
        'red_cards': 'redcards',
        'rating': 'rating',
        'shots_total': 'shots_total',
        'shotstotal': 'shots_total',
        'shots_on_target': 'shots_on_target',
        'shotsontarget': 'shots_on_target',
        'passes_total': 'passes',
        'passestotal': 'passes',
        'pass_accuracy': 'passes_accuracy',
        'passaccuracy': 'passes_accuracy',
        'dribbles_success': 'dribbles',
        'dribblessuccess': 'dribbles',
        'tackles': 'tackles',
        'interceptions': 'interceptions',
      };

      const mappedKey = keyMappings[key] || key;
      const value = detail.value?.total ?? detail.value?.all ?? detail.value?.home ?? detail.value?.away ?? detail.value ?? 0;

      if (aggregatedStats[mappedKey]) {
        aggregatedStats[mappedKey] += (parseFloat(value) || 0) * multiplier;
      } else {
        aggregatedStats[mappedKey] = (parseFloat(value) || 0) * multiplier;
      }
    });
  };

  switch (period) {
    case 'current': {
      // Get stats from current campaign only
      // Season_ids from the same campaign year are typically within ~1500 of each other
      // Larger gaps indicate different campaign years
      if (sortedSeasons.length > 0) {
        const maxSeasonId = Math.max(...sortedSeasons.map(s => s.season_id || 0));
        const seasonIdThreshold = 1500; // Season IDs within this range are same campaign

        // Only include seasons from the current campaign (close to max season_id)
        sortedSeasons.forEach(season => {
          const seasonId = season.season_id || 0;
          if (maxSeasonId - seasonId <= seasonIdThreshold && season.details?.length > 0) {
            processDetails(season.details);
          }
        });
      }
      break;
    }

    case 'last10':
    case 'last20': {
      // Estimate based on proportion of appearances
      const targetMatches = period === 'last10' ? 10 : 20;

      // Sum all stats first
      sortedSeasons.forEach(season => processDetails(season.details || []));

      // Calculate the proportion to show
      const appearances = aggregatedStats.appearances || 1;
      if (appearances > targetMatches) {
        const ratio = targetMatches / appearances;
        Object.keys(aggregatedStats).forEach(key => {
          // Don't scale rating - average it properly
          if (key !== 'rating' && key !== 'passes_accuracy') {
            aggregatedStats[key] = Math.round(aggregatedStats[key] * ratio);
          }
        });
        aggregatedStats.appearances = Math.min(targetMatches, appearances);
      }
      break;
    }

    case 'season2':
      // Last 2 seasons
      sortedSeasons.slice(0, 2).forEach(season => processDetails(season.details || []));
      break;

    case 'career':
    default:
      // All time - sum everything
      sortedSeasons.forEach(season => processDetails(season.details || []));
      break;
  }

  // Calculate per-match averages
  const appearances = aggregatedStats.appearances || 1;
  aggregatedStats.minutes_per_match = (aggregatedStats.minutes || 0) / appearances;
  aggregatedStats.shots_per_match = (aggregatedStats.shots_total || 0) / appearances;
  aggregatedStats.shots_on_target_per_match = (aggregatedStats.shots_on_target || 0) / appearances;

  return aggregatedStats;
}

// Player Statistics Tab Component
function PlayerStatisticsTab({ homeLineup, awayLineup, homeTeam, awayTeam, isMatchFinished = false }) {
  const [selectedTeam, setSelectedTeam] = useState('home');
  const [sortBy, setSortBy] = useState('goals');
  const [sortDesc, setSortDesc] = useState(true);
  const [squadData, setSquadData] = useState(null);
  const [loadingSquad, setLoadingSquad] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState('current');

  const hasLineups = homeLineup.length > 0 || awayLineup.length > 0;

  // Check if lineup players have actual match stats (minutes played > 0)
  const hasMatchStats = hasLineups && (homeLineup.some(p =>
    p.details?.some(d => d.type?.developer_name === 'MINUTES_PLAYED' && d.data?.value > 0)
  ) || awayLineup.some(p =>
    p.details?.some(d => d.type?.developer_name === 'MINUTES_PLAYED' && d.data?.value > 0)
  ));

  // For upcoming matches with lineups but no stats, we need season data
  const needsSeasonStats = hasLineups && !hasMatchStats && !isMatchFinished;

  // Fetch squad data if no lineups OR if we need season stats for lineup players
  useEffect(() => {
    const shouldFetchSquads = (!hasLineups || needsSeasonStats) && homeTeam?.id && awayTeam?.id && !squadData;
    if (shouldFetchSquads) {
      const fetchSquads = async () => {
        setLoadingSquad(true);
        try {
          const response = await fixturesApi.getSquads(homeTeam.id, awayTeam.id);
          setSquadData(response.data);
        } catch (err) {
          console.error('Error fetching squads:', err);
        } finally {
          setLoadingSquad(false);
        }
      };
      fetchSquads();
    }
  }, [hasLineups, needsSeasonStats, homeTeam?.id, awayTeam?.id, squadData]);

  const handleSort = (key) => {
    if (sortBy === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortBy(key);
      setSortDesc(true);
    }
  };

  // If match is finished/live with actual stats, show match stats
  if (hasLineups && hasMatchStats) {
    const lineup = selectedTeam === 'home' ? homeLineup : awayLineup;

    const playersWithStats = lineup.map(player => {
      const stats = {};
      player.details?.forEach(detail => {
        const typeName = detail.type?.developer_name || detail.type?.name || '';
        stats[typeName.toLowerCase().replace(/\s+/g, '_')] = detail.data?.value ?? detail.value ?? 0;
      });
      return { ...player, stats };
    });

    const sortedPlayers = [...playersWithStats].sort((a, b) => {
      const aVal = a.stats[sortBy] || 0;
      const bVal = b.stats[sortBy] || 0;
      return sortDesc ? bVal - aVal : aVal - bVal;
    });

    return (
      <div className="space-y-4">
        <div className="card p-3 bg-accent-green/10 border border-accent-green/20">
          <p className="text-center text-accent-green text-sm font-medium">
            Showing match statistics from lineups
          </p>
        </div>
        <TeamSelector
          selectedTeam={selectedTeam}
          setSelectedTeam={setSelectedTeam}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
        />
        <MatchStatsTable
          players={sortedPlayers}
          sortBy={sortBy}
          sortDesc={sortDesc}
          handleSort={handleSort}
        />
        <StatsLegend isSeasonStats={false} />
      </div>
    );
  }

  // Show loading state
  if (loadingSquad) {
    return (
      <div className="card p-8 text-center">
        <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">Loading Squad Data...</h3>
        <p className="text-dark-400">Fetching player season statistics</p>
      </div>
    );
  }

  // Show squad season stats (pre-match or upcoming match with lineups)
  if (squadData) {
    const squad = selectedTeam === 'home' ? squadData.home : squadData.away;
    const lineup = selectedTeam === 'home' ? homeLineup : awayLineup;
    const team = selectedTeam === 'home' ? homeTeam : awayTeam;

    // Get player IDs from lineup if we have one (for upcoming matches)
    const lineupPlayerIds = lineup.map(p => p.player_id || p.player?.id);
    const hasLineupToFilter = needsSeasonStats && lineupPlayerIds.length > 0;

    // Filter squad to only include actual squad members (not transfer rumors)
    // Real squad members have transfer_id and start/end dates
    const actualSquadPlayers = (squad?.players || []).filter(sp => {
      // Include if player has transfer_id OR has start date (actual contract)
      return sp.transfer_id || sp.start;
    });

    // Process player stats from squad data using the period filter
    let playersWithStats = actualSquadPlayers.map(squadPlayer => {
      const player = squadPlayer.player || squadPlayer;
      const allStats = player.statistics || [];

      // Use the calculateStatsForPeriod function to filter stats based on selected period
      const stats = calculateStatsForPeriod(allStats, statsPeriod);

      // Get lineup info if player is in lineup
      const lineupInfo = lineup.find(lp => (lp.player_id || lp.player?.id) === (player.id || squadPlayer.player_id));

      return {
        player_id: player.id || squadPlayer.player_id,
        player: player,
        position: player.position?.name || player.detailed_position?.name || squadPlayer.position_id,
        jersey_number: lineupInfo?.jersey_number || squadPlayer.jersey_number,
        stats,
        isInLineup: !!lineupInfo,
        lineupType: lineupInfo?.type_id === 11 ? 'starter' : lineupInfo?.type_id === 12 ? 'sub' : null,
      };
    });

    // If we have lineup for upcoming match, filter to only show lineup players first
    if (hasLineupToFilter) {
      // Separate lineup players and others
      const lineupPlayers = playersWithStats.filter(p => p.isInLineup);
      const otherPlayers = playersWithStats.filter(p => !p.isInLineup);

      // Sort lineup players: starters first, then subs
      lineupPlayers.sort((a, b) => {
        if (a.lineupType === 'starter' && b.lineupType !== 'starter') return -1;
        if (a.lineupType !== 'starter' && b.lineupType === 'starter') return 1;
        return 0;
      });

      playersWithStats = [...lineupPlayers, ...otherPlayers];
    }

    // Sort players by selected stat (but keep lineup priority if filtering by lineup)
    const sortedPlayers = hasLineupToFilter
      ? playersWithStats // Already sorted by lineup status
      : [...playersWithStats].sort((a, b) => {
          const aVal = a.stats[sortBy] || 0;
          const bVal = b.stats[sortBy] || 0;
          return sortDesc ? bVal - aVal : aVal - bVal;
        });

    // Get period label for display
    const currentPeriodLabel = STATS_PERIODS.find(p => p.id === statsPeriod)?.label || 'Stats';

    return (
      <div className="space-y-4">
        {/* Info banner for upcoming matches */}
        {hasLineupToFilter && (
          <div className="card p-3 bg-primary-500/10 border border-primary-500/20">
            <p className="text-center text-primary-300 text-sm font-medium">
              Showing season statistics for expected lineup players
            </p>
          </div>
        )}
        {/* Period selector - centered */}
        <StatsPeriodSelector
          statsPeriod={statsPeriod}
          setStatsPeriod={setStatsPeriod}
        />
        <TeamSelector
          selectedTeam={selectedTeam}
          setSelectedTeam={setSelectedTeam}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
        />
        <SeasonStatsTable
          players={sortedPlayers}
          sortBy={sortBy}
          sortDesc={sortDesc}
          handleSort={handleSort}
          periodLabel={currentPeriodLabel}
          showLineupBadge={hasLineupToFilter}
        />
        <StatsLegend isSeasonStats={true} periodLabel={currentPeriodLabel} />
      </div>
    );
  }

  // Fallback: No data available
  return (
    <div className="card p-8 text-center">
      <User className="w-16 h-16 text-dark-600 mx-auto mb-4" />
      <h3 className="text-xl font-bold text-white mb-2">Player Statistics Not Available</h3>
      <p className="text-dark-400">Unable to load player statistics at this time.</p>
    </div>
  );
}

// Team selector component
function TeamSelector({ selectedTeam, setSelectedTeam, homeTeam, awayTeam }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => setSelectedTeam('home')}
          className={`flex items-center gap-3 px-6 py-3 rounded-xl transition-all ${
            selectedTeam === 'home'
              ? 'bg-primary-500 text-white'
              : 'bg-dark-800 text-dark-400 hover:text-white'
          }`}
        >
          {homeTeam?.image_path && <img src={homeTeam.image_path} alt="" className="w-8 h-8" />}
          <span className="font-bold">{homeTeam?.name}</span>
        </button>
        <button
          onClick={() => setSelectedTeam('away')}
          className={`flex items-center gap-3 px-6 py-3 rounded-xl transition-all ${
            selectedTeam === 'away'
              ? 'bg-accent-purple text-white'
              : 'bg-dark-800 text-dark-400 hover:text-white'
          }`}
        >
          {awayTeam?.image_path && <img src={awayTeam.image_path} alt="" className="w-8 h-8" />}
          <span className="font-bold">{awayTeam?.name}</span>
        </button>
      </div>
    </div>
  );
}

// Match stats table (for live/post-match with lineups)
function MatchStatsTable({ players, sortBy, sortDesc, handleSort }) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="bg-dark-800/50">
              <th className="px-4 py-3 text-left text-dark-400 font-medium sticky left-0 bg-dark-800/50 z-10">
                Player
              </th>
              {PLAYER_STAT_COLUMNS.slice(0, 10).map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-3 py-3 text-center cursor-pointer hover:text-white transition-colors ${
                    sortBy === col.key ? 'text-primary-400' : 'text-dark-400'
                  } ${col.highlight ? 'font-bold' : 'font-medium'}`}
                >
                  <div className="flex items-center justify-center gap-1">
                    {col.label}
                    {sortBy === col.key && (
                      <span className="text-xs">{sortDesc ? '↓' : '↑'}</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((player, index) => (
              <motion.tr
                key={player.player_id || index}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.03 }}
                className="border-t border-dark-700 hover:bg-dark-800/30 transition-colors"
              >
                <td className="px-4 py-3 sticky left-0 bg-dark-900/95 z-10">
                  <Link
                    to={`/player/${player.player_id}`}
                    className="flex items-center gap-3 hover:text-primary-400 transition-colors"
                  >
                    {player.player?.image_path ? (
                      <img src={player.player.image_path} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 bg-dark-700 rounded-full flex items-center justify-center text-xs">
                        {player.jersey_number || '-'}
                      </div>
                    )}
                    <div>
                      <div className="text-white font-medium text-sm">
                        {player.player?.display_name || player.player?.name || player.player_name}
                      </div>
                      <div className="text-xs text-dark-500">{player.position}</div>
                    </div>
                  </Link>
                </td>
                {PLAYER_STAT_COLUMNS.slice(0, 10).map(col => {
                  const value = player.stats[col.key] ?? '-';
                  const isHighValue = col.key === 'rating' && value >= 7;
                  const isGoal = col.key === 'goals' && value > 0;
                  const isAssist = col.key === 'assists' && value > 0;

                  return (
                    <td
                      key={col.key}
                      className={`px-3 py-3 text-center text-sm ${
                        isHighValue ? 'text-accent-green font-bold' :
                        isGoal ? 'text-accent-green font-bold' :
                        isAssist ? 'text-accent-cyan font-bold' :
                        'text-dark-300'
                      }`}
                    >
                      {col.key === 'rating' && value !== '-' ? parseFloat(value).toFixed(1) : value}
                    </td>
                  );
                })}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Season stats table (for pre-match without lineups)
function SeasonStatsTable({ players, sortBy, sortDesc, handleSort, periodLabel, showLineupBadge = false }) {
  if (players.length === 0) {
    return (
      <div className="card p-8 text-center">
        <User className="w-16 h-16 text-dark-600 mx-auto mb-4" />
        <h3 className="text-lg font-bold text-white mb-2">No Squad Data Available</h3>
        <p className="text-dark-400 text-sm">Squad information is not available for this team.</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="bg-dark-800/50">
              <th className="px-4 py-3 text-left text-dark-400 font-medium sticky left-0 bg-dark-800/50 z-10">
                Player
              </th>
              {SEASON_STAT_COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-3 py-3 text-center cursor-pointer hover:text-white transition-colors ${
                    sortBy === col.key ? 'text-primary-400' : 'text-dark-400'
                  } ${col.highlight ? 'font-bold' : 'font-medium'}`}
                >
                  <div className="flex items-center justify-center gap-1">
                    {col.label}
                    {sortBy === col.key && (
                      <span className="text-xs">{sortDesc ? '↓' : '↑'}</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((player, index) => (
              <motion.tr
                key={player.player_id || index}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.02 }}
                className={`border-t border-dark-700 hover:bg-dark-800/30 transition-colors ${
                  showLineupBadge && player.isInLineup ? 'bg-primary-500/5' : ''
                }`}
              >
                <td className="px-4 py-3 sticky left-0 bg-dark-900/95 z-10">
                  <Link
                    to={`/player/${player.player_id}`}
                    className="flex items-center gap-3 hover:text-primary-400 transition-colors"
                  >
                    <div className="relative">
                      {player.player?.image_path ? (
                        <img src={player.player.image_path} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 bg-dark-700 rounded-full flex items-center justify-center text-xs font-bold">
                          {player.jersey_number || '?'}
                        </div>
                      )}
                      {/* Lineup badge */}
                      {showLineupBadge && player.isInLineup && (
                        <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                          player.lineupType === 'starter' ? 'bg-accent-green text-white' : 'bg-dark-500 text-dark-200'
                        }`}>
                          {player.lineupType === 'starter' ? 'XI' : 'S'}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm flex items-center gap-2">
                        {player.player?.display_name || player.player?.common_name || player.player?.name || 'Unknown'}
                        {showLineupBadge && player.lineupType === 'starter' && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-accent-green/20 text-accent-green rounded font-medium">
                            Starting XI
                          </span>
                        )}
                        {showLineupBadge && player.lineupType === 'sub' && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-dark-600 text-dark-300 rounded font-medium">
                            Sub
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-dark-500 flex items-center gap-2">
                        <span>{player.position || 'Unknown'}</span>
                        {player.player?.nationality?.image_path && (
                          <img src={player.player.nationality.image_path} alt="" className="w-4 h-3 object-cover rounded-sm" />
                        )}
                      </div>
                    </div>
                  </Link>
                </td>
                {SEASON_STAT_COLUMNS.map(col => {
                  const rawValue = player.stats[col.key];
                  const isGoal = col.key === 'goals' && rawValue > 0;
                  const isAssist = col.key === 'assists' && rawValue > 0;
                  const isHighRating = col.key === 'rating' && rawValue >= 7;

                  // Format value based on column type
                  let displayValue = '-';
                  if (rawValue !== undefined && rawValue !== null) {
                    if (col.isAverage || col.key === 'rating') {
                      displayValue = rawValue.toFixed(1);
                    } else {
                      displayValue = Math.round(rawValue);
                    }
                  }

                  return (
                    <td
                      key={col.key}
                      className={`px-3 py-3 text-center text-sm ${
                        isGoal ? 'text-accent-green font-bold' :
                        isAssist ? 'text-accent-cyan font-bold' :
                        isHighRating ? 'text-accent-green font-bold' :
                        col.key === 'yellowcards' && rawValue > 0 ? 'text-accent-yellow' :
                        col.key === 'redcards' && rawValue > 0 ? 'text-accent-red font-bold' :
                        col.isAverage ? 'text-primary-300' :
                        'text-dark-300'
                      }`}
                    >
                      {displayValue}
                    </td>
                  );
                })}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Stats legend component
function StatsLegend({ isSeasonStats, periodLabel }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-bold text-dark-400">
          {isSeasonStats ? `${periodLabel || 'Season'} Statistics Legend` : 'Match Statistics Legend'}
        </h4>
        {isSeasonStats && periodLabel && (periodLabel.includes('Last 10') || periodLabel.includes('Last 20')) && (
          <span className="text-xs text-dark-500 bg-dark-800 px-2 py-1 rounded">
            Estimated values based on recent form
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-dark-500">
        {isSeasonStats ? (
          <>
            <span>Apps = Appearances</span>
            <span>G = Goals</span>
            <span>A = Assists</span>
            <span className="text-primary-300">Min/M = Minutes per Match</span>
            <span className="text-primary-300">Sh/M = Shots per Match</span>
            <span className="text-primary-300">SoT/M = Shots on Target per Match</span>
            <span>YC = Yellow Cards</span>
            <span>RC = Red Cards</span>
            <span>Int = Interceptions</span>
          </>
        ) : (
          <>
            <span>G = Goals</span>
            <span>A = Assists</span>
            <span>Min = Minutes Played</span>
            <span>Pass % = Pass Accuracy</span>
            <span>Key Pass = Key Passes</span>
            <span>Int = Interceptions</span>
            <span>Clear = Clearances</span>
          </>
        )}
      </div>
    </div>
  );
}

// Events Tab Component
function EventsTab({ events, homeTeam, awayTeam }) {
  if (!events.length) {
    return (
      <div className="card p-8 text-center">
        <List className="w-16 h-16 text-dark-600 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">No Events Yet</h3>
        <p className="text-dark-400">Events will appear here as the match progresses.</p>
      </div>
    );
  }

  const getEventIcon = (type) => {
    const code = type?.code || type?.developer_name || '';
    switch (code.toLowerCase()) {
      case 'goal': return { icon: '⚽', color: 'text-accent-green bg-accent-green/20' };
      case 'owngoal': return { icon: '🔴', color: 'text-accent-red bg-accent-red/20' };
      case 'penalty': return { icon: '🎯', color: 'text-accent-green bg-accent-green/20' };
      case 'missed_penalty': return { icon: '❌', color: 'text-accent-red bg-accent-red/20' };
      case 'yellowcard': return { icon: '🟨', color: 'text-accent-yellow bg-accent-yellow/20' };
      case 'redcard': return { icon: '🟥', color: 'text-accent-red bg-accent-red/20' };
      case 'yellowred': return { icon: '🟨🟥', color: 'text-accent-red bg-accent-red/20' };
      case 'substitution': return { icon: '🔄', color: 'text-accent-cyan bg-accent-cyan/20' };
      case 'var': return { icon: '📺', color: 'text-primary-400 bg-primary-400/20' };
      default: return { icon: '•', color: 'text-dark-400 bg-dark-700' };
    }
  };

  return (
    <div className="card p-6">
      {/* Team headers */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-dark-700">
        <div className="flex items-center gap-2">
          {homeTeam?.image_path && <img src={homeTeam.image_path} alt="" className="w-6 h-6" />}
          <span className="font-bold text-white">{homeTeam?.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold text-white">{awayTeam?.name}</span>
          {awayTeam?.image_path && <img src={awayTeam.image_path} alt="" className="w-6 h-6" />}
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Center line */}
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-dark-700" />

        <div className="space-y-4">
          {events.map((event, index) => {
            const isHome = event.participant_id === homeTeam?.id;
            const { icon, color } = getEventIcon(event.type);
            // Create a stable unique key using multiple event properties
            // This avoids React reconciliation issues if events are reordered
            const eventKey = event.id || `${event.minute}-${event.type?.code || event.type}-${event.participant_id || ''}-${event.player_id || index}`;

            return (
              <motion.div
                key={eventKey}
                initial={{ opacity: 0, x: isHome ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`flex items-center gap-4 ${isHome ? 'flex-row' : 'flex-row-reverse'}`}
              >
                {/* Event content */}
                <div className={`flex-1 ${isHome ? 'text-right' : 'text-left'}`}>
                  <div className={`inline-flex items-center gap-2 p-3 rounded-xl bg-dark-800/50 ${isHome ? 'flex-row-reverse' : ''}`}>
                    <span className={`text-lg w-8 h-8 flex items-center justify-center rounded-lg ${color}`}>
                      {icon}
                    </span>
                    <div className={isHome ? 'text-right' : 'text-left'}>
                      <Link
                        to={`/player/${event.player_id || event.player?.id}`}
                        className="text-white font-medium hover:text-primary-400 transition-colors"
                      >
                        {event.player?.display_name || event.player?.name || event.player_name || event.type?.name}
                      </Link>
                      {event.related_player && (
                        <div className="text-xs text-dark-400">
                          {event.type?.code === 'substitution' ? 'for' : 'assist'}{' '}
                          <Link
                            to={`/player/${event.related_player_id || event.related_player?.id}`}
                            className="hover:text-primary-400 transition-colors"
                          >
                            {event.related_player?.display_name || event.related_player?.name}
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Minute bubble */}
                <div className="relative z-10 w-12 h-12 flex items-center justify-center bg-dark-800 border-2 border-dark-600 rounded-full flex-shrink-0">
                  <span className="text-sm font-bold text-white">{event.minute}'</span>
                  {event.extra_minute && (
                    <span className="absolute -bottom-1 text-xs text-dark-400">+{event.extra_minute}</span>
                  )}
                </div>

                {/* Spacer */}
                <div className="flex-1" />
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Lineups Tab Component
function LineupsTab({ homeLineup, awayLineup, homeTeam, awayTeam, formations }) {
  const homeFormation = formations?.find(f => f.participant_id === homeTeam?.id)?.formation;
  const awayFormation = formations?.find(f => f.participant_id === awayTeam?.id)?.formation;

  const homeStarters = homeLineup.filter(p => p.type_id === 11 || !p.type?.developer_name?.includes('bench'));
  const homeSubs = homeLineup.filter(p => p.type_id === 12 || p.type?.developer_name?.includes('bench'));
  const awayStarters = awayLineup.filter(p => p.type_id === 11 || !p.type?.developer_name?.includes('bench'));
  const awaySubs = awayLineup.filter(p => p.type_id === 12 || p.type?.developer_name?.includes('bench'));

  if (!homeLineup.length && !awayLineup.length) {
    return (
      <div className="card p-8 text-center">
        <Users className="w-16 h-16 text-dark-600 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">Lineups Not Available</h3>
        <p className="text-dark-400">Lineups will be announced closer to kick-off.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Home team */}
      <div className="card p-4">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-dark-700">
          {homeTeam?.image_path && <img src={homeTeam.image_path} alt="" className="w-8 h-8" />}
          <h4 className="font-bold text-white flex-1">{homeTeam?.name}</h4>
          {homeFormation && (
            <span className="text-sm bg-primary-500/20 text-primary-400 px-3 py-1 rounded-lg">
              {homeFormation}
            </span>
          )}
        </div>

        <div className="space-y-1">
          {homeStarters.map((player, i) => (
            <PlayerRow key={player.player_id || i} player={player} />
          ))}
        </div>

        {homeSubs.length > 0 && (
          <>
            <div className="text-xs text-dark-500 mt-4 mb-2 pt-3 border-t border-dark-700">
              Substitutes
            </div>
            <div className="space-y-1">
              {homeSubs.map((player, i) => (
                <PlayerRow key={player.player_id || i} player={player} isSub />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Away team */}
      <div className="card p-4">
        <div className="flex items-center gap-3 mb-4 pb-3 border-b border-dark-700">
          {awayTeam?.image_path && <img src={awayTeam.image_path} alt="" className="w-8 h-8" />}
          <h4 className="font-bold text-white flex-1">{awayTeam?.name}</h4>
          {awayFormation && (
            <span className="text-sm bg-accent-purple/20 text-accent-purple px-3 py-1 rounded-lg">
              {awayFormation}
            </span>
          )}
        </div>

        <div className="space-y-1">
          {awayStarters.map((player, i) => (
            <PlayerRow key={player.player_id || i} player={player} />
          ))}
        </div>

        {awaySubs.length > 0 && (
          <>
            <div className="text-xs text-dark-500 mt-4 mb-2 pt-3 border-t border-dark-700">
              Substitutes
            </div>
            <div className="space-y-1">
              {awaySubs.map((player, i) => (
                <PlayerRow key={player.player_id || i} player={player} isSub />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PlayerRow({ player, isSub = false }) {
  return (
    <Link
      to={`/player/${player.player_id}`}
      className={`flex items-center gap-3 p-2 rounded-lg hover:bg-dark-800 transition-colors ${
        isSub ? 'opacity-70' : ''
      }`}
    >
      <span className="w-7 h-7 flex items-center justify-center bg-dark-700 rounded text-xs font-mono text-white">
        {player.jersey_number || '-'}
      </span>
      <span className="flex-1 text-white text-sm">
        {player.player?.display_name || player.player?.name || player.player_name || 'Unknown'}
      </span>
      <span className="text-xs text-dark-500">{player.position}</span>
    </Link>
  );
}

// Probability Tab Component
function ProbabilityTab({ fixtureId }) {
  return (
    <div className="space-y-6">
      {/* Value Bets Summary - Shows all positive EV bets at the top */}
      <ValueBetsSummaryCard fixtureId={fixtureId} />

      {/* Introduction */}
      <div className="card p-4 bg-gradient-to-r from-primary-500/10 to-accent-cyan/10 border border-primary-500/20">
        <div className="flex items-start gap-3">
          <Percent className="w-6 h-6 text-primary-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-white mb-1">Probability Calculator</h3>
            <p className="text-sm text-dark-300">
              Probabilities calculated using Poisson distribution based on team and player season statistics.
              Use these to compare against bookmaker odds to find value bets.
            </p>
          </div>
        </div>
      </div>

      {/* Corner Probabilities */}
      <CornersProbabilityCard fixtureId={fixtureId} />

      {/* Card Probabilities */}
      <CardsProbabilityCard fixtureId={fixtureId} />

      {/* Player Shot Probabilities */}
      <PlayerShotsProbabilityCard fixtureId={fixtureId} />
    </div>
  );
}

// H2H Tab Component
function H2HTab({ matches, loading, homeTeam, awayTeam }) {
  if (loading) return <LoadingSpinner size="sm" text="Loading head to head..." />;

  if (!matches.length) {
    return (
      <div className="card p-8 text-center">
        <Swords className="w-16 h-16 text-dark-600 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">No Previous Meetings</h3>
        <p className="text-dark-400">These teams haven't played each other recently.</p>
      </div>
    );
  }

  // Calculate H2H stats
  let homeWins = 0, awayWins = 0, draws = 0, homeGoals = 0, awayGoals = 0;
  matches.forEach(match => {
    const home = match.participants?.find(p => p.meta?.location === 'home');
    const homeScore = match.scores?.find(s => s.score?.participant === 'home')?.score?.goals || 0;
    const awayScore = match.scores?.find(s => s.score?.participant === 'away')?.score?.goals || 0;

    if (home?.id === homeTeam?.id) {
      homeGoals += homeScore;
      awayGoals += awayScore;
      if (homeScore > awayScore) homeWins++;
      else if (awayScore > homeScore) awayWins++;
      else draws++;
    } else if (home?.id === awayTeam?.id) {
      homeGoals += awayScore;
      awayGoals += homeScore;
      if (homeScore > awayScore) awayWins++;
      else if (awayScore > homeScore) homeWins++;
      else draws++;
    }
  });

  return (
    <div className="space-y-4">
      {/* H2H Summary */}
      <div className="card p-6">
        <h3 className="text-lg font-bold text-white text-center mb-6">Head to Head Summary</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-4 bg-dark-800/50 rounded-xl">
            <div className="flex items-center justify-center gap-2 mb-2">
              {homeTeam?.image_path && <img src={homeTeam.image_path} alt="" className="w-6 h-6" />}
            </div>
            <div className="text-3xl font-bold text-accent-green">{homeWins}</div>
            <div className="text-sm text-dark-400">Wins</div>
          </div>
          <div className="p-4 bg-dark-800/50 rounded-xl">
            <div className="text-sm text-dark-500 mb-2">Draw</div>
            <div className="text-3xl font-bold text-dark-300">{draws}</div>
            <div className="text-sm text-dark-400">Draws</div>
          </div>
          <div className="p-4 bg-dark-800/50 rounded-xl">
            <div className="flex items-center justify-center gap-2 mb-2">
              {awayTeam?.image_path && <img src={awayTeam.image_path} alt="" className="w-6 h-6" />}
            </div>
            <div className="text-3xl font-bold text-accent-purple">{awayWins}</div>
            <div className="text-sm text-dark-400">Wins</div>
          </div>
        </div>

        {/* Goals comparison */}
        <div className="mt-6 pt-4 border-t border-dark-700">
          <div className="flex items-center justify-between text-sm">
            <span className="text-dark-400">Total Goals</span>
            <div className="flex items-center gap-4">
              <span className="text-accent-green font-bold">{homeGoals}</span>
              <span className="text-dark-600">-</span>
              <span className="text-accent-purple font-bold">{awayGoals}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Previous matches */}
      <div className="card p-4">
        <h4 className="font-bold text-white mb-4">Previous Meetings</h4>
        <div className="space-y-2">
          {matches.slice(0, 10).map((match, index) => {
            const home = match.participants?.find(p => p.meta?.location === 'home');
            const away = match.participants?.find(p => p.meta?.location === 'away');
            const homeScore = match.scores?.find(s => s.score?.participant === 'home')?.score?.goals || 0;
            const awayScore = match.scores?.find(s => s.score?.participant === 'away')?.score?.goals || 0;

            return (
              <motion.div
                key={match.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center justify-between p-3 bg-dark-800/30 rounded-xl hover:bg-dark-800/50 transition-colors"
              >
                <div className="text-sm text-dark-500 w-24">
                  {match.starting_at && formatInTimeZone(parseUTCDate(match.starting_at), CET_TIMEZONE, 'MMM d, yyyy')}
                </div>
                <div className="flex items-center gap-3 flex-1 justify-center">
                  <span className={`text-sm ${home?.id === homeTeam?.id ? 'text-white font-medium' : 'text-dark-400'}`}>
                    {home?.short_code || home?.name?.slice(0, 3)}
                  </span>
                  <span className="font-bold text-white px-3 py-1 bg-dark-700 rounded">
                    {homeScore} - {awayScore}
                  </span>
                  <span className={`text-sm ${away?.id === awayTeam?.id ? 'text-white font-medium' : 'text-dark-400'}`}>
                    {away?.short_code || away?.name?.slice(0, 3)}
                  </span>
                </div>
                <div className="text-xs text-dark-600 w-24 text-right truncate">
                  {match.league?.name}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
