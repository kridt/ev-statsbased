import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { Flame, Clock, Calendar, ChevronDown, Filter } from 'lucide-react';
import { fixturesApi } from '../services/api';
import { useSocket } from '../context/SocketContext';
import DatePicker from '../components/DatePicker';
import MatchCard from '../components/MatchCard';
import LoadingSpinner, { MatchCardSkeleton } from '../components/LoadingSpinner';

export default function HomePage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [fixtures, setFixtures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterLeague, setFilterLeague] = useState(null);
  const [viewMode, setViewMode] = useState('time'); // 'time' or 'league'
  const [retryCount, setRetryCount] = useState(0); // Used to trigger refetch on retry
  const [expandedSections, setExpandedSections] = useState({
    live: true,
    soon: true,
    later: true,
  });

  const { liveFixtures, subscribeLive, unsubscribeLive, isConnected } = useSocket();

  // Fetch fixtures for selected date
  useEffect(() => {
    const fetchFixtures = async () => {
      setLoading(true);
      setError(null);
      try {
        const dateStr = format(selectedDate, 'yyyy-MM-dd');
        const response = await fixturesApi.getByDate(dateStr);
        setFixtures(response.data || []);
      } catch (err) {
        console.error('Error fetching fixtures:', err);
        setError('Failed to load matches. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchFixtures();
  }, [selectedDate, retryCount]); // retryCount triggers refetch on retry button click

  // Silently prefetch adjacent dates for faster navigation
  useEffect(() => {
    const prefetchAdjacentDates = async () => {
      const prevDay = new Date(selectedDate);
      prevDay.setDate(prevDay.getDate() - 1);
      const nextDay = new Date(selectedDate);
      nextDay.setDate(nextDay.getDate() + 1);

      // Fire-and-forget requests to warm the cache
      Promise.all([
        fixturesApi.getByDate(format(prevDay, 'yyyy-MM-dd')).catch(() => {}),
        fixturesApi.getByDate(format(nextDay, 'yyyy-MM-dd')).catch(() => {}),
      ]);
    };

    // Delay prefetch to not compete with main request
    const timer = setTimeout(prefetchAdjacentDates, 500);
    return () => clearTimeout(timer);
  }, [selectedDate]);

  // Subscribe to live updates
  useEffect(() => {
    if (isConnected) {
      subscribeLive();
      return () => unsubscribeLive();
    }
  }, [isConnected, subscribeLive, unsubscribeLive]);

  // Merge live data with fixtures
  const mergedFixtures = useMemo(() => {
    if (!liveFixtures?.length) return fixtures;

    const liveMap = new Map(liveFixtures.map(f => [f.id, f]));
    return fixtures.map(f => liveMap.get(f.id) || f);
  }, [fixtures, liveFixtures]);

  // Get unique leagues
  const leagues = useMemo(() => {
    const uniqueLeagues = new Map();
    mergedFixtures.forEach(f => {
      if (f.league) {
        uniqueLeagues.set(f.league.id, f.league);
      }
    });
    return Array.from(uniqueLeagues.values());
  }, [mergedFixtures]);

  // Categorize fixtures by time
  const categorizedFixtures = useMemo(() => {
    const now = new Date();
    const categories = {
      live: [],
      soon: [],
      later: [],
    };

    const filtered = filterLeague
      ? mergedFixtures.filter(f => f.league?.id === filterLeague)
      : mergedFixtures;

    filtered.forEach(fixture => {
      const state = fixture.state?.state || fixture.state?.short_name || 'NS';
      const isLive = ['INPLAY_1ST_HALF', 'INPLAY_2ND_HALF', 'HT', 'BREAK', 'ET', 'PEN_LIVE', 'LIVE'].includes(state);
      const isFinished = ['FT', 'FT_PEN', 'AET', 'ABD', 'AWD', 'WO'].includes(state);
      const startTime = fixture.starting_at ? new Date(fixture.starting_at) : null;

      // Skip finished matches - only show live and upcoming
      if (isFinished) {
        return;
      }

      if (isLive) {
        categories.live.push(fixture);
      } else if (startTime) {
        const diffMinutes = (startTime - now) / (1000 * 60);
        if (diffMinutes <= 120) {
          categories.soon.push(fixture);
        } else {
          categories.later.push(fixture);
        }
      } else {
        categories.later.push(fixture);
      }
    });

    // Sort each category
    Object.keys(categories).forEach(key => {
      categories[key].sort((a, b) => {
        const timeA = a.starting_at ? new Date(a.starting_at) : new Date(0);
        const timeB = b.starting_at ? new Date(b.starting_at) : new Date(0);
        return timeA - timeB;
      });
    });

    return categories;
  }, [mergedFixtures, filterLeague]);

  // Group by league
  const fixturesByLeague = useMemo(() => {
    const groups = {};
    const filtered = filterLeague
      ? mergedFixtures.filter(f => f.league?.id === filterLeague)
      : mergedFixtures;

    filtered.forEach(fixture => {
      // Skip finished matches
      const state = fixture.state?.state || fixture.state?.short_name || 'NS';
      const isFinished = ['FT', 'FT_PEN', 'AET', 'ABD', 'AWD', 'WO'].includes(state);
      if (isFinished) return;

      const leagueId = fixture.league?.id || 'unknown';
      if (!groups[leagueId]) {
        groups[leagueId] = {
          league: fixture.league,
          fixtures: [],
        };
      }
      groups[leagueId].fixtures.push(fixture);
    });

    // Sort fixtures within each league
    Object.values(groups).forEach(group => {
      group.fixtures.sort((a, b) => {
        const timeA = a.starting_at ? new Date(a.starting_at) : new Date(0);
        const timeB = b.starting_at ? new Date(b.starting_at) : new Date(0);
        return timeA - timeB;
      });
    });

    return Object.values(groups);
  }, [mergedFixtures, filterLeague]);

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const renderSection = (title, icon, fixtures, sectionKey, iconColor = 'text-dark-400') => {
    if (!fixtures.length) return null;

    return (
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="mb-8"
      >
        <button
          onClick={() => toggleSection(sectionKey)}
          className="w-full flex items-center justify-between mb-4 group"
        >
          <div className="flex items-center gap-3">
            <div className={iconColor}>{icon}</div>
            <h2 className="text-lg font-bold text-white">{title}</h2>
            <span className="px-2 py-0.5 bg-dark-800 text-dark-300 text-sm rounded-full">
              {fixtures.length}
            </span>
          </div>
          <motion.div
            animate={{ rotate: expandedSections[sectionKey] ? 180 : 0 }}
            className="text-dark-500"
          >
            <ChevronDown className="w-5 h-5" />
          </motion.div>
        </button>

        <AnimatePresence>
          {expandedSections[sectionKey] && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="space-y-3 overflow-hidden"
            >
              {fixtures.map((fixture, index) => (
                <MatchCard key={fixture.id} fixture={fixture} index={index} />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with animation */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h1 className="text-4xl font-bold text-gradient mb-2">Live Scores</h1>
        <p className="text-dark-400">Real-time soccer statistics and match updates</p>
      </motion.div>

      {/* Date picker */}
      <DatePicker selectedDate={selectedDate} onDateChange={setSelectedDate} />

      {/* Filters and view toggle */}
      <div className="flex flex-wrap items-center gap-4 justify-between">
        {/* League filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-dark-400" />
          <select
            value={filterLeague || ''}
            onChange={(e) => setFilterLeague(e.target.value ? parseInt(e.target.value) : null)}
            className="bg-dark-800 text-white px-4 py-2 rounded-xl border border-dark-700 focus:border-primary-500 focus:outline-none"
          >
            <option value="">All Leagues</option>
            {leagues.map((league) => (
              <option key={league.id} value={league.id}>
                {league.name}
              </option>
            ))}
          </select>
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-2 bg-dark-800 p-1 rounded-xl">
          <button
            onClick={() => setViewMode('time')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              viewMode === 'time'
                ? 'bg-primary-500 text-white'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            <Clock className="w-4 h-4 inline mr-2" />
            By Time
          </button>
          <button
            onClick={() => setViewMode('league')}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              viewMode === 'league'
                ? 'bg-primary-500 text-white'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            <Calendar className="w-4 h-4 inline mr-2" />
            By League
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <MatchCardSkeleton key={i} />
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
          <button
            onClick={() => setRetryCount(count => count + 1)}
            className="btn-primary"
          >
            Retry
          </button>
        </motion.div>
      )}

      {/* Fixtures list */}
      {!loading && !error && (
        <>
          {viewMode === 'time' ? (
            <>
              {renderSection(
                'Live Now',
                <Flame className="w-5 h-5" />,
                categorizedFixtures.live,
                'live',
                'text-accent-red'
              )}
              {renderSection(
                'Starting Soon',
                <Clock className="w-5 h-5" />,
                categorizedFixtures.soon,
                'soon',
                'text-accent-cyan'
              )}
              {renderSection(
                'Later Today',
                <Calendar className="w-5 h-5" />,
                categorizedFixtures.later,
                'later',
                'text-dark-400'
              )}
            </>
          ) : (
            fixturesByLeague.map((group) => (
              <motion.section
                key={group.league?.id || 'unknown'}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mb-8"
              >
                <div className="flex items-center gap-3 mb-4">
                  {group.league?.image_path && (
                    <img
                      src={group.league.image_path}
                      alt={group.league.name}
                      className="w-8 h-8 object-contain"
                    />
                  )}
                  <h2 className="text-lg font-bold text-white">
                    {group.league?.name || 'Unknown League'}
                  </h2>
                  <span className="px-2 py-0.5 bg-dark-800 text-dark-300 text-sm rounded-full">
                    {group.fixtures.length}
                  </span>
                </div>
                <div className="space-y-3">
                  {group.fixtures.map((fixture, index) => (
                    <MatchCard key={fixture.id} fixture={fixture} index={index} />
                  ))}
                </div>
              </motion.section>
            ))
          )}

          {/* Empty state */}
          {mergedFixtures.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16"
            >
              <Calendar className="w-16 h-16 text-dark-600 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">No matches scheduled</h3>
              <p className="text-dark-400">
                There are no matches scheduled for this date.
              </p>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
