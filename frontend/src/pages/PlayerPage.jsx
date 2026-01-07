import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, differenceInYears } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import {
  ArrowLeft, MapPin, Calendar, Ruler, Scale,
  Trophy, TrendingUp, User
} from 'lucide-react';
import { playersApi } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

const CET_TIMEZONE = 'Europe/Berlin';

export default function PlayerPage() {
  const { id } = useParams();
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPlayer = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await playersApi.getById(id);
        setPlayer(response.data);
      } catch (err) {
        console.error('Error fetching player:', err);
        setError('Failed to load player details.');
      } finally {
        setLoading(false);
      }
    };

    fetchPlayer();
  }, [id]);

  if (loading) return <LoadingSpinner text="Loading player..." />;
  if (error) return (
    <div className="text-center py-12">
      <p className="text-accent-red mb-4">{error}</p>
      <Link to="/" className="btn-primary">Back to Home</Link>
    </div>
  );
  if (!player) return null;

  const age = player.date_of_birth
    ? differenceInYears(new Date(), new Date(player.date_of_birth))
    : null;

  const statistics = player.statistics || [];
  const transfers = player.transfers || [];
  const trophies = player.trophies || [];

  // Process season statistics
  const seasonStats = statistics.reduce((acc, stat) => {
    stat.details?.forEach(detail => {
      const typeName = detail.type?.name || 'Unknown';
      if (!acc[typeName]) acc[typeName] = 0;
      acc[typeName] += detail.value?.total || detail.value || 0;
    });
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link
        to="/"
        className="flex items-center gap-2 text-dark-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Back</span>
      </Link>

      {/* Player header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-6"
      >
        <div className="flex flex-col md:flex-row items-center gap-6">
          {/* Player image */}
          <div className="relative">
            {player.image_path ? (
              <motion.img
                whileHover={{ scale: 1.05 }}
                src={player.image_path}
                alt={player.name}
                className="w-32 h-32 rounded-full object-cover border-4 border-primary-500/30"
              />
            ) : (
              <div className="w-32 h-32 rounded-full bg-dark-800 flex items-center justify-center border-4 border-primary-500/30">
                <User className="w-16 h-16 text-dark-500" />
              </div>
            )}
            {player.jersey_number && (
              <div className="absolute -bottom-2 -right-2 w-10 h-10 bg-primary-500 rounded-full flex items-center justify-center font-bold text-white">
                {player.jersey_number}
              </div>
            )}
          </div>

          {/* Player info */}
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-3xl font-bold text-white">{player.display_name || player.name}</h1>

            {/* Position */}
            {player.position && (
              <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 bg-primary-500/20 text-primary-400 rounded-full text-sm">
                {player.position.name || player.detailedPosition?.name}
              </div>
            )}

            {/* Team */}
            {player.team && (
              <Link
                to={`/team/${player.team.id}`}
                className="flex items-center gap-2 mt-4 justify-center md:justify-start hover:opacity-80 transition-opacity"
              >
                {player.team.image_path && (
                  <img src={player.team.image_path} alt="" className="w-6 h-6" />
                )}
                <span className="text-dark-300">{player.team.name}</span>
              </Link>
            )}

            {/* Details grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              {player.nationality && (
                <div className="flex items-center gap-2 text-dark-400">
                  <MapPin className="w-4 h-4" />
                  <span>{player.nationality.name}</span>
                </div>
              )}
              {age && (
                <div className="flex items-center gap-2 text-dark-400">
                  <Calendar className="w-4 h-4" />
                  <span>{age} years old</span>
                </div>
              )}
              {player.height && (
                <div className="flex items-center gap-2 text-dark-400">
                  <Ruler className="w-4 h-4" />
                  <span>{player.height} cm</span>
                </div>
              )}
              {player.weight && (
                <div className="flex items-center gap-2 text-dark-400">
                  <Scale className="w-4 h-4" />
                  <span>{player.weight} kg</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Season Statistics */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card p-6"
      >
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-accent-cyan" />
          Season Statistics
        </h2>

        {Object.keys(seasonStats).length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Object.entries(seasonStats).map(([name, value], index) => (
              <motion.div
                key={name}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                className="p-4 bg-dark-800/50 rounded-xl text-center"
              >
                <div className="text-2xl font-bold text-white">{value}</div>
                <div className="text-xs text-dark-400 mt-1 capitalize">
                  {name.replace(/_/g, ' ')}
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="text-dark-400 text-center py-4">No statistics available</p>
        )}
      </motion.div>

      {/* Transfer History */}
      {transfers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card p-6"
        >
          <h2 className="text-lg font-bold text-white mb-4">Transfer History</h2>
          <div className="space-y-3">
            {transfers.slice(0, 10).map((transfer, index) => (
              <motion.div
                key={transfer.id || index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center justify-between p-3 bg-dark-800/50 rounded-xl"
              >
                <div className="flex items-center gap-4">
                  <span className="text-sm text-dark-400">
                    {transfer.date && format(new Date(transfer.date), 'MMM yyyy')}
                  </span>
                  <div className="flex items-center gap-2">
                    {transfer.from_team?.image_path && (
                      <img src={transfer.from_team.image_path} alt="" className="w-5 h-5" />
                    )}
                    <span className="text-dark-400">{transfer.from_team?.name || 'Unknown'}</span>
                    <span className="text-dark-600">→</span>
                    {transfer.to_team?.image_path && (
                      <img src={transfer.to_team.image_path} alt="" className="w-5 h-5" />
                    )}
                    <span className="text-white">{transfer.to_team?.name || 'Unknown'}</span>
                  </div>
                </div>
                {transfer.amount && (
                  <span className="text-accent-green font-medium">
                    €{(transfer.amount / 1000000).toFixed(1)}M
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Trophies */}
      {trophies.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card p-6"
        >
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-accent-yellow" />
            Trophies
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {trophies.map((trophy, index) => (
              <motion.div
                key={trophy.id || index}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.05 }}
                className="p-4 bg-dark-800/50 rounded-xl text-center"
              >
                <div className="text-accent-yellow text-2xl mb-2">🏆</div>
                <div className="text-sm text-white font-medium">
                  {trophy.league?.name || trophy.trophy?.name || 'Trophy'}
                </div>
                <div className="text-xs text-dark-400 mt-1">
                  {trophy.season?.name || trophy.season}
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
