import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Star, Clock, Calendar } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { useFavorites } from '../context/FavoritesContext';
import { useToast } from '../context/ToastContext';

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

// Match state descriptions
const STATE_LABELS = {
  NS: 'Not Started',
  INPLAY_1ST_HALF: '1st Half',
  INPLAY_2ND_HALF: '2nd Half',
  HT: 'Half Time',
  FT: 'Full Time',
  FT_PEN: 'Full Time (Pen)',
  AET: 'After Extra Time',
  BREAK: 'Break',
  ET: 'Extra Time',
  PEN_LIVE: 'Penalties',
  SUSP: 'Suspended',
  INT: 'Interrupted',
  POSTP: 'Postponed',
  CANC: 'Cancelled',
  ABD: 'Abandoned',
  AWD: 'Awarded',
  WO: 'Walkover',
  LIVE: 'Live',
};

export default function MatchCard({ fixture, showDate = false, index = 0 }) {
  const { isFavoriteMatch, toggleFavoriteMatch } = useFavorites();
  const { showFavoriteAdded, showFavoriteRemoved } = useToast();

  const homeTeam = fixture.participants?.find(p => p.meta?.location === 'home');
  const awayTeam = fixture.participants?.find(p => p.meta?.location === 'away');

  const scores = fixture.scores || [];
  const homeScore = scores.find(s => s.description === 'CURRENT' && s.score?.participant === 'home')?.score?.goals ??
                    scores.filter(s => s.score?.participant === 'home').reduce((sum, s) => sum + (s.score?.goals || 0), 0);
  const awayScore = scores.find(s => s.description === 'CURRENT' && s.score?.participant === 'away')?.score?.goals ??
                    scores.filter(s => s.score?.participant === 'away').reduce((sum, s) => sum + (s.score?.goals || 0), 0);

  const state = fixture.state?.state || fixture.state?.short_name || 'NS';
  const isLive = ['INPLAY_1ST_HALF', 'INPLAY_2ND_HALF', 'HT', 'BREAK', 'ET', 'PEN_LIVE', 'LIVE'].includes(state);
  const isFinished = ['FT', 'FT_PEN', 'AET', 'ABD', 'AWD', 'WO'].includes(state);
  const startTime = parseUTCDate(fixture.starting_at);

  const matchMinute = fixture.state?.minute || 0;
  const matchSecond = fixture.state?.second || fixture.state?.seconds || 0;

  // Live timer state - counts seconds between API updates
  const [displaySeconds, setDisplaySeconds] = useState(matchSecond);

  useEffect(() => {
    if (!isLive || state === 'HT' || state === 'BREAK') {
      setDisplaySeconds(0);
      return;
    }

    // Reset seconds when minute changes from API
    setDisplaySeconds(matchSecond);

    // Count up every second when match is live and playing
    const interval = setInterval(() => {
      setDisplaySeconds(prev => {
        if (prev >= 59) return 0; // Reset at 60, minute will update from API
        return prev + 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isLive, matchMinute, matchSecond, state]);

  const matchData = {
    id: fixture.id,
    homeTeam: homeTeam?.name,
    awayTeam: awayTeam?.name,
    league: fixture.league?.name,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className="group"
    >
      <Link to={`/match/${fixture.id}`}>
        <div className={`card card-hover p-4 ${isLive ? 'ring-2 ring-accent-red/50 live-indicator' : ''}`}>
          {/* League info */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {fixture.league?.image_path && (
                <img
                  src={fixture.league.image_path}
                  alt={fixture.league.name}
                  className="w-5 h-5 object-contain"
                />
              )}
              <span className="text-xs text-dark-400 truncate max-w-[150px]">
                {fixture.league?.name}
              </span>
            </div>
            <button
              onClick={(e) => {
                e.preventDefault();
                const wasAlreadyFavorite = isFavoriteMatch(fixture.id);
                toggleFavoriteMatch(matchData);
                const matchName = `${homeTeam?.name || 'Home'} vs ${awayTeam?.name || 'Away'}`;
                if (wasAlreadyFavorite) {
                  showFavoriteRemoved(matchName);
                } else {
                  showFavoriteAdded(matchName);
                }
              }}
              className={`p-1 rounded-lg transition-colors ${
                isFavoriteMatch(fixture.id)
                  ? 'text-accent-yellow'
                  : 'text-dark-500 hover:text-dark-300'
              }`}
            >
              <Star className={`w-4 h-4 ${isFavoriteMatch(fixture.id) ? 'fill-current' : ''}`} />
            </button>
          </div>

          {/* Teams and score */}
          <div className="flex items-center gap-4">
            {/* Home team */}
            <div className="flex-1 flex items-center gap-3">
              {homeTeam?.image_path && (
                <motion.img
                  whileHover={{ scale: 1.1 }}
                  src={homeTeam.image_path}
                  alt={homeTeam.name}
                  className="w-10 h-10 object-contain"
                />
              )}
              <span className="font-medium text-white truncate">{homeTeam?.name || 'Home'}</span>
            </div>

            {/* Score / Time */}
            <div className="flex flex-col items-center min-w-[80px]">
              {isLive || isFinished ? (
                <>
                  <div className="flex items-center gap-2 text-2xl font-bold">
                    <motion.span
                      key={`home-${homeScore}`}
                      initial={{ scale: 1.2 }}
                      animate={{ scale: 1 }}
                      className={homeScore > awayScore ? 'text-accent-green' : 'text-white'}
                    >
                      {homeScore}
                    </motion.span>
                    <span className="text-dark-500">-</span>
                    <motion.span
                      key={`away-${awayScore}`}
                      initial={{ scale: 1.2 }}
                      animate={{ scale: 1 }}
                      className={awayScore > homeScore ? 'text-accent-green' : 'text-white'}
                    >
                      {awayScore}
                    </motion.span>
                  </div>
                  {isLive && (
                    <div className="flex items-center gap-1 text-xs text-accent-red font-medium">
                      <span className="w-2 h-2 bg-accent-red rounded-full animate-pulse" />
                      {state === 'HT' ? 'HT' : state === 'BREAK' ? 'Break' : (
                        <span className="font-mono">
                          {String(matchMinute).padStart(2, '0')}:{String(displaySeconds).padStart(2, '0')}
                        </span>
                      )}
                    </div>
                  )}
                  {isFinished && (
                    <span className="text-xs text-dark-400">
                      {STATE_LABELS[state] || state}
                    </span>
                  )}
                </>
              ) : startTime ? (
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1 text-sm text-dark-300">
                    <Clock className="w-4 h-4" />
                    {formatInTimeZone(startTime, CET_TIMEZONE, 'HH:mm')}
                  </div>
                  {showDate && (
                    <span className="text-xs text-dark-500 mt-1">
                      {formatInTimeZone(startTime, CET_TIMEZONE, 'MMM d')}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-sm text-dark-500">TBD</span>
              )}
            </div>

            {/* Away team */}
            <div className="flex-1 flex items-center gap-3 justify-end">
              <span className="font-medium text-white truncate text-right">{awayTeam?.name || 'Away'}</span>
              {awayTeam?.image_path && (
                <motion.img
                  whileHover={{ scale: 1.1 }}
                  src={awayTeam.image_path}
                  alt={awayTeam.name}
                  className="w-10 h-10 object-contain"
                />
              )}
            </div>
          </div>

          {/* Live indicator bar */}
          {isLive && (
            <motion.div
              className="mt-3 h-1 bg-dark-700 rounded-full overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <motion.div
                className="h-full bg-gradient-to-r from-accent-red to-accent-orange"
                initial={{ width: '0%' }}
                animate={{ width: `${Math.min((parseInt(matchMinute) || 0) / 90 * 100, 100)}%` }}
                transition={{ duration: 0.5 }}
              />
            </motion.div>
          )}
        </div>
      </Link>
    </motion.div>
  );
}
