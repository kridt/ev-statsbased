import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Users, User, X, Loader } from 'lucide-react';
import { teamsApi, playersApi } from '../services/api';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('teams'); // 'teams' or 'players'
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Debounced search
  const search = useCallback(async (searchQuery, type) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      const response = type === 'teams'
        ? await teamsApi.search(searchQuery)
        : await playersApi.search(searchQuery);
      setResults(response.data || []);
    } catch (err) {
      console.error('Search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounce effect
  useEffect(() => {
    const timer = setTimeout(() => {
      search(query, searchType);
    }, 300);

    return () => clearTimeout(timer);
  }, [query, searchType, search]);

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setSearched(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-4xl font-bold text-gradient mb-2">Search</h1>
        <p className="text-dark-400">Find teams and players</p>
      </motion.div>

      {/* Search input */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative"
      >
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          {loading ? (
            <Loader className="w-5 h-5 text-dark-400 animate-spin" />
          ) : (
            <Search className="w-5 h-5 text-dark-400" />
          )}
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${searchType}...`}
          className="w-full pl-12 pr-12 py-4 bg-dark-800 rounded-2xl border border-dark-700 focus:border-primary-500 focus:outline-none text-white placeholder-dark-500 text-lg"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute inset-y-0 right-4 flex items-center text-dark-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </motion.div>

      {/* Search type toggle */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-2 bg-dark-800 p-1 rounded-xl">
          <button
            onClick={() => setSearchType('teams')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              searchType === 'teams'
                ? 'bg-primary-500 text-white'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            Teams
          </button>
          <button
            onClick={() => setSearchType('players')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              searchType === 'players'
                ? 'bg-primary-500 text-white'
                : 'text-dark-400 hover:text-white'
            }`}
          >
            <User className="w-4 h-4" />
            Players
          </button>
        </div>
      </div>

      {/* Results */}
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center py-8"
          >
            <Loader className="w-8 h-8 text-primary-500 animate-spin mx-auto" />
            <p className="text-dark-400 mt-2">Searching...</p>
          </motion.div>
        )}

        {!loading && searched && results.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center py-12"
          >
            <Search className="w-12 h-12 text-dark-600 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">No results found</h3>
            <p className="text-dark-400">
              Try a different search term or search type
            </p>
          </motion.div>
        )}

        {!loading && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-3"
          >
            <p className="text-sm text-dark-400">
              {results.length} result{results.length !== 1 ? 's' : ''} found
            </p>

            {searchType === 'teams' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {results.map((team, index) => (
                  <motion.div
                    key={team.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Link
                      to={`/team/${team.id}`}
                      className="card p-4 flex items-center gap-4 hover:bg-dark-800/70 transition-colors"
                    >
                      {team.image_path ? (
                        <img
                          src={team.image_path}
                          alt={team.name}
                          className="w-12 h-12 object-contain"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-dark-700 rounded-full flex items-center justify-center">
                          <Users className="w-6 h-6 text-dark-500" />
                        </div>
                      )}
                      <div>
                        <div className="text-white font-medium">{team.name}</div>
                        {team.country && (
                          <div className="text-sm text-dark-400">{team.country.name}</div>
                        )}
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {results.map((player, index) => (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Link
                      to={`/player/${player.id}`}
                      className="card p-4 flex items-center gap-4 hover:bg-dark-800/70 transition-colors"
                    >
                      {player.image_path ? (
                        <img
                          src={player.image_path}
                          alt={player.name}
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-dark-700 rounded-full flex items-center justify-center">
                          <User className="w-6 h-6 text-dark-500" />
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="text-white font-medium">
                          {player.display_name || player.name}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-dark-400">
                          {player.team && (
                            <>
                              {player.team.image_path && (
                                <img
                                  src={player.team.image_path}
                                  alt=""
                                  className="w-4 h-4"
                                />
                              )}
                              <span>{player.team.name}</span>
                            </>
                          )}
                          {player.position && (
                            <span className="text-dark-500">• {player.position.name}</span>
                          )}
                        </div>
                      </div>
                      {player.nationality && (
                        <span className="text-xs text-dark-500">
                          {player.nationality.name}
                        </span>
                      )}
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {!loading && !searched && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12"
          >
            <Search className="w-16 h-16 text-dark-600 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-white mb-2">Start searching</h3>
            <p className="text-dark-400">
              Enter at least 2 characters to search for {searchType}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
