import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 90000, // 90 seconds - player prop calculations can take 40-60 seconds
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('[API Error]', error.response?.data || error.message);
    throw error;
  }
);

// Fixtures API
export const fixturesApi = {
  getByDate: (date) => api.get(`/fixtures/date/${date}`),
  getLive: () => api.get('/fixtures/live'),
  getById: (id) => api.get(`/fixtures/${id}`),
  getEvents: (id) => api.get(`/fixtures/${id}/events`),
  getStatistics: (id) => api.get(`/fixtures/${id}/statistics`),
  getLineups: (id) => api.get(`/fixtures/${id}/lineups`),
  getPlayerStats: (id) => api.get(`/fixtures/${id}/playerstats`),
  getH2H: (teamId1, teamId2) => api.get(`/fixtures/h2h/${teamId1}/${teamId2}`),
  getSquads: (homeTeamId, awayTeamId) => api.get(`/fixtures/squads/${homeTeamId}/${awayTeamId}`),
};

// Teams API
export const teamsApi = {
  getById: (id) => api.get(`/teams/${id}`),
  getStats: (id, seasonId) => api.get(`/teams/${id}/stats/${seasonId}`),
  getForm: (id, limit = 10) => api.get(`/teams/${id}/form?limit=${limit}`),
  search: (query) => api.get(`/teams/search/${encodeURIComponent(query)}`),
};

// Players API
export const playersApi = {
  getById: (id) => api.get(`/players/${id}`),
  getStats: (id, seasonId) => api.get(`/players/${id}/stats/${seasonId}`),
  search: (query) => api.get(`/players/search/${encodeURIComponent(query)}`),
};

// Leagues API
export const leaguesApi = {
  getAll: () => api.get('/leagues'),
  getStandings: (seasonId) => api.get(`/leagues/standings/${seasonId}`),
  getTopScorers: (seasonId) => api.get(`/leagues/topscorers/${seasonId}`),
  getCurrentSeason: (leagueId) => api.get(`/leagues/${leagueId}/season`),
};

// Odds API (Bookmaker odds from Odds API)
export const oddsApi = {
  getForFixture: (fixtureId) => api.get(`/odds/fixture/${fixtureId}`),
  compareOdds: (fixtureId) => api.get(`/odds/compare/${fixtureId}`),
  getForDate: (date) => api.get(`/odds/date/${date}`),
};

// Probability API
export const probabilityApi = {
  // Corner probabilities
  getCornerProbabilities: (fixtureId) => api.get(`/probability/corners/${fixtureId}`),
  getTeamCornerStats: (teamId) => api.get(`/probability/corners/team/${teamId}`),
  findCornerValueBets: (fixtureId, odds) => api.post('/probability/corners/value', { fixtureId, odds }),

  // Player shot probabilities
  getPlayerShotProbabilities: (playerId, expectedMinutes = 70) =>
    api.get(`/probability/player/${playerId}/shots?expectedMinutes=${expectedMinutes}`),
  getFixturePlayerProbabilities: (fixtureId) => api.get(`/probability/fixture/${fixtureId}/players`),
  findPlayerValueBets: (playerId, expectedMinutes, odds) =>
    api.post('/probability/player/value', { playerId, expectedMinutes, odds }),

  // Card probabilities
  getCardProbabilities: (fixtureId) => api.get(`/probability/cards/${fixtureId}`),
  findCardValueBets: (fixtureId, odds) => api.post('/probability/cards/value', { fixtureId, odds }),

  // Value bets dashboard - uses new market scanner with stats validation
  getValueBets: (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.date) queryParams.set('date', params.date);
    if (params.minEdge !== undefined) queryParams.set('minEdge', params.minEdge);
    if (params.betTypes) queryParams.set('betTypes', params.betTypes);
    if (params.bookmakers) queryParams.set('bookmakers', params.bookmakers);
    const queryString = queryParams.toString();
    return api.get(`/value-bets/scan${queryString ? `?${queryString}` : ''}`);
  },

  // Get bookmaker configuration for filtering
  getBookmakers: () => api.get('/value-bets/bookmakers'),
};

// CLV Tracking API
export const clvApi = {
  getPending: () => api.get('/clv/pending'),
  getCompleted: (limit = 100) => api.get(`/clv/completed?limit=${limit}`),
  getStats: () => api.get('/clv/stats'),
  getReport: () => api.get('/clv/report'),
};

export default api;
