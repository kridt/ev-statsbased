import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Star, Users, Trophy, Calendar, X } from 'lucide-react';
import { useFavorites } from '../context/FavoritesContext';

export default function FavoritesPage() {
  const {
    favorites,
    removeFavoriteTeam,
    removeFavoriteMatch,
    removeFavoriteLeague,
  } = useFavorites();

  const hasAnyFavorites =
    favorites.teams.length > 0 ||
    favorites.matches.length > 0 ||
    favorites.leagues.length > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-4xl font-bold text-gradient mb-2">Favorites</h1>
        <p className="text-dark-400">Quick access to your starred items</p>
      </motion.div>

      {!hasAnyFavorites ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <Star className="w-16 h-16 text-dark-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No favorites yet</h3>
          <p className="text-dark-400 mb-6">
            Star teams, matches, and leagues to see them here
          </p>
          <Link to="/" className="btn-primary">
            Browse Matches
          </Link>
        </motion.div>
      ) : (
        <div className="space-y-8">
          {/* Favorite Teams */}
          {favorites.teams.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-primary-400" />
                Teams
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {favorites.teams.map((team, index) => (
                  <motion.div
                    key={team.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="card p-4 flex items-center gap-4"
                  >
                    <Link
                      to={`/team/${team.id}`}
                      className="flex items-center gap-4 flex-1 hover:opacity-80 transition-opacity"
                    >
                      {team.image ? (
                        <img src={team.image} alt={team.name} className="w-12 h-12 object-contain" />
                      ) : (
                        <div className="w-12 h-12 bg-dark-700 rounded-full flex items-center justify-center">
                          <Users className="w-6 h-6 text-dark-500" />
                        </div>
                      )}
                      <span className="text-white font-medium">{team.name}</span>
                    </Link>
                    <button
                      onClick={() => removeFavoriteTeam(team.id)}
                      className="p-2 text-dark-500 hover:text-accent-red transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}

          {/* Favorite Matches */}
          {favorites.matches.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-accent-cyan" />
                Matches
              </h2>
              <div className="space-y-3">
                {favorites.matches.map((match, index) => (
                  <motion.div
                    key={match.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="card p-4 flex items-center justify-between"
                  >
                    <Link
                      to={`/match/${match.id}`}
                      className="flex-1 hover:opacity-80 transition-opacity"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-white font-medium">
                          {match.homeTeam} vs {match.awayTeam}
                        </div>
                        <span className="text-xs text-dark-500">{match.league}</span>
                      </div>
                    </Link>
                    <button
                      onClick={() => removeFavoriteMatch(match.id)}
                      className="p-2 text-dark-500 hover:text-accent-red transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}

          {/* Favorite Leagues */}
          {favorites.leagues.length > 0 && (
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-accent-yellow" />
                Leagues
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {favorites.leagues.map((league, index) => (
                  <motion.div
                    key={league.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.05 }}
                    className="card p-4 flex items-center gap-4"
                  >
                    <Link
                      to={`/league/${league.id}`}
                      className="flex items-center gap-4 flex-1 hover:opacity-80 transition-opacity"
                    >
                      {league.image ? (
                        <img src={league.image} alt={league.name} className="w-10 h-10 object-contain" />
                      ) : (
                        <div className="w-10 h-10 bg-dark-700 rounded-full flex items-center justify-center">
                          <Trophy className="w-5 h-5 text-dark-500" />
                        </div>
                      )}
                      <span className="text-white font-medium">{league.name}</span>
                    </Link>
                    <button
                      onClick={() => removeFavoriteLeague(league.id)}
                      className="p-2 text-dark-500 hover:text-accent-red transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}
        </div>
      )}
    </div>
  );
}
