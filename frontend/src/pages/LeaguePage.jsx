import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Star, Trophy, Table, Award, Calendar
} from 'lucide-react';
import { leaguesApi } from '../services/api';
import { useFavorites } from '../context/FavoritesContext';
import LoadingSpinner from '../components/LoadingSpinner';

const tabs = [
  { id: 'standings', label: 'Standings', icon: Table },
  { id: 'topscorers', label: 'Top Scorers', icon: Award },
];

export default function LeaguePage() {
  const { id } = useParams();
  const [league, setLeague] = useState(null);
  const [standings, setStandings] = useState([]);
  const [topScorers, setTopScorers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('standings');
  const [currentSeason, setCurrentSeason] = useState(null);

  const { isFavoriteLeague, toggleFavoriteLeague } = useFavorites();

  useEffect(() => {
    const fetchLeagueData = async () => {
      setLoading(true);
      setError(null);
      try {
        // Get current season
        const seasonRes = await leaguesApi.getCurrentSeason(id);
        const season = seasonRes.data;
        setCurrentSeason(season);

        if (season?.id) {
          // Fetch standings and top scorers
          const [standingsRes, scorersRes] = await Promise.all([
            leaguesApi.getStandings(season.id),
            leaguesApi.getTopScorers(season.id),
          ]);
          setStandings(standingsRes.data || []);
          setTopScorers(scorersRes.data || []);
        }

        // Get leagues list to find this league's info
        const leaguesRes = await leaguesApi.getAll();
        const foundLeague = leaguesRes.data?.find(l => l.id === parseInt(id));
        setLeague(foundLeague);
      } catch (err) {
        console.error('Error fetching league:', err);
        setError('Failed to load league details.');
      } finally {
        setLoading(false);
      }
    };

    fetchLeagueData();
  }, [id]);

  if (loading) return <LoadingSpinner text="Loading league..." />;
  if (error) return (
    <div className="text-center py-12">
      <p className="text-accent-red mb-4">{error}</p>
      <Link to="/" className="btn-primary">Back to Home</Link>
    </div>
  );

  const leagueData = {
    id: parseInt(id),
    name: league?.name || 'League',
    image: league?.image_path,
  };

  // Process standings - group by stage/round if needed
  const standingsData = standings.flatMap(s => s.details || [s]);

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
          onClick={() => toggleFavoriteLeague(leagueData)}
          className={`p-2 rounded-xl ${
            isFavoriteLeague(parseInt(id))
              ? 'bg-accent-yellow/20 text-accent-yellow'
              : 'bg-dark-800 text-dark-400 hover:text-white'
          } transition-colors`}
        >
          <Star className={`w-5 h-5 ${isFavoriteLeague(parseInt(id)) ? 'fill-current' : ''}`} />
        </button>
      </div>

      {/* League header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-6"
      >
        <div className="flex items-center gap-6">
          {league?.image_path && (
            <motion.img
              whileHover={{ scale: 1.1 }}
              src={league.image_path}
              alt={league.name}
              className="w-20 h-20 object-contain"
            />
          )}
          <div>
            <h1 className="text-3xl font-bold text-white">{league?.name || 'League'}</h1>
            {league?.country && (
              <p className="text-dark-400 mt-1">{league.country.name}</p>
            )}
            {currentSeason && (
              <div className="flex items-center gap-2 mt-2 text-sm text-dark-400">
                <Calendar className="w-4 h-4" />
                <span>{currentSeason.name}</span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
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
          className="card overflow-hidden"
        >
          {activeTab === 'standings' && (
            <StandingsTable standings={standingsData} />
          )}
          {activeTab === 'topscorers' && (
            <TopScorersTable scorers={topScorers} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function StandingsTable({ standings }) {
  if (!standings.length) {
    return <p className="text-dark-400 text-center py-8">Standings not available</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-dark-400 text-sm border-b border-dark-700">
            <th className="px-4 py-3 text-left">#</th>
            <th className="px-4 py-3 text-left">Team</th>
            <th className="px-4 py-3 text-center">MP</th>
            <th className="px-4 py-3 text-center">W</th>
            <th className="px-4 py-3 text-center">D</th>
            <th className="px-4 py-3 text-center">L</th>
            <th className="px-4 py-3 text-center">GF</th>
            <th className="px-4 py-3 text-center">GA</th>
            <th className="px-4 py-3 text-center">GD</th>
            <th className="px-4 py-3 text-center">Pts</th>
            <th className="px-4 py-3 text-center hidden md:table-cell">Form</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, index) => {
            const team = row.participant || row.team;
            const position = row.position || index + 1;

            // Determine row highlight color based on position
            let rowClass = '';
            if (position <= 4) rowClass = 'border-l-4 border-l-accent-green';
            else if (position >= standings.length - 2) rowClass = 'border-l-4 border-l-accent-red';

            // Get form from recent results
            const recentForm = row.recent_form || row.form || '';

            return (
              <motion.tr
                key={team?.id || index}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.02 }}
                className={`border-b border-dark-800 hover:bg-dark-800/50 transition-colors ${rowClass}`}
              >
                <td className="px-4 py-3 text-dark-400">{position}</td>
                <td className="px-4 py-3">
                  <Link
                    to={`/team/${team?.id}`}
                    className="flex items-center gap-3 hover:text-primary-400 transition-colors"
                  >
                    {team?.image_path && (
                      <img src={team.image_path} alt="" className="w-6 h-6" />
                    )}
                    <span className="text-white font-medium">{team?.name || 'Unknown'}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-center text-dark-300">{row.games_played ?? row.overall?.games_played ?? '-'}</td>
                <td className="px-4 py-3 text-center text-accent-green">{row.won ?? row.overall?.won ?? '-'}</td>
                <td className="px-4 py-3 text-center text-dark-400">{row.draw ?? row.overall?.draw ?? '-'}</td>
                <td className="px-4 py-3 text-center text-accent-red">{row.lost ?? row.overall?.lost ?? '-'}</td>
                <td className="px-4 py-3 text-center text-dark-300">{row.goals_scored ?? row.overall?.goals_scored ?? '-'}</td>
                <td className="px-4 py-3 text-center text-dark-300">{row.goals_against ?? row.overall?.goals_against ?? '-'}</td>
                <td className="px-4 py-3 text-center">
                  <span className={
                    (row.goal_difference ?? row.overall?.goal_difference ?? 0) > 0
                      ? 'text-accent-green'
                      : (row.goal_difference ?? row.overall?.goal_difference ?? 0) < 0
                      ? 'text-accent-red'
                      : 'text-dark-400'
                  }>
                    {row.goal_difference ?? row.overall?.goal_difference ?? '-'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center font-bold text-white">{row.points ?? '-'}</td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <div className="flex gap-1 justify-center">
                    {recentForm.split('').slice(0, 5).map((result, i) => (
                      <span
                        key={i}
                        className={`w-5 h-5 rounded text-xs flex items-center justify-center font-bold ${
                          result === 'W'
                            ? 'bg-accent-green/20 text-accent-green'
                            : result === 'L'
                            ? 'bg-accent-red/20 text-accent-red'
                            : 'bg-dark-600/50 text-dark-300'
                        }`}
                      >
                        {result}
                      </span>
                    ))}
                  </div>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TopScorersTable({ scorers }) {
  if (!scorers.length) {
    return <p className="text-dark-400 text-center py-8">Top scorers not available</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-dark-400 text-sm border-b border-dark-700">
            <th className="px-4 py-3 text-left">#</th>
            <th className="px-4 py-3 text-left">Player</th>
            <th className="px-4 py-3 text-left">Team</th>
            <th className="px-4 py-3 text-center">Goals</th>
            <th className="px-4 py-3 text-center hidden md:table-cell">Assists</th>
            <th className="px-4 py-3 text-center hidden md:table-cell">Played</th>
          </tr>
        </thead>
        <tbody>
          {scorers.slice(0, 20).map((scorer, index) => {
            const player = scorer.player;
            const team = scorer.participant || scorer.team;

            return (
              <motion.tr
                key={player?.id || index}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.02 }}
                className="border-b border-dark-800 hover:bg-dark-800/50 transition-colors"
              >
                <td className="px-4 py-3">
                  {index < 3 ? (
                    <span className={`text-lg ${
                      index === 0 ? 'text-accent-yellow' :
                      index === 1 ? 'text-dark-300' :
                      'text-accent-orange'
                    }`}>
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                    </span>
                  ) : (
                    <span className="text-dark-400">{index + 1}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/player/${player?.id}`}
                    className="flex items-center gap-3 hover:text-primary-400 transition-colors"
                  >
                    {player?.image_path ? (
                      <img src={player.image_path} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 bg-dark-700 rounded-full" />
                    )}
                    <span className="text-white font-medium">{player?.display_name || player?.name}</span>
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/team/${team?.id}`}
                    className="flex items-center gap-2 hover:text-primary-400 transition-colors"
                  >
                    {team?.image_path && (
                      <img src={team.image_path} alt="" className="w-5 h-5" />
                    )}
                    <span className="text-dark-300">{team?.name}</span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="text-xl font-bold text-accent-green">{scorer.total || scorer.goals || 0}</span>
                </td>
                <td className="px-4 py-3 text-center hidden md:table-cell text-dark-300">
                  {scorer.assists || 0}
                </td>
                <td className="px-4 py-3 text-center hidden md:table-cell text-dark-400">
                  {scorer.games_played || scorer.appearances || '-'}
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
