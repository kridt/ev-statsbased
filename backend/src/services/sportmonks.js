import axios from 'axios';
import { cache } from '../config/redis.js';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.SPORTMONKS_API_KEY;
const BASE_URL = process.env.SPORTMONKS_BASE_URL || 'https://api.sportmonks.com/v3/football';

// Cache TTL in seconds
const CACHE_TTL = {
  LIVE_MATCH: 30,        // 30 seconds for live matches
  MATCH_DETAILS: 60,     // 1 minute for match details
  FIXTURES: 300,         // 5 minutes for fixtures
  STANDINGS: 600,        // 10 minutes for standings
  TEAM: 3600,            // 1 hour for team data
  PLAYER: 3600,          // 1 hour for player data
  LEAGUES: 86400,        // 24 hours for leagues
  SEASONS: 86400,        // 24 hours for seasons
};

// Create axios instance
const api = axios.create({
  baseURL: BASE_URL,
  params: {
    api_token: API_KEY,
  },
});

// Request interceptor for logging
api.interceptors.request.use((config) => {
  console.log(`[SportMonks] ${config.method?.toUpperCase()} ${config.url}`);
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('[SportMonks Error]', error.response?.data || error.message);
    throw error;
  }
);

class SportMonksService {
  // Helper to make cached requests
  async cachedRequest(cacheKey, ttl, requestFn) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      console.log(`[Cache HIT] ${cacheKey}`);
      return cached;
    }

    console.log(`[Cache MISS] ${cacheKey}`);
    const data = await requestFn();
    await cache.set(cacheKey, data, ttl);
    return data;
  }

  // Get all available leagues
  async getLeagues() {
    return this.cachedRequest('leagues:all', CACHE_TTL.LEAGUES, async () => {
      const response = await api.get('/leagues', {
        params: {
          include: 'country;currentSeason',
        },
      });
      return response.data.data;
    });
  }

  // Get current season for a league
  async getCurrentSeason(leagueId) {
    return this.cachedRequest(`season:current:${leagueId}`, CACHE_TTL.SEASONS, async () => {
      const response = await api.get(`/leagues/${leagueId}`, {
        params: {
          include: 'currentSeason',
        },
      });
      return response.data.data?.currentSeason;
    });
  }

  // Get fixtures by date
  async getFixturesByDate(date) {
    const cacheKey = `fixtures:date:${date}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.FIXTURES, async () => {
      const response = await api.get('/fixtures/date/' + date, {
        params: {
          include: 'participants;league;venue;state;scores',
          timezone: 'UTC',
        },
      });
      return response.data.data || [];
    });
  }

  // Get live fixtures
  async getLiveFixtures() {
    const cacheKey = 'fixtures:live';
    return this.cachedRequest(cacheKey, CACHE_TTL.LIVE_MATCH, async () => {
      const response = await api.get('/livescores/inplay', {
        params: {
          include: 'participants;league;venue;state;scores;events;statistics;periods',
        },
      });
      return response.data.data || [];
    });
  }

  // Get fixture details with all statistics
  async getFixtureDetails(fixtureId) {
    const cacheKey = `fixture:${fixtureId}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.MATCH_DETAILS, async () => {
      const response = await api.get(`/fixtures/${fixtureId}`, {
        params: {
          // Deep statistics includes for Advanced plan
          // Note: referees doesn't support .statistics include on fixtures - get basic referee info only
          // weatherReport added for weather conditions
          include: 'participants;league;venue;state;scores;events.type;events.player;events.relatedPlayer;statistics.type;periods;lineups.player;lineups.type;lineups.details.type;formations;coaches;referees;weatherReport',
        },
      });
      return response.data.data;
    });
  }

  // Get detailed player statistics for a fixture
  async getFixturePlayerStats(fixtureId) {
    const cacheKey = `fixture:playerstats:${fixtureId}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.MATCH_DETAILS, async () => {
      const response = await api.get(`/fixtures/${fixtureId}`, {
        params: {
          include: 'lineups.player;lineups.details.type;lineups.type;participants',
        },
      });
      return {
        lineups: response.data.data?.lineups || [],
        participants: response.data.data?.participants || [],
      };
    });
  }

  // Get head to head between two teams
  async getHeadToHead(teamId1, teamId2) {
    const cacheKey = `h2h:${teamId1}:${teamId2}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.TEAM, async () => {
      const response = await api.get('/fixtures/head-to-head/' + teamId1 + '/' + teamId2, {
        params: {
          include: 'participants;scores;league;venue;state',
        },
      });
      return response.data.data || [];
    });
  }

  // Get team details
  async getTeam(teamId) {
    const cacheKey = `team:${teamId}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.TEAM, async () => {
      const response = await api.get(`/teams/${teamId}`, {
        params: {
          include: 'venue;country;coaches;players;latest.participants;upcoming.participants;activeSeasons;statistics',
        },
      });
      return response.data.data;
    });
  }

  // Get team season statistics
  async getTeamSeasonStats(teamId, seasonId) {
    const cacheKey = `team:stats:${teamId}:${seasonId}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.TEAM, async () => {
      const response = await api.get(`/teams/${teamId}`, {
        params: {
          include: 'statistics.details',
          filters: `seasonStatistics:${seasonId}`,
        },
      });
      return response.data.data?.statistics || [];
    });
  }

  // Get team form (last N matches)
  async getTeamForm(teamId, limit = 10) {
    const cacheKey = `team:form:${teamId}:${limit}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.FIXTURES, async () => {
      const response = await api.get(`/teams/${teamId}`, {
        params: {
          include: 'latest.participants;latest.scores;latest.league;latest.state',
        },
      });
      const latest = response.data.data?.latest || [];
      return latest.slice(0, limit);
    });
  }

  // Get player details
  async getPlayer(playerId) {
    const cacheKey = `player:${playerId}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.PLAYER, async () => {
      const response = await api.get(`/players/${playerId}`, {
        params: {
          include: 'team;position;nationality;statistics.details;transfers;sidelined;trophies',
        },
      });
      return response.data.data;
    });
  }

  // Get player season statistics
  async getPlayerSeasonStats(playerId, seasonId) {
    const cacheKey = `player:stats:${playerId}:${seasonId}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.PLAYER, async () => {
      const response = await api.get(`/players/${playerId}`, {
        params: {
          include: 'statistics.details',
          filters: `seasonStatistics:${seasonId}`,
        },
      });
      return response.data.data?.statistics || [];
    });
  }

  // Get league standings
  async getStandings(seasonId) {
    const cacheKey = `standings:${seasonId}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.STANDINGS, async () => {
      const response = await api.get(`/standings/seasons/${seasonId}`, {
        params: {
          include: 'participant;details',
        },
      });
      return response.data.data || [];
    });
  }

  // Get top scorers for a season
  async getTopScorers(seasonId) {
    const cacheKey = `topscorers:${seasonId}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.STANDINGS, async () => {
      const response = await api.get(`/topscorers/seasons/${seasonId}`, {
        params: {
          include: 'player;participant',
        },
      });
      return response.data.data || [];
    });
  }

  // Get fixture events (goals, cards, subs)
  async getFixtureEvents(fixtureId) {
    const cacheKey = `fixture:events:${fixtureId}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.MATCH_DETAILS, async () => {
      const response = await api.get(`/fixtures/${fixtureId}`, {
        params: {
          include: 'events.player;events.relatedPlayer;events.type',
        },
      });
      return response.data.data?.events || [];
    });
  }

  // Get fixture statistics
  async getFixtureStatistics(fixtureId) {
    const cacheKey = `fixture:statistics:${fixtureId}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.MATCH_DETAILS, async () => {
      const response = await api.get(`/fixtures/${fixtureId}`, {
        params: {
          include: 'statistics.type',
        },
      });
      return response.data.data?.statistics || [];
    });
  }

  // Get fixture lineups
  async getFixtureLineups(fixtureId) {
    const cacheKey = `fixture:lineups:${fixtureId}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.MATCH_DETAILS, async () => {
      const response = await api.get(`/fixtures/${fixtureId}`, {
        params: {
          include: 'lineups.player;formations',
        },
      });
      return {
        lineups: response.data.data?.lineups || [],
        formations: response.data.data?.formations || [],
      };
    });
  }

  // Search teams
  async searchTeams(query) {
    const cacheKey = `search:teams:${query}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.TEAM, async () => {
      const response = await api.get('/teams/search/' + encodeURIComponent(query), {
        params: {
          include: 'country;venue',
        },
      });
      return response.data.data || [];
    });
  }

  // Search players
  async searchPlayers(query) {
    const cacheKey = `search:players:${query}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.PLAYER, async () => {
      const response = await api.get('/players/search/' + encodeURIComponent(query), {
        params: {
          include: 'nationality;position',
        },
      });
      return response.data.data || [];
    });
  }

  // Get team squad with player info and stats
  async getTeamSquad(teamId) {
    const cacheKey = `team:squad:${teamId}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.TEAM, async () => {
      // First get the squad list
      const response = await api.get(`/squads/teams/${teamId}`, {
        params: {
          include: 'player',
        },
      });

      const players = response.data.data || [];

      // Fetch statistics for each player (limit to 20 to manage API calls)
      const playersToFetch = players.slice(0, 20);

      const playersWithStats = await Promise.all(
        playersToFetch.map(async (squadPlayer) => {
          const playerId = squadPlayer.player_id || squadPlayer.player?.id;
          if (!playerId) return squadPlayer;

          try {
            // Check cache first for individual player stats
            const playerCacheKey = `player:stats:${playerId}`;
            const cachedStats = await cache.get(playerCacheKey);

            if (cachedStats) {
              return {
                ...squadPlayer,
                player: {
                  ...squadPlayer.player,
                  statistics: cachedStats,
                },
              };
            }

            // Fetch player with statistics
            const playerResponse = await api.get(`/players/${playerId}`, {
              params: {
                include: 'statistics.details.type',
              },
            });

            const statistics = playerResponse.data.data?.statistics || [];

            // Cache the stats
            await cache.set(playerCacheKey, statistics, CACHE_TTL.PLAYER);

            return {
              ...squadPlayer,
              player: {
                ...squadPlayer.player,
                statistics: statistics,
              },
            };
          } catch (err) {
            console.log(`Could not fetch stats for player ${playerId}:`, err.message);
            return squadPlayer;
          }
        })
      );

      // Add remaining players without stats
      const remainingPlayers = players.slice(20).map(p => ({
        ...p,
        player: { ...p.player, statistics: [] }
      }));

      return {
        team: {
          id: teamId,
        },
        players: [...playersWithStats, ...remainingPlayers],
      };
    });
  }

  // Get squads for both teams in a fixture
  async getFixtureSquads(homeTeamId, awayTeamId) {
    const [homeSquad, awaySquad] = await Promise.all([
      this.getTeamSquad(homeTeamId),
      this.getTeamSquad(awayTeamId),
    ]);
    return { home: homeSquad, away: awaySquad };
  }

  // Get team statistics including corners and shots for probability models
  async getTeamStatsForProbability(teamId) {
    const cacheKey = `team:probability:${teamId}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.TEAM, async () => {
      const response = await api.get(`/teams/${teamId}`, {
        params: {
          include: 'statistics.details.type',
        },
      });

      const team = response.data.data;
      const statistics = team?.statistics || [];

      // Get current season stats (first in array is usually current)
      const currentSeasonStats = statistics[0]?.details || [];

      // Extract relevant stats
      const extractedStats = {
        teamId: team?.id,
        teamName: team?.name,
        seasonId: statistics[0]?.season_id,
        corners: null,
        shots: null,
        goals: null,
        possession: null,
      };

      for (const stat of currentSeasonStats) {
        const typeName = stat.type?.developer_name || stat.type?.name || '';

        if (typeName.toLowerCase().includes('corner')) {
          extractedStats.corners = stat.value;
        } else if (typeName.toLowerCase().includes('shot') && !typeName.toLowerCase().includes('conceded')) {
          extractedStats.shots = stat.value;
        } else if (typeName.toLowerCase() === 'goals') {
          extractedStats.goals = stat.value;
        } else if (typeName.toLowerCase().includes('possession')) {
          extractedStats.possession = stat.value;
        }
      }

      return extractedStats;
    });
  }

  // Get match statistics for a fixture (for calculating corners, shots, etc.)
  async getMatchStatsForProbability(fixtureId) {
    const cacheKey = `fixture:probability:${fixtureId}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.MATCH_DETAILS, async () => {
      const response = await api.get(`/fixtures/${fixtureId}`, {
        params: {
          include: 'participants;statistics.type;lineups.player;lineups.details.type',
        },
      });

      const fixture = response.data.data;
      const participants = fixture?.participants || [];
      const statistics = fixture?.statistics || [];
      const lineups = fixture?.lineups || [];

      // Extract team stats
      const homeTeam = participants.find(p => p.meta?.location === 'home');
      const awayTeam = participants.find(p => p.meta?.location === 'away');

      const matchStats = {
        fixtureId: fixture?.id,
        homeTeam: { id: homeTeam?.id, name: homeTeam?.name },
        awayTeam: { id: awayTeam?.id, name: awayTeam?.name },
        homeStats: {},
        awayStats: {},
        playerStats: [],
      };

      // Parse match statistics
      for (const stat of statistics) {
        const typeName = stat.type?.developer_name || stat.type?.name || `type_${stat.type_id}`;
        const value = stat.data?.value;
        const location = stat.location;

        if (location === 'home') {
          matchStats.homeStats[typeName] = value;
        } else if (location === 'away') {
          matchStats.awayStats[typeName] = value;
        }
      }

      // Parse player statistics from lineups
      for (const lineup of lineups) {
        const playerId = lineup.player_id;
        const playerName = lineup.player?.display_name || lineup.player_name;
        const teamId = lineup.team_id;
        const details = lineup.details || [];

        const playerMatchStats = {
          playerId,
          playerName,
          teamId,
          stats: {},
        };

        for (const detail of details) {
          const typeName = detail.type?.developer_name || detail.type?.name || `type_${detail.type_id}`;
          const value = detail.data?.value ?? detail.value;
          playerMatchStats.stats[typeName] = value;
        }

        if (Object.keys(playerMatchStats.stats).length > 0) {
          matchStats.playerStats.push(playerMatchStats);
        }
      }

      return matchStats;
    });
  }

  // Get player stats aggregated from recent matches
  async getPlayerRecentMatchStats(playerId, limit = 10) {
    const cacheKey = `player:recentmatches:${playerId}:${limit}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.PLAYER, async () => {
      // Get player's recent fixtures
      const response = await api.get(`/players/${playerId}`, {
        params: {
          include: 'statistics.details.type',
        },
      });

      const player = response.data.data;
      const statistics = player?.statistics || [];

      // Aggregate stats from current season
      const currentSeasonStats = statistics[0]?.details || [];

      const aggregated = {
        playerId: player?.id,
        playerName: player?.display_name || player?.name,
        appearances: 0,
        minutes: 0,
        shots: 0,
        shotsOnTarget: 0,
        goals: 0,
      };

      for (const stat of currentSeasonStats) {
        const typeName = (stat.type?.developer_name || stat.type?.name || '').toLowerCase();
        const value = typeof stat.value === 'object' ? stat.value?.total : stat.value;

        if (typeName.includes('appearance')) {
          aggregated.appearances = value || 0;
        } else if (typeName.includes('minutes')) {
          aggregated.minutes = value || 0;
        } else if (typeName === 'shots_total' || typeName === 'shots') {
          aggregated.shots = value || 0;
        } else if (typeName.includes('shots_on_target') || typeName === 'shots on target') {
          aggregated.shotsOnTarget = value || 0;
        } else if (typeName === 'goals' || typeName === 'goals_scored') {
          aggregated.goals = typeof value === 'object' ? value.all?.count || value.total : (value || 0);
        }
      }

      // Calculate per-match averages
      const matches = aggregated.appearances || 1;
      aggregated.shotsPer90 = (aggregated.shots / matches) * (90 / (aggregated.minutes / matches || 90));
      aggregated.shotsOnTargetPer90 = (aggregated.shotsOnTarget / matches) * (90 / (aggregated.minutes / matches || 90));
      aggregated.shots_per_match = aggregated.shots / matches;
      aggregated.shots_on_target_per_match = aggregated.shotsOnTarget / matches;

      return aggregated;
    });
  }

  // Get team's recent matches with full statistics for advanced probability models
  async getTeamRecentMatchesWithStats(teamId, limit = 10) {
    const cacheKey = `team:recentmatches:stats:${teamId}:${limit}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.FIXTURES, async () => {
      // Get team's recent fixtures
      const response = await api.get(`/teams/${teamId}`, {
        params: {
          include: 'latest.statistics.type;latest.participants;latest.scores',
        },
      });

      const team = response.data.data;
      const matches = (team?.latest || []).slice(0, limit);

      // Process each match
      const processedMatches = matches.map(match => {
        const participants = match.participants || [];
        const homeTeam = participants.find(p => p.meta?.location === 'home');
        const awayTeam = participants.find(p => p.meta?.location === 'away');
        const isHome = homeTeam?.id === teamId;

        const statistics = match.statistics || [];
        const homeStats = {};
        const awayStats = {};

        statistics.forEach(stat => {
          const name = (stat.type?.developer_name || stat.type?.name || '').toLowerCase().replace(/\s+/g, '_');
          const value = stat.data?.value ?? 0;

          if (stat.location === 'home') {
            homeStats[name] = value;
          } else {
            awayStats[name] = value;
          }
        });

        // Get scores
        const scores = match.scores || [];
        const homeScore = scores.find(s => s.score?.participant === 'home' && s.description === 'CURRENT')?.score?.goals || 0;
        const awayScore = scores.find(s => s.score?.participant === 'away' && s.description === 'CURRENT')?.score?.goals || 0;

        return {
          fixtureId: match.id,
          date: match.starting_at,
          homeTeamId: homeTeam?.id,
          awayTeamId: awayTeam?.id,
          homeTeamName: homeTeam?.name,
          awayTeamName: awayTeam?.name,
          isHome,
          homeStats,
          awayStats,
          homeScore,
          awayScore,
        };
      });

      return processedMatches;
    });
  }

  // Get advanced team statistics for probability models (with home/away splits)
  async getTeamAdvancedStats(teamId) {
    const cacheKey = `team:advanced:${teamId}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.TEAM, async () => {
      const response = await api.get(`/teams/${teamId}`, {
        params: {
          include: 'statistics.details.type',
        },
      });

      const team = response.data.data;
      const statistics = team?.statistics || [];
      const currentSeasonStats = statistics[0]?.details || [];

      // Extract all relevant stats with home/away splits
      const extractedStats = {
        teamId: team?.id,
        teamName: team?.name,
        seasonId: statistics[0]?.season_id,
        matchesPlayed: 0,
        // Season totals and averages
        corners: { total: 0, average: 0, home: { average: 0 }, away: { average: 0 } },
        shots: { total: 0, average: 0, onTarget: 0, onTargetAvg: 0 },
        goals: { total: 0, average: 0, home: { average: 0 }, away: { average: 0 } },
        goalsConceded: { total: 0, average: 0, home: { average: 0 }, away: { average: 0 } },
        fouls: { total: 0, average: 0 },
        yellowCards: { total: 0, average: 0 },
        redCards: { total: 0, average: 0 },
        possession: { average: 0 },
        // Offsides and throw-ins
        offsides: { total: 0, average: 0, home: { average: 0 }, away: { average: 0 } },
        throwIns: { total: 0, average: 0, home: { average: 0 }, away: { average: 0 } },
      };

      for (const stat of currentSeasonStats) {
        const typeName = (stat.type?.developer_name || stat.type?.name || '').toLowerCase();
        const value = stat.value;

        if (typeName.includes('corner')) {
          extractedStats.corners = {
            total: value?.count || 0,
            average: value?.average || 0,
            home: { average: value?.home?.average || value?.average || 0 },
            away: { average: value?.away?.average || value?.average || 0 },
          };
        } else if (typeName === 'shots' || typeName.includes('shots')) {
          extractedStats.shots = {
            total: value?.total || 0,
            average: value?.average || 0,
            onTarget: value?.on_target || 0,
            onTargetAvg: value?.on_target ? (value.on_target / (value.total / value.average || 1)) : 0,
          };
        } else if (typeName === 'goals') {
          extractedStats.goals = {
            total: value?.all?.count || 0,
            average: value?.all?.average || 0,
            home: { average: value?.home?.average || 0 },
            away: { average: value?.away?.average || 0 },
          };
          // Calculate matches played from goals data
          if (value?.all?.count && value?.all?.average) {
            extractedStats.matchesPlayed = Math.round(value.all.count / value.all.average);
          }
        } else if (typeName.includes('goals_conceded') || typeName === 'goals conceded') {
          extractedStats.goalsConceded = {
            total: value?.all?.count || 0,
            average: value?.all?.average || 0,
            home: { average: value?.home?.average || 0 },
            away: { average: value?.away?.average || 0 },
          };
        } else if (typeName === 'fouls') {
          extractedStats.fouls = {
            total: value?.count || 0,
            average: value?.average || 0,
          };
        } else if (typeName.includes('yellowcard')) {
          extractedStats.yellowCards = {
            total: value?.count || 0,
            average: value?.average || 0,
          };
        } else if (typeName.includes('redcard')) {
          extractedStats.redCards = {
            total: value?.count || 0,
            average: value?.average || 0,
          };
        } else if (typeName.includes('possession')) {
          extractedStats.possession = {
            average: value?.average || 0,
          };
        } else if (typeName.includes('offside')) {
          extractedStats.offsides = {
            total: value?.count || value?.total || 0,
            average: value?.average || 0,
            home: { average: value?.home?.average || value?.average || 0 },
            away: { average: value?.away?.average || value?.average || 0 },
          };
        } else if (typeName.includes('throw') || typeName.includes('throwin')) {
          extractedStats.throwIns = {
            total: value?.count || value?.total || 0,
            average: value?.average || 0,
            home: { average: value?.home?.average || value?.average || 0 },
            away: { average: value?.away?.average || value?.average || 0 },
          };
        }
      }

      return extractedStats;
    });
  }

  // Get comprehensive data for advanced probability models
  async getAdvancedProbabilityData(homeTeamId, awayTeamId) {
    const [
      homeAdvanced,
      awayAdvanced,
      homeRecent,
      awayRecent,
    ] = await Promise.all([
      this.getTeamAdvancedStats(homeTeamId),
      this.getTeamAdvancedStats(awayTeamId),
      this.getTeamRecentMatchesWithStats(homeTeamId, 10),
      this.getTeamRecentMatchesWithStats(awayTeamId, 10),
    ]);

    return {
      home: {
        ...homeAdvanced,
        recentMatches: homeRecent,
      },
      away: {
        ...awayAdvanced,
        recentMatches: awayRecent,
      },
    };
  }

  // Get player's recent match history with shots/SoT stats (last 7 matches)
  async getPlayerMatchHistory(playerId, limit = 7) {
    const cacheKey = `player:matchhistory:${playerId}:${limit}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.PLAYER, async () => {
      try {
        // Get player's fixtures with their individual statistics
        const response = await api.get(`/players/${playerId}`, {
          params: {
            include: 'lineups.fixture.participants;lineups.details.type',
          },
        });

        const player = response.data.data;
        const lineups = player?.lineups || [];

        // Sort by fixture date (most recent first) and limit
        const recentLineups = lineups
          .filter(l => l.fixture)
          .sort((a, b) => new Date(b.fixture?.starting_at) - new Date(a.fixture?.starting_at))
          .slice(0, limit);

        // Extract match-by-match stats
        const matchHistory = recentLineups.map(lineup => {
          const fixture = lineup.fixture;
          const details = lineup.details || [];
          const participants = fixture?.participants || [];
          const homeTeam = participants.find(p => p.meta?.location === 'home');
          const awayTeam = participants.find(p => p.meta?.location === 'away');

          // Extract individual player stats
          let shots = 0;
          let shotsOnTarget = 0;
          let goals = 0;
          let minutes = 0;

          for (const detail of details) {
            const typeName = (detail.type?.developer_name || detail.type?.name || '').toLowerCase();
            const value = detail.data?.value ?? detail.value ?? 0;

            if (typeName === 'shots_total' || typeName === 'shots') {
              shots = parseInt(value) || 0;
            } else if (typeName.includes('shots_on_target') || typeName === 'shots on target') {
              shotsOnTarget = parseInt(value) || 0;
            } else if (typeName === 'goals' || typeName === 'goals_scored') {
              goals = parseInt(value) || 0;
            } else if (typeName.includes('minutes')) {
              minutes = parseInt(value) || 0;
            }
          }

          return {
            fixtureId: fixture?.id,
            date: fixture?.starting_at,
            opponent: lineup.team_id === homeTeam?.id ? awayTeam?.name : homeTeam?.name,
            isHome: lineup.team_id === homeTeam?.id,
            shots,
            shotsOnTarget,
            goals,
            minutes,
            started: lineup.type_id === 11, // Starting XI
          };
        });

        // Calculate averages
        const matchesWithMinutes = matchHistory.filter(m => m.minutes > 0);
        const totalMatches = matchesWithMinutes.length || 1;
        const totalShots = matchesWithMinutes.reduce((sum, m) => sum + m.shots, 0);
        const totalSoT = matchesWithMinutes.reduce((sum, m) => sum + m.shotsOnTarget, 0);
        const totalGoals = matchesWithMinutes.reduce((sum, m) => sum + m.goals, 0);

        return {
          playerId: player?.id,
          playerName: player?.display_name || player?.name,
          position: player?.position?.name,
          matches: matchHistory,
          averages: {
            shotsPerMatch: totalShots / totalMatches,
            shotsOnTargetPerMatch: totalSoT / totalMatches,
            goalsPerMatch: totalGoals / totalMatches,
            matchesAnalyzed: totalMatches,
          },
        };
      } catch (err) {
        console.log(`[SportMonks] Could not fetch match history for player ${playerId}:`, err.message);
        return null;
      }
    });
  }

  // Search for player by name and get their match history
  async getPlayerMatchHistoryByName(playerName, limit = 7) {
    const cacheKey = `player:matchhistory:name:${playerName.toLowerCase()}:${limit}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.PLAYER, async () => {
      try {
        // Search for the player
        const searchResults = await this.searchPlayers(playerName);
        if (!searchResults || searchResults.length === 0) {
          console.log(`[SportMonks] Player not found: ${playerName}`);
          return null;
        }

        // Get the best match (first result)
        const player = searchResults[0];

        // Get their match history
        const history = await this.getPlayerMatchHistory(player.id, limit);
        return history;
      } catch (err) {
        console.log(`[SportMonks] Error getting match history for ${playerName}:`, err.message);
        return null;
      }
    });
  }

  // Get player card statistics for card markets
  async getPlayerCardStats(playerId) {
    const cacheKey = `player:cards:${playerId}`;
    return this.cachedRequest(cacheKey, CACHE_TTL.PLAYER, async () => {
      const response = await api.get(`/players/${playerId}`, {
        params: {
          include: 'statistics.details.type',
        },
      });

      const player = response.data.data;
      const statistics = player?.statistics || [];
      const currentSeasonStats = statistics[0]?.details || [];

      const cardStats = {
        playerId: player?.id,
        playerName: player?.display_name || player?.name,
        appearances: 0,
        minutes: 0,
        yellowCards: 0,
        redCards: 0,
        foulsCommitted: 0,
        yellowCardsPerMatch: 0,
        cardProbability: 0, // Probability of getting a card in any match
      };

      for (const stat of currentSeasonStats) {
        const typeName = (stat.type?.developer_name || stat.type?.name || '').toLowerCase();
        const value = typeof stat.value === 'object' ? stat.value?.total : stat.value;

        if (typeName.includes('appearance')) {
          cardStats.appearances = value || 0;
        } else if (typeName.includes('minutes')) {
          cardStats.minutes = value || 0;
        } else if (typeName.includes('yellowcard') || typeName === 'yellow cards') {
          cardStats.yellowCards = value || 0;
        } else if (typeName.includes('redcard') || typeName === 'red cards') {
          cardStats.redCards = value || 0;
        } else if (typeName.includes('fouls_committed') || typeName === 'fouls') {
          cardStats.foulsCommitted = value || 0;
        }
      }

      // Calculate per-match rates
      const matches = cardStats.appearances || 1;
      cardStats.yellowCardsPerMatch = cardStats.yellowCards / matches;
      cardStats.redCardsPerMatch = cardStats.redCards / matches;
      cardStats.foulsPerMatch = cardStats.foulsCommitted / matches;

      // Simple card probability (yellow or red)
      // Using historical rate as probability
      cardStats.cardProbability = (cardStats.yellowCards + cardStats.redCards) / matches;

      return cardStats;
    });
  }
}

export default new SportMonksService();
