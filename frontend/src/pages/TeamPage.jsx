import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import {
  ArrowLeft, Star, MapPin, Users, Trophy, Calendar,
  TrendingUp, BarChart3, User
} from 'lucide-react';
import { teamsApi } from '../services/api';
import { useFavorites } from '../context/FavoritesContext';
import { useToast } from '../context/ToastContext';
import LoadingSpinner from '../components/LoadingSpinner';

const CET_TIMEZONE = 'Europe/Berlin';

// Helper to parse UTC date string (SportMonks may not include Z suffix)
const parseUTCDate = (dateStr) => {
  if (!dateStr) return null;
  if (!dateStr.includes('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
    return new Date(dateStr + 'Z');
  }
  return new Date(dateStr);
};

const tabs = [
  { id: 'overview', label: 'Overview', icon: Trophy },
  { id: 'squad', label: 'Squad', icon: Users },
  { id: 'form', label: 'Form', icon: TrendingUp },
  { id: 'stats', label: 'Statistics', icon: BarChart3 },
];

export default function TeamPage() {
  const { id } = useParams();
  const [team, setTeam] = useState(null);
  const [form, setForm] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const { isFavoriteTeam, toggleFavoriteTeam } = useFavorites();
  const { showFavoriteAdded, showFavoriteRemoved } = useToast();

  useEffect(() => {
    const fetchTeam = async () => {
      setLoading(true);
      setError(null);
      try {
        const [teamRes, formRes] = await Promise.all([
          teamsApi.getById(id),
          teamsApi.getForm(id, 10),
        ]);
        setTeam(teamRes.data);
        setForm(formRes.data || []);
      } catch (err) {
        console.error('Error fetching team:', err);
        setError('Failed to load team details.');
      } finally {
        setLoading(false);
      }
    };

    fetchTeam();
  }, [id]);

  if (loading) return <LoadingSpinner text="Loading team..." />;
  if (error) return (
    <div className="text-center py-12">
      <p className="text-accent-red mb-4">{error}</p>
      <Link to="/" className="btn-primary">Back to Home</Link>
    </div>
  );
  if (!team) return null;

  const teamData = {
    id: team.id,
    name: team.name,
    image: team.image_path,
  };

  const players = team.players || [];
  const statistics = team.statistics || [];
  const upcoming = team.upcoming || [];
  const latest = team.latest || [];

  // Calculate form
  const formResults = form.map(match => {
    const isHome = match.participants?.find(p => p.meta?.location === 'home')?.id === team.id;
    const homeScore = match.scores?.find(s => s.score?.participant === 'home')?.score?.goals || 0;
    const awayScore = match.scores?.find(s => s.score?.participant === 'away')?.score?.goals || 0;

    if (isHome) {
      if (homeScore > awayScore) return 'W';
      if (homeScore < awayScore) return 'L';
      return 'D';
    } else {
      if (awayScore > homeScore) return 'W';
      if (awayScore < homeScore) return 'L';
      return 'D';
    }
  });

  return (
    <div className="space-y-6">
      {/* Back and favorite */}
      <div className="flex items-center justify-between">
        <Link
          to="/"
          className="flex items-center gap-2 text-dark-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </Link>
        <button
          onClick={() => {
            const wasAlreadyFavorite = isFavoriteTeam(team.id);
            toggleFavoriteTeam(teamData);
            if (wasAlreadyFavorite) {
              showFavoriteRemoved(team.name || 'Team');
            } else {
              showFavoriteAdded(team.name || 'Team');
            }
          }}
          className={`p-2 rounded-xl ${
            isFavoriteTeam(team.id)
              ? 'bg-accent-yellow/20 text-accent-yellow'
              : 'bg-dark-800 text-dark-400 hover:text-white'
          } transition-colors`}
        >
          <Star className={`w-5 h-5 ${isFavoriteTeam(team.id) ? 'fill-current' : ''}`} />
        </button>
      </div>

      {/* Team header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-6"
      >
        <div className="flex items-center gap-6">
          {team.image_path && (
            <motion.img
              whileHover={{ scale: 1.1 }}
              src={team.image_path}
              alt={team.name}
              className="w-24 h-24 object-contain"
            />
          )}
          <div>
            <h1 className="text-3xl font-bold text-white">{team.name}</h1>
            {team.country && (
              <p className="text-dark-400 flex items-center gap-2 mt-2">
                <MapPin className="w-4 h-4" />
                {team.country.name}
              </p>
            )}
            {team.venue && (
              <p className="text-dark-400 flex items-center gap-2 mt-1">
                <Trophy className="w-4 h-4" />
                {team.venue.name}
              </p>
            )}
          </div>
        </div>

        {/* Form indicator */}
        {formResults.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm text-dark-400 mb-2">Recent Form</h4>
            <div className="flex gap-1">
              {formResults.map((result, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.1 }}
                  className={`w-8 h-8 rounded flex items-center justify-center text-sm font-bold ${
                    result === 'W'
                      ? 'bg-accent-green/20 text-accent-green'
                      : result === 'L'
                      ? 'bg-accent-red/20 text-accent-red'
                      : 'bg-dark-600/50 text-dark-300'
                  }`}
                >
                  {result}
                </motion.div>
              ))}
            </div>
          </div>
        )}
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
          className="card p-6"
        >
          {activeTab === 'overview' && (
            <OverviewTab team={team} upcoming={upcoming} latest={latest} />
          )}
          {activeTab === 'squad' && (
            <SquadTab players={players} />
          )}
          {activeTab === 'form' && (
            <FormTab matches={form} teamId={team.id} />
          )}
          {activeTab === 'stats' && (
            <StatsTab statistics={statistics} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function OverviewTab({ team, upcoming, latest }) {
  return (
    <div className="space-y-8">
      {/* Upcoming matches */}
      {upcoming.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-accent-cyan" />
            Upcoming Matches
          </h3>
          <div className="space-y-3">
            {upcoming.slice(0, 5).map((match) => (
              <MatchRow key={match.id} match={match} />
            ))}
          </div>
        </div>
      )}

      {/* Recent results */}
      {latest.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-accent-green" />
            Recent Results
          </h3>
          <div className="space-y-3">
            {latest.slice(0, 5).map((match) => (
              <MatchRow key={match.id} match={match} showScore />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MatchRow({ match, showScore = false }) {
  // Try multiple data structures for team info
  const home = match.participants?.find(p => p.meta?.location === 'home');
  const away = match.participants?.find(p => p.meta?.location === 'away');

  // Fallback to localTeam/visitorTeam or name fields
  const homeName = home?.name || match.localTeam?.name || match.home_team?.name || match.homeTeam?.name || 'TBD';
  const awayName = away?.name || match.visitorTeam?.name || match.away_team?.name || match.awayTeam?.name || 'TBD';
  const homeImage = home?.image_path || match.localTeam?.image_path || match.home_team?.image_path;
  const awayImage = away?.image_path || match.visitorTeam?.image_path || match.away_team?.image_path;

  const homeScore = match.scores?.find(s => s.score?.participant === 'home')?.score?.goals;
  const awayScore = match.scores?.find(s => s.score?.participant === 'away')?.score?.goals;

  return (
    <Link
      to={`/match/${match.id}`}
      className="flex items-center justify-between p-3 bg-dark-800/50 rounded-xl hover:bg-dark-800 transition-colors"
    >
      <div className="flex items-center gap-3">
        {match.league?.image_path && (
          <img src={match.league.image_path} alt="" className="w-5 h-5" />
        )}
        <span className="text-sm text-dark-400">
          {match.starting_at && formatInTimeZone(parseUTCDate(match.starting_at), CET_TIMEZONE, 'MMM d')}
        </span>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {homeImage && <img src={homeImage} alt="" className="w-5 h-5 object-contain" />}
          <span className="text-white">{homeName}</span>
        </div>
        {showScore && homeScore !== undefined && awayScore !== undefined ? (
          <span className="font-bold text-white">{homeScore} - {awayScore}</span>
        ) : (
          <span className="text-dark-400">vs</span>
        )}
        <div className="flex items-center gap-2">
          <span className="text-white">{awayName}</span>
          {awayImage && <img src={awayImage} alt="" className="w-5 h-5 object-contain" />}
        </div>
      </div>
      <span className="text-xs text-dark-500">{match.league?.name}</span>
    </Link>
  );
}

function SquadTab({ players }) {
  const groupedPlayers = players.reduce((acc, player) => {
    const pos = player.position?.name || player.detailedPosition?.name || 'Unknown';
    if (!acc[pos]) acc[pos] = [];
    acc[pos].push(player);
    return acc;
  }, {});

  const positions = ['Goalkeeper', 'Defender', 'Midfielder', 'Attacker', 'Unknown'];

  return (
    <div className="space-y-6">
      {positions.map((position) => {
        const playersInPosition = groupedPlayers[position] || [];
        if (!playersInPosition.length) return null;

        return (
          <div key={position}>
            <h4 className="text-sm text-dark-400 mb-3">{position}s</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {playersInPosition.map((player) => (
                <Link
                  key={player.player_id || player.id}
                  to={`/player/${player.player_id || player.id}`}
                  className="flex items-center gap-3 p-3 bg-dark-800/50 rounded-xl hover:bg-dark-800 transition-colors"
                >
                  {player.image_path ? (
                    <img src={player.image_path} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <div className="w-10 h-10 bg-dark-700 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-dark-500" />
                    </div>
                  )}
                  <div>
                    <div className="text-white font-medium">{player.name || player.display_name}</div>
                    <div className="text-xs text-dark-400">
                      #{player.jersey_number || '-'} • {player.nationality?.name || 'Unknown'}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      })}

      {players.length === 0 && (
        <p className="text-dark-400 text-center py-8">Squad information not available</p>
      )}
    </div>
  );
}

function FormTab({ matches, teamId }) {
  if (!matches.length) {
    return <p className="text-dark-400 text-center py-8">No recent matches</p>;
  }

  return (
    <div className="space-y-3">
      {matches.map((match, index) => {
        const home = match.participants?.find(p => p.meta?.location === 'home');
        const away = match.participants?.find(p => p.meta?.location === 'away');
        const homeScore = match.scores?.find(s => s.score?.participant === 'home')?.score?.goals || 0;
        const awayScore = match.scores?.find(s => s.score?.participant === 'away')?.score?.goals || 0;

        const isHome = home?.id === teamId;
        const teamScore = isHome ? homeScore : awayScore;
        const oppScore = isHome ? awayScore : homeScore;
        const result = teamScore > oppScore ? 'W' : teamScore < oppScore ? 'L' : 'D';
        const opponent = isHome ? away : home;

        return (
          <motion.div
            key={match.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Link
              to={`/match/${match.id}`}
              className="flex items-center gap-4 p-4 bg-dark-800/50 rounded-xl hover:bg-dark-800 transition-colors"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                result === 'W'
                  ? 'bg-accent-green/20 text-accent-green'
                  : result === 'L'
                  ? 'bg-accent-red/20 text-accent-red'
                  : 'bg-dark-600/50 text-dark-300'
              }`}>
                {result}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium">
                    {isHome ? 'vs' : '@'} {opponent?.name}
                  </span>
                </div>
                <div className="text-sm text-dark-400">
                  {match.starting_at && formatInTimeZone(parseUTCDate(match.starting_at), CET_TIMEZONE, 'MMM d, yyyy')}
                  {' • '}
                  {match.league?.name}
                </div>
              </div>
              <div className="text-2xl font-bold text-white">
                {teamScore} - {oppScore}
              </div>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}

function StatsTab({ statistics }) {
  if (!statistics.length) {
    return <p className="text-dark-400 text-center py-8">Statistics not available</p>;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {statistics.map((stat, index) => (
        <motion.div
          key={stat.id || index}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: index * 0.05 }}
          className="p-4 bg-dark-800/50 rounded-xl text-center"
        >
          <div className="text-2xl font-bold text-white">
            {stat.details?.[0]?.value || stat.value || 0}
          </div>
          <div className="text-sm text-dark-400 mt-1">
            {stat.details?.[0]?.type?.name || stat.type?.name || 'Stat'}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
