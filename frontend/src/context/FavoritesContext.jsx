import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const FavoritesContext = createContext(null);

const STORAGE_KEY = 'soccer-stats-favorites';
const DEFAULT_FAVORITES = { teams: [], matches: [], leagues: [] };

/**
 * Validates and sanitizes favorites data structure.
 * Returns valid data or the default structure if data is corrupted.
 */
function validateFavorites(data) {
  // Must be an object
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return DEFAULT_FAVORITES;
  }

  // Validate each array field
  const teams = Array.isArray(data.teams) ? data.teams.filter(t => t && typeof t.id !== 'undefined') : [];
  const matches = Array.isArray(data.matches) ? data.matches.filter(m => m && typeof m.id !== 'undefined') : [];
  const leagues = Array.isArray(data.leagues) ? data.leagues.filter(l => l && typeof l.id !== 'undefined') : [];

  return { teams, matches, leagues };
}

export function FavoritesProvider({ children }) {
  const [favorites, setFavorites] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return DEFAULT_FAVORITES;

      const parsed = JSON.parse(stored);
      const validated = validateFavorites(parsed);

      // If validation changed the data, clear and resave the cleaned version
      if (JSON.stringify(parsed) !== JSON.stringify(validated)) {
        console.warn('[FavoritesContext] Corrupted data detected, cleaning up...');
        localStorage.setItem(STORAGE_KEY, JSON.stringify(validated));
      }

      return validated;
    } catch (error) {
      // JSON parsing failed - clear corrupted data
      console.error('[FavoritesContext] Failed to parse localStorage data:', error);
      localStorage.removeItem(STORAGE_KEY);
      return DEFAULT_FAVORITES;
    }
  });

  // Save to localStorage whenever favorites change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  }, [favorites]);

  const addFavoriteTeam = useCallback((team) => {
    setFavorites((prev) => {
      if (prev.teams.some((t) => t.id === team.id)) return prev;
      return { ...prev, teams: [...prev.teams, team] };
    });
  }, []);

  const removeFavoriteTeam = useCallback((teamId) => {
    setFavorites((prev) => ({
      ...prev,
      teams: prev.teams.filter((t) => t.id !== teamId),
    }));
  }, []);

  const isFavoriteTeam = useCallback((teamId) => {
    return favorites.teams.some((t) => t.id === teamId);
  }, [favorites.teams]);

  const toggleFavoriteTeam = useCallback((team) => {
    if (isFavoriteTeam(team.id)) {
      removeFavoriteTeam(team.id);
    } else {
      addFavoriteTeam(team);
    }
  }, [isFavoriteTeam, removeFavoriteTeam, addFavoriteTeam]);

  const addFavoriteMatch = useCallback((match) => {
    setFavorites((prev) => {
      if (prev.matches.some((m) => m.id === match.id)) return prev;
      return { ...prev, matches: [...prev.matches, match] };
    });
  }, []);

  const removeFavoriteMatch = useCallback((matchId) => {
    setFavorites((prev) => ({
      ...prev,
      matches: prev.matches.filter((m) => m.id !== matchId),
    }));
  }, []);

  const isFavoriteMatch = useCallback((matchId) => {
    return favorites.matches.some((m) => m.id === matchId);
  }, [favorites.matches]);

  const toggleFavoriteMatch = useCallback((match) => {
    if (isFavoriteMatch(match.id)) {
      removeFavoriteMatch(match.id);
    } else {
      addFavoriteMatch(match);
    }
  }, [isFavoriteMatch, removeFavoriteMatch, addFavoriteMatch]);

  const addFavoriteLeague = useCallback((league) => {
    setFavorites((prev) => {
      if (prev.leagues.some((l) => l.id === league.id)) return prev;
      return { ...prev, leagues: [...prev.leagues, league] };
    });
  }, []);

  const removeFavoriteLeague = useCallback((leagueId) => {
    setFavorites((prev) => ({
      ...prev,
      leagues: prev.leagues.filter((l) => l.id !== leagueId),
    }));
  }, []);

  const isFavoriteLeague = useCallback((leagueId) => {
    return favorites.leagues.some((l) => l.id === leagueId);
  }, [favorites.leagues]);

  const toggleFavoriteLeague = useCallback((league) => {
    if (isFavoriteLeague(league.id)) {
      removeFavoriteLeague(league.id);
    } else {
      addFavoriteLeague(league);
    }
  }, [isFavoriteLeague, removeFavoriteLeague, addFavoriteLeague]);

  const value = {
    favorites,
    addFavoriteTeam,
    removeFavoriteTeam,
    isFavoriteTeam,
    toggleFavoriteTeam,
    addFavoriteMatch,
    removeFavoriteMatch,
    isFavoriteMatch,
    toggleFavoriteMatch,
    addFavoriteLeague,
    removeFavoriteLeague,
    isFavoriteLeague,
    toggleFavoriteLeague,
  };

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
}

export default FavoritesContext;
