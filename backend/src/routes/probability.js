import { Router } from 'express';
import sportmonks from '../services/sportmonks.js';
import { cache } from '../config/redis.js';
import {
  analyzeMatchCorners,
  findCornerValueBets,
  generateCornerInsights
} from '../models/probability/cornersModel.js';
import { analyzePlayerShots, analyzeMatchPlayerProps } from '../models/probability/playerPropsModel.js';
import {
  analyzeMatchCards,
  findCardValueBets,
  analyzePlayersForCards
} from '../models/probability/cardsModel.js';
import {
  analyzeMatchOffsides,
  findOffsidesValueBets
} from '../models/probability/offsidesModel.js';
import {
  analyzeMatchThrowIns,
  findThrowInsValueBets
} from '../models/probability/throwInsModel.js';
import {
  processRecentMatches,
  calculateWeightedAverages,
  LEAGUE_AVERAGES
} from '../models/probability/advancedStats.js';
import { generateMatchFactors } from '../models/probability/enhancedFactors.js';

const router = Router();

/**
 * GET /api/probability/corners/:fixtureId
 * Calculate corner probabilities for a fixture with advanced model
 * Uses recent form, opponent strength, and home/away factors
 */
router.get('/corners/:fixtureId', async (req, res) => {
  try {
    const { fixtureId } = req.params;

    // Get fixture details to get team IDs
    const fixture = await sportmonks.getFixtureDetails(fixtureId);
    if (!fixture) {
      return res.status(404).json({ error: 'Fixture not found' });
    }

    const homeTeam = fixture.participants?.find(p => p.meta?.location === 'home');
    const awayTeam = fixture.participants?.find(p => p.meta?.location === 'away');

    if (!homeTeam || !awayTeam) {
      return res.status(400).json({ error: 'Could not determine teams' });
    }

    // Get advanced probability data (includes recent matches and stats)
    // Also fetch H2H and standings for enhanced factors
    const [homeStats, awayStats, homeRecentMatches, awayRecentMatches, h2hMatches, standings] = await Promise.all([
      sportmonks.getTeamStatsForProbability(homeTeam.id),
      sportmonks.getTeamStatsForProbability(awayTeam.id),
      sportmonks.getTeamRecentMatchesWithStats(homeTeam.id, 10).catch(() => []),
      sportmonks.getTeamRecentMatchesWithStats(awayTeam.id, 10).catch(() => []),
      sportmonks.getHeadToHead(homeTeam.id, awayTeam.id).catch(() => []),
      fixture.season_id ? sportmonks.getStandings(fixture.season_id).catch(() => []) : Promise.resolve([]),
    ]);

    // Extract referee and weather from fixture
    const referee = fixture.referees?.[0];
    const weatherReport = fixture.weatherReport;

    // Generate enhanced factors
    const matchFactors = generateMatchFactors({
      referee,
      weatherReport,
      h2hMatches,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      homeTeam,
      awayTeam,
      venue: fixture.venue,
      standings,
      homeRecentMatches,
      awayRecentMatches,
      startingAt: fixture.starting_at,
    });

    // Process recent matches to extract corner form
    const homeRecentForm = processRecentMatches(homeRecentMatches, homeTeam.id);
    const awayRecentForm = processRecentMatches(awayRecentMatches, awayTeam.id);

    // Calculate weighted averages for recent form
    const homeWeightedStats = calculateWeightedAverages(homeRecentForm, 0.85);
    const awayWeightedStats = calculateWeightedAverages(awayRecentForm, 0.85);

    // Build enhanced team stats objects
    const enhancedHomeStats = {
      average: homeStats.corners?.average || LEAGUE_AVERAGES.corners,
      home: { average: homeStats.corners?.home?.average },
      away: { average: homeStats.corners?.away?.average },
    };

    const enhancedAwayStats = {
      average: awayStats.corners?.average || LEAGUE_AVERAGES.corners,
      home: { average: awayStats.corners?.home?.average },
      away: { average: awayStats.corners?.away?.average },
    };

    // Calculate corner probabilities with advanced model
    const analysis = analyzeMatchCorners(enhancedHomeStats, enhancedAwayStats, {
      homeRecentForm: {
        corners: homeRecentForm.corners,
      },
      awayRecentForm: {
        corners: awayRecentForm.corners,
      },
      decayFactor: 0.85,
      enhancedFactor: matchFactors.factors.corners, // Apply enhanced factor
    });

    // Generate insights
    const insights = generateCornerInsights(analysis, enhancedHomeStats, enhancedAwayStats);

    res.json({
      success: true,
      data: {
        fixture: {
          id: fixture.id,
          name: fixture.name,
          homeTeam: { id: homeTeam.id, name: homeTeam.name },
          awayTeam: { id: awayTeam.id, name: awayTeam.name },
        },
        teamStats: {
          home: {
            ...homeStats,
            recentForm: {
              corners: homeWeightedStats.corners,
              matches: homeRecentMatches.length,
            },
          },
          away: {
            ...awayStats,
            recentForm: {
              corners: awayWeightedStats.corners,
              matches: awayRecentMatches.length,
            },
          },
        },
        probabilities: analysis,
        insights,
        enhancedFactors: {
          applied: matchFactors.factors,
          details: matchFactors.details,
          reasoning: matchFactors.reasoning,
        },
        modelInfo: {
          type: 'advanced',
          factors: ['recentForm', 'opponentStrength', 'homeAway', 'weather', 'h2h', 'importance'],
          recentMatchesUsed: {
            home: homeRecentMatches.length,
            away: awayRecentMatches.length,
          },
        },
      },
    });
  } catch (error) {
    console.error('Error calculating corner probabilities:', error);
    res.status(500).json({ error: 'Failed to calculate probabilities' });
  }
});

/**
 * GET /api/probability/corners/team/:teamId
 * Get corner statistics for a specific team
 */
router.get('/corners/team/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const stats = await sportmonks.getTeamStatsForProbability(teamId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching team corner stats:', error);
    res.status(500).json({ error: 'Failed to fetch team statistics' });
  }
});

/**
 * POST /api/probability/corners/value
 * Find value bets for corners given bookmaker odds
 *
 * Body: {
 *   fixtureId: number,
 *   odds: {
 *     over_8.5: 1.85,
 *     under_8.5: 2.00,
 *     ...
 *   }
 * }
 */
router.post('/corners/value', async (req, res) => {
  try {
    const { fixtureId, odds } = req.body;

    if (!fixtureId || !odds) {
      return res.status(400).json({ error: 'fixtureId and odds are required' });
    }

    // Get fixture details
    const fixture = await sportmonks.getFixtureDetails(fixtureId);
    const homeTeam = fixture.participants?.find(p => p.meta?.location === 'home');
    const awayTeam = fixture.participants?.find(p => p.meta?.location === 'away');

    // Get team statistics
    const [homeStats, awayStats] = await Promise.all([
      sportmonks.getTeamStatsForProbability(homeTeam.id),
      sportmonks.getTeamStatsForProbability(awayTeam.id),
    ]);

    // Calculate probabilities
    const analysis = analyzeMatchCorners(
      { average: homeStats.corners?.average || 5.0 },
      { average: awayStats.corners?.average || 5.0 },
      5.0
    );

    // Find value bets
    const valueBets = findCornerValueBets(analysis.totalMarkets, odds, 0.02);

    res.json({
      success: true,
      data: {
        fixture: {
          id: fixture.id,
          name: fixture.name,
        },
        expectedCorners: analysis.expected,
        valueBets,
        allMarkets: analysis.totalMarkets,
      },
    });
  } catch (error) {
    console.error('Error finding corner value bets:', error);
    res.status(500).json({ error: 'Failed to find value bets' });
  }
});

/**
 * GET /api/probability/player/:playerId/shots
 * Get shot probabilities for a specific player
 */
router.get('/player/:playerId/shots', async (req, res) => {
  try {
    const { playerId } = req.params;
    const { expectedMinutes = 70 } = req.query;

    // Get player statistics
    const playerStats = await sportmonks.getPlayerRecentMatchStats(playerId);

    if (!playerStats) {
      return res.status(404).json({ error: 'Player not found' });
    }

    // Analyze player shots
    const analysis = analyzePlayerShots(playerStats, parseInt(expectedMinutes));

    res.json({
      success: true,
      data: {
        player: {
          id: playerStats.playerId,
          name: playerStats.playerName,
        },
        stats: {
          appearances: playerStats.appearances,
          totalShots: playerStats.shots,
          totalShotsOnTarget: playerStats.shotsOnTarget,
          shotsPer90: playerStats.shotsPer90,
          shotsOnTargetPer90: playerStats.shotsOnTargetPer90,
        },
        probabilities: analysis,
      },
    });
  } catch (error) {
    console.error('Error calculating player shot probabilities:', error);
    res.status(500).json({ error: 'Failed to calculate probabilities' });
  }
});

/**
 * GET /api/probability/fixture/:fixtureId/players
 * Get shot probabilities for all players in a fixture
 */
router.get('/fixture/:fixtureId/players', async (req, res) => {
  try {
    const { fixtureId } = req.params;

    // Get fixture with lineups
    const fixture = await sportmonks.getFixtureDetails(fixtureId);
    const homeTeam = fixture.participants?.find(p => p.meta?.location === 'home');
    const awayTeam = fixture.participants?.find(p => p.meta?.location === 'away');

    // Get squads for both teams
    const { home: homeSquad, away: awaySquad } = await sportmonks.getFixtureSquads(
      homeTeam.id,
      awayTeam.id
    );

    // Process players to get shot stats
    const processPlayers = (squad, teamName) => {
      return (squad.players || [])
        .filter(p => {
          const stats = p.player?.statistics?.[0]?.details || [];
          return stats.some(s =>
            (s.type?.developer_name || '').toLowerCase().includes('shot') ||
            (s.type?.name || '').toLowerCase().includes('shot')
          );
        })
        .map(p => {
          const details = p.player?.statistics?.[0]?.details || [];
          let shots = 0;
          let shotsOnTarget = 0;
          let appearances = 1;

          for (const d of details) {
            const typeName = (d.type?.developer_name || d.type?.name || '').toLowerCase();
            const value = typeof d.value === 'object' ? d.value?.total : d.value;

            if (typeName === 'shots_total' || typeName === 'shots') {
              shots = value || 0;
            } else if (typeName.includes('shots_on_target')) {
              shotsOnTarget = value || 0;
            } else if (typeName.includes('appearance')) {
              appearances = value || 1;
            }
          }

          return {
            playerId: p.player_id || p.player?.id,
            name: p.player?.display_name || p.player?.name || 'Unknown',
            team: teamName,
            shots_per_match: shots / appearances,
            shots_on_target_per_match: shotsOnTarget / appearances,
          };
        });
    };

    const homePlayers = processPlayers(homeSquad, homeTeam.name);
    const awayPlayers = processPlayers(awaySquad, awayTeam.name);

    const allPlayers = [...homePlayers, ...awayPlayers].filter(p => p.shots_per_match > 0.5);

    // Analyze each player
    const playerAnalysis = analyzeMatchPlayerProps(allPlayers, { expectedMinutes: 70 });

    res.json({
      success: true,
      data: {
        fixture: {
          id: fixture.id,
          name: fixture.name,
          homeTeam: homeTeam.name,
          awayTeam: awayTeam.name,
        },
        players: playerAnalysis,
      },
    });
  } catch (error) {
    console.error('Error calculating player probabilities for fixture:', error);
    res.status(500).json({ error: 'Failed to calculate probabilities' });
  }
});

/**
 * POST /api/probability/player/value
 * Find value bets for player shot props
 *
 * Body: {
 *   playerId: number,
 *   expectedMinutes: number,
 *   odds: {
 *     shots_over_1.5: 1.75,
 *     sot_over_0.5: 1.50,
 *     ...
 *   }
 * }
 */
router.post('/player/value', async (req, res) => {
  try {
    const { playerId, expectedMinutes = 70, odds } = req.body;

    if (!playerId || !odds) {
      return res.status(400).json({ error: 'playerId and odds are required' });
    }

    const playerStats = await sportmonks.getPlayerRecentMatchStats(playerId);
    const analysis = analyzePlayerShots(playerStats, expectedMinutes);

    // Import find value function
    const { findPlayerShotValueBets } = await import('../models/probability/playerPropsModel.js');
    const valueBets = findPlayerShotValueBets(analysis.markets, odds, 0.03);

    res.json({
      success: true,
      data: {
        player: analysis.player,
        expected: analysis.expected,
        valueBets,
        allMarkets: analysis.markets,
      },
    });
  } catch (error) {
    console.error('Error finding player value bets:', error);
    res.status(500).json({ error: 'Failed to find value bets' });
  }
});

/**
 * GET /api/probability/cards/:fixtureId
 * Calculate card probabilities for a fixture with advanced model
 */
router.get('/cards/:fixtureId', async (req, res) => {
  try {
    const { fixtureId } = req.params;

    // Get fixture details
    const fixture = await sportmonks.getFixtureDetails(fixtureId);
    if (!fixture) {
      return res.status(404).json({ error: 'Fixture not found' });
    }

    const homeTeam = fixture.participants?.find(p => p.meta?.location === 'home');
    const awayTeam = fixture.participants?.find(p => p.meta?.location === 'away');

    if (!homeTeam || !awayTeam) {
      return res.status(400).json({ error: 'Could not determine teams' });
    }

    // Get team statistics, recent matches, H2H, and standings for enhanced factors
    const [homeStats, awayStats, homeRecentMatches, awayRecentMatches, h2hMatches, standings] = await Promise.all([
      sportmonks.getTeamStatsForProbability(homeTeam.id),
      sportmonks.getTeamStatsForProbability(awayTeam.id),
      sportmonks.getTeamRecentMatchesWithStats(homeTeam.id, 10).catch(() => []),
      sportmonks.getTeamRecentMatchesWithStats(awayTeam.id, 10).catch(() => []),
      sportmonks.getHeadToHead(homeTeam.id, awayTeam.id).catch(() => []),
      fixture.season_id ? sportmonks.getStandings(fixture.season_id).catch(() => []) : Promise.resolve([]),
    ]);

    // Extract referee and weather from fixture
    const referee = fixture.referees?.[0];
    const weatherReport = fixture.weatherReport;

    // Generate enhanced factors
    const matchFactors = generateMatchFactors({
      referee,
      weatherReport,
      h2hMatches,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      homeTeam,
      awayTeam,
      venue: fixture.venue,
      standings,
      homeRecentMatches,
      awayRecentMatches,
      startingAt: fixture.starting_at,
    });

    // Process recent matches to extract card and foul form
    const homeRecentForm = processRecentMatches(homeRecentMatches, homeTeam.id);
    const awayRecentForm = processRecentMatches(awayRecentMatches, awayTeam.id);

    // Calculate weighted averages for recent form
    const homeWeightedStats = calculateWeightedAverages(homeRecentForm, 0.85);
    const awayWeightedStats = calculateWeightedAverages(awayRecentForm, 0.85);

    // Build enhanced team stats for cards model
    const enhancedHomeStats = {
      yellowCards: {
        average: homeStats.cards?.yellow?.average || LEAGUE_AVERAGES.yellowCards,
      },
      redCards: {
        average: homeStats.cards?.red?.average || LEAGUE_AVERAGES.redCards,
      },
      fouls: {
        average: homeStats.fouls?.average || LEAGUE_AVERAGES.fouls,
      },
    };

    const enhancedAwayStats = {
      yellowCards: {
        average: awayStats.cards?.yellow?.average || LEAGUE_AVERAGES.yellowCards,
      },
      redCards: {
        average: awayStats.cards?.red?.average || LEAGUE_AVERAGES.redCards,
      },
      fouls: {
        average: awayStats.fouls?.average || LEAGUE_AVERAGES.fouls,
      },
    };

    // Calculate card probabilities with advanced model
    const analysis = analyzeMatchCards(enhancedHomeStats, enhancedAwayStats, {
      homeRecentForm: {
        yellowCards: homeRecentForm.yellowCards,
        redCards: homeRecentForm.redCards,
        fouls: homeRecentForm.fouls,
      },
      awayRecentForm: {
        yellowCards: awayRecentForm.yellowCards,
        redCards: awayRecentForm.redCards,
        fouls: awayRecentForm.fouls,
      },
      leagueAvg: LEAGUE_AVERAGES,
      enhancedFactor: matchFactors.factors.cards, // Apply enhanced factor
    });

    res.json({
      success: true,
      data: {
        fixture: {
          id: fixture.id,
          name: fixture.name,
          homeTeam: { id: homeTeam.id, name: homeTeam.name },
          awayTeam: { id: awayTeam.id, name: awayTeam.name },
        },
        teamStats: {
          home: {
            ...homeStats,
            recentForm: {
              yellowCards: homeWeightedStats.yellowCards,
              fouls: homeWeightedStats.fouls,
              matches: homeRecentMatches.length,
            },
          },
          away: {
            ...awayStats,
            recentForm: {
              yellowCards: awayWeightedStats.yellowCards,
              fouls: awayWeightedStats.fouls,
              matches: awayRecentMatches.length,
            },
          },
        },
        probabilities: analysis,
        enhancedFactors: {
          applied: matchFactors.factors,
          details: matchFactors.details,
          reasoning: matchFactors.reasoning,
        },
        modelInfo: {
          type: 'advanced',
          factors: ['recentForm', 'opponentFouls', 'homeAway', 'referee', 'weather', 'h2h', 'derby', 'importance'],
          recentMatchesUsed: {
            home: homeRecentMatches.length,
            away: awayRecentMatches.length,
          },
        },
      },
    });
  } catch (error) {
    console.error('Error calculating card probabilities:', error);
    res.status(500).json({ error: 'Failed to calculate probabilities' });
  }
});

/**
 * POST /api/probability/cards/value
 * Find value bets for cards given bookmaker odds
 */
router.post('/cards/value', async (req, res) => {
  try {
    const { fixtureId, odds } = req.body;

    if (!fixtureId || !odds) {
      return res.status(400).json({ error: 'fixtureId and odds are required' });
    }

    // Get fixture details
    const fixture = await sportmonks.getFixtureDetails(fixtureId);
    const homeTeam = fixture.participants?.find(p => p.meta?.location === 'home');
    const awayTeam = fixture.participants?.find(p => p.meta?.location === 'away');

    // Get team statistics
    const [homeStats, awayStats] = await Promise.all([
      sportmonks.getTeamStatsForProbability(homeTeam.id),
      sportmonks.getTeamStatsForProbability(awayTeam.id),
    ]);

    // Build stats objects
    const enhancedHomeStats = {
      yellowCards: { average: homeStats.cards?.yellow?.average || LEAGUE_AVERAGES.yellowCards },
      redCards: { average: homeStats.cards?.red?.average || LEAGUE_AVERAGES.redCards },
      fouls: { average: homeStats.fouls?.average || LEAGUE_AVERAGES.fouls },
    };

    const enhancedAwayStats = {
      yellowCards: { average: awayStats.cards?.yellow?.average || LEAGUE_AVERAGES.yellowCards },
      redCards: { average: awayStats.cards?.red?.average || LEAGUE_AVERAGES.redCards },
      fouls: { average: awayStats.fouls?.average || LEAGUE_AVERAGES.fouls },
    };

    // Calculate probabilities
    const analysis = analyzeMatchCards(enhancedHomeStats, enhancedAwayStats);

    // Find value bets
    const valueBets = findCardValueBets(analysis.totalMarkets, odds, 0.02);

    res.json({
      success: true,
      data: {
        fixture: {
          id: fixture.id,
          name: fixture.name,
        },
        expectedCards: analysis.expected,
        valueBets,
        allMarkets: analysis.totalMarkets,
      },
    });
  } catch (error) {
    console.error('Error finding card value bets:', error);
    res.status(500).json({ error: 'Failed to find value bets' });
  }
});

/**
 * GET /api/probability/value-bets
 * Get all value bets across all matches for a date
 *
 * Query params:
 * - date: Date string (default: today)
 * - minEdge: Minimum edge % (default: 2)
 * - betTypes: Comma-separated bet types (goals,btts,corners,cards) (default: all except match)
 */
router.get('/value-bets', async (req, res) => {
  try {
    const {
      date = new Date().toISOString().split('T')[0],
      minEdge = 2,
      betTypes = 'goals,btts,corners,cards,player_shots,player_sot,goalscorer,team_shots,offsides,throw_ins'
    } = req.query;

    const minEdgeDecimal = parseFloat(minEdge) / 100;
    const allowedTypes = betTypes.split(',').map(t => t.trim().toLowerCase());

    // Check cache first (cache key includes date only - we filter results after)
    const cacheKey = `valuebets:date:${date}`;
    const cached = await cache.get(cacheKey);

    if (cached) {
      console.log(`[ValueBets] Cache HIT for ${date}`);
      // Filter cached results based on user's query params
      const filteredBets = cached.data.filter(bet => {
        const meetsEdge = bet.edge >= minEdgeDecimal;
        const meetsType = allowedTypes.includes(bet.betType);
        return meetsEdge && meetsType;
      });

      // Sort by edge descending
      filteredBets.sort((a, b) => b.edge - a.edge);

      return res.json({
        success: true,
        data: filteredBets,
        meta: {
          ...cached.meta,
          valueBetsFound: filteredBets.length,
          filters: {
            minEdge: parseFloat(minEdge),
            betTypes: allowedTypes,
          },
          fromCache: true,
        }
      });
    }

    console.log(`[ValueBets] Cache MISS for ${date} - fetching...`);

    // Get fixtures for the date
    const fixtures = await sportmonks.getFixturesByDate(date);

    if (!fixtures || fixtures.length === 0) {
      return res.json({
        success: true,
        data: [],
        meta: { date, totalFixtures: 0, valueBetsFound: 0 }
      });
    }

    // Filter only upcoming matches (not finished)
    const upcomingFixtures = fixtures.filter(f => {
      const state = f.state?.state || f.state?.short_name || 'NS';
      const finishedStates = ['FT', 'FT_PEN', 'AET', 'ABD', 'AWD', 'WO'];
      return !finishedStates.includes(state);
    });

    const allValueBets = [];

    // ALL bet types for caching - we filter on response
    const allBetTypes = ['goals', 'btts', 'corners', 'cards', 'player_shots', 'player_sot', 'goalscorer', 'team_shots', 'offsides', 'throw_ins'];
    const minEdgeForCache = 0; // Get all bets for cache, filter later

    // Process fixtures in parallel (batches of 5 to avoid rate limits)
    const batchSize = 5;
    for (let i = 0; i < upcomingFixtures.length; i += batchSize) {
      const batch = upcomingFixtures.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(async (fixture) => {
          try {
            return await processFixtureForValueBets(fixture, minEdgeForCache, allBetTypes);
          } catch (err) {
            console.error(`[ValueBets] Error processing fixture ${fixture.id}:`, err.message);
            return null;
          }
        })
      );

      // Collect valid results
      batchResults.filter(r => r !== null).forEach(result => {
        allValueBets.push(...result);
      });
    }

    // Filter out bets with invalid odds and unrealistic edges
    
    const validValueBets = allValueBets.filter(bet => bet.bookmakerOdds && bet.bookmakerOdds > 1.01 && bet.edge <= 3); // Cap edge at 300%

    // Sort by edge descending
    validValueBets.sort((a, b) => b.edge - a.edge);

    // Get unique leagues for filter options
    const leagues = [...new Map(
      upcomingFixtures
        .filter(f => f.league)
        .map(f => [f.league.id, { id: f.league.id, name: f.league.name, image: f.league.image_path }])
    ).values()];

    // Cache the full results (10 minute TTL - odds change frequently)
    const cacheData = {
      data: validValueBets,
      meta: {
        date,
        totalFixtures: upcomingFixtures.length,
        leagues,
        cachedAt: new Date().toISOString(),
      }
    };
    await cache.set(cacheKey, cacheData, 600); // 10 minutes
    console.log(`[ValueBets] Cached ${validValueBets.length} bets for ${date}`);

    // Apply user's filters to the response
    const filteredBets = validValueBets.filter(bet => {
      const meetsEdge = bet.edge >= minEdgeDecimal;
      const meetsType = allowedTypes.includes(bet.betType);
      return meetsEdge && meetsType;
    });

    res.json({
      success: true,
      data: filteredBets,
      meta: {
        date,
        totalFixtures: upcomingFixtures.length,
        valueBetsFound: filteredBets.length,
        leagues,
        filters: {
          minEdge: parseFloat(minEdge),
          betTypes: allowedTypes,
        }
      }
    });
  } catch (error) {
    console.error('Error fetching value bets:', error);
    res.status(500).json({ error: 'Failed to fetch value bets' });
  }
});

/**
 * Helper: Process a single fixture for value bets
 */
async function processFixtureForValueBets(fixture, minEdgeDecimal, allowedTypes) {
  const { opticOddsService } = await import('../services/opticOdds.js');

  const homeTeam = fixture.participants?.find(p => p.meta?.location === 'home');
  const awayTeam = fixture.participants?.find(p => p.meta?.location === 'away');

  if (!homeTeam || !awayTeam) return [];

  // Get odds from OpticOdds API
  const oddsData = await opticOddsService.getOddsForFixture(fixture);
  if (!oddsData?.odds) return [];

  const valueBets = [];

  // Debug: log all available markets (OpticOdds format)
  if (oddsData.odds?.markets) {
    const allMarkets = Object.keys(oddsData.odds.markets);
    console.log(`[ValueBets] Available markets for ${fixture.id}:`, allMarkets);
  }

  // Parse odds from OpticOdds processed format
  const processedOdds = oddsData.odds;
  const matchOdds = parseMatchOddsFromOptic(processedOdds);
  const goalsOdds = opticOddsService.parseTotalGoalsOdds(processedOdds);
  const bttsOdds = opticOddsService.parseBttsOdds(processedOdds);
  const cornerOdds = opticOddsService.parseCornerOdds(processedOdds);
  const cardOdds = parseCardOddsFromOptic(processedOdds);
  const offsidesOdds = opticOddsService.parseOffsidesOdds(processedOdds);
  const throwInsOdds = opticOddsService.parseThrowInsOdds(processedOdds);

  // ===== COMPREHENSIVE DEBUG OUTPUT =====
  console.log(`\n====== ODDS DEBUG for ${fixture.name} (ID: ${fixture.id}) ======`);
  console.log(`[DEBUG] Goals Odds Parsed:`, JSON.stringify(goalsOdds, null, 2));
  console.log(`[DEBUG] BTTS Odds Parsed:`, JSON.stringify(bttsOdds, null, 2));
  console.log(`[DEBUG] Corner Odds Parsed:`, JSON.stringify(cornerOdds, null, 2));
  console.log(`[DEBUG] Card Odds Parsed:`, JSON.stringify(cardOdds, null, 2));
  console.log(`[DEBUG] Offsides Odds Parsed:`, JSON.stringify(offsidesOdds, null, 2));
  console.log(`[DEBUG] Throw-Ins Odds Parsed:`, JSON.stringify(throwInsOdds, null, 2));
  console.log(`================================================\n`);

  // Process match result (1X2) if requested
  if (allowedTypes.includes('match') && Object.keys(matchOdds).length > 0) {
    try {
      // Get team stats for probability calculation
      const [homeStats, awayStats] = await Promise.all([
        sportmonks.getTeamStatsForProbability(homeTeam.id),
        sportmonks.getTeamStatsForProbability(awayTeam.id),
      ]);

      // Calculate match result probabilities using Poisson model
      const homeGoalsAvg = (homeStats.goals?.scored?.average || 1.3) * 1.1; // Home advantage
      const awayGoalsAvg = awayStats.goals?.scored?.average || 1.1;
      const homeDefense = homeStats.goals?.conceded?.average || 1.2;
      const awayDefense = awayStats.goals?.conceded?.average || 1.3;

      // Expected goals using attack vs defense
      const homeExpected = (homeGoalsAvg + awayDefense) / 2;
      const awayExpected = (awayGoalsAvg + homeDefense) / 2;

      // Calculate match probabilities using Poisson
      const matchProbs = calculateMatchProbabilities(homeExpected, awayExpected);

      // Find value bets for match result (only if 'match' type is requested)
      if (allowedTypes.includes('match')) {
        const matchValueBets = findMatchValueBets(matchProbs, matchOdds, minEdgeDecimal);

        matchValueBets.forEach(bet => {
          valueBets.push({
            ...bet,
            betType: 'match',
            fixture: {
              id: fixture.id,
              name: fixture.name,
              homeTeam: { id: homeTeam.id, name: homeTeam.name, image: homeTeam.image_path },
              awayTeam: { id: awayTeam.id, name: awayTeam.name, image: awayTeam.image_path },
              league: fixture.league ? { id: fixture.league.id, name: fixture.league.name, image: fixture.league.image_path } : null,
              startingAt: fixture.starting_at,
            },
          });
        });
      }
    } catch (err) {
      console.error(`[ValueBets] Match analysis error for ${fixture.id}:`, err.message);
    }
  }

  // Process corners if requested
  if (allowedTypes.includes('corners') && Object.keys(cornerOdds).length > 0) {
    try {
      // Get team stats for probability calculation
      const [homeStats, awayStats, homeRecent, awayRecent] = await Promise.all([
        sportmonks.getTeamStatsForProbability(homeTeam.id),
        sportmonks.getTeamStatsForProbability(awayTeam.id),
        sportmonks.getTeamRecentMatchesWithStats(homeTeam.id, 5).catch(() => []),
        sportmonks.getTeamRecentMatchesWithStats(awayTeam.id, 5).catch(() => []),
      ]);

      const homeRecentForm = processRecentMatches(homeRecent, homeTeam.id);
      const awayRecentForm = processRecentMatches(awayRecent, awayTeam.id);

      const enhancedHomeStats = {
        average: homeStats.corners?.average || LEAGUE_AVERAGES.corners,
        home: { average: homeStats.corners?.home?.average },
        away: { average: homeStats.corners?.away?.average },
      };

      const enhancedAwayStats = {
        average: awayStats.corners?.average || LEAGUE_AVERAGES.corners,
        home: { average: awayStats.corners?.home?.average },
        away: { average: awayStats.corners?.away?.average },
      };

      const cornerAnalysis = analyzeMatchCorners(enhancedHomeStats, enhancedAwayStats, {
        homeRecentForm: { corners: homeRecentForm.corners },
        awayRecentForm: { corners: awayRecentForm.corners },
        decayFactor: 0.85,
      });

      console.log(`[DEBUG Corners] Expected Total: ${cornerAnalysis.expected?.total || 'N/A'}`);
      console.log(`[DEBUG Corners] Markets from Model:`, cornerAnalysis.totalMarkets?.slice(0, 3));
      console.log(`[DEBUG Corners] Odds Available:`, cornerOdds);

      // Find value bets for corners
      const cornerValueBets = findCornerValueBetsFromMarkets(
        cornerAnalysis.totalMarkets,
        cornerOdds,
        minEdgeDecimal
      );
      console.log(`[DEBUG Corners] Value Bets Found: ${cornerValueBets.length}`, cornerValueBets);

      cornerValueBets.forEach(bet => {
        // Extract line and direction from market name (e.g., "Corners Over 9.5")
        const marketMatch = bet.market.match(/(over|under)\s+([\d.]+)/i);
        const direction = marketMatch ? marketMatch[1].toLowerCase() : null;
        const line = marketMatch ? parseFloat(marketMatch[2]) : null;
        const selection = direction && line ? `${direction}_${line}` : null;

        // Generate benchmark (all bookmaker odds for this market)
        let benchmark = null;
        let arbitrage = null;
        if (selection && processedOdds) {
          benchmark = opticOddsService.generateBenchmark('total_corners', selection, processedOdds);
          arbitrage = opticOddsService.findArbitrage('total_corners', selection, bet.probability, processedOdds);
        }

        valueBets.push({
          ...bet,
          betType: 'corners',
          fixture: {
            id: fixture.id,
            name: fixture.name,
            homeTeam: { id: homeTeam.id, name: homeTeam.name, image: homeTeam.image_path },
            awayTeam: { id: awayTeam.id, name: awayTeam.name, image: awayTeam.image_path },
            league: fixture.league ? { id: fixture.league.id, name: fixture.league.name, image: fixture.league.image_path } : null,
            startingAt: fixture.starting_at,
          },
          expectedValue: cornerAnalysis.expected.total,
          // Benchmark: all bookmaker odds comparison
          benchmark,
          // Arbitrage opportunity check
          arbitrage,
        });
      });
    } catch (err) {
      console.error(`[ValueBets] Corner analysis error for ${fixture.id}:`, err.message);
    }
  }

  // Process cards if requested
  if (allowedTypes.includes('cards') && Object.keys(cardOdds).length > 0) {
    try {
      const [homeStats, awayStats, homeRecent, awayRecent] = await Promise.all([
        sportmonks.getTeamStatsForProbability(homeTeam.id),
        sportmonks.getTeamStatsForProbability(awayTeam.id),
        sportmonks.getTeamRecentMatchesWithStats(homeTeam.id, 5).catch(() => []),
        sportmonks.getTeamRecentMatchesWithStats(awayTeam.id, 5).catch(() => []),
      ]);

      const homeRecentForm = processRecentMatches(homeRecent, homeTeam.id);
      const awayRecentForm = processRecentMatches(awayRecent, awayTeam.id);

      const enhancedHomeStats = {
        yellowCards: { average: homeStats.cards?.yellow?.average || LEAGUE_AVERAGES.yellowCards },
        redCards: { average: homeStats.cards?.red?.average || LEAGUE_AVERAGES.redCards },
        fouls: { average: homeStats.fouls?.average || LEAGUE_AVERAGES.fouls },
      };

      const enhancedAwayStats = {
        yellowCards: { average: awayStats.cards?.yellow?.average || LEAGUE_AVERAGES.yellowCards },
        redCards: { average: awayStats.cards?.red?.average || LEAGUE_AVERAGES.redCards },
        fouls: { average: awayStats.fouls?.average || LEAGUE_AVERAGES.fouls },
      };

      const cardAnalysis = analyzeMatchCards(enhancedHomeStats, enhancedAwayStats, {
        homeRecentForm: {
          yellowCards: homeRecentForm.yellowCards,
          redCards: homeRecentForm.redCards,
          fouls: homeRecentForm.fouls,
        },
        awayRecentForm: {
          yellowCards: awayRecentForm.yellowCards,
          redCards: awayRecentForm.redCards,
          fouls: awayRecentForm.fouls,
        },
        leagueAvg: LEAGUE_AVERAGES,
      });

      // Find value bets for cards
      const cardValueBets = findCardValueBetsFromMarkets(
        cardAnalysis.totalMarkets,
        cardOdds,
        minEdgeDecimal
      );

      cardValueBets.forEach(bet => {
        // Extract line and direction from market name (e.g., "Cards Over 3.5")
        const marketMatch = bet.market.match(/(over|under)\s+([\d.]+)/i);
        const direction = marketMatch ? marketMatch[1].toLowerCase() : null;
        const line = marketMatch ? parseFloat(marketMatch[2]) : null;
        const selection = direction && line ? `${direction}_${line}` : null;

        // Generate benchmark (all bookmaker odds for this market)
        let benchmark = null;
        let arbitrage = null;
        if (selection && processedOdds) {
          benchmark = opticOddsService.generateBenchmark('total_cards', selection, processedOdds);
          arbitrage = opticOddsService.findArbitrage('total_cards', selection, bet.probability, processedOdds);
        }

        valueBets.push({
          ...bet,
          betType: 'cards',
          fixture: {
            id: fixture.id,
            name: fixture.name,
            homeTeam: { id: homeTeam.id, name: homeTeam.name, image: homeTeam.image_path },
            awayTeam: { id: awayTeam.id, name: awayTeam.name, image: awayTeam.image_path },
            league: fixture.league ? { id: fixture.league.id, name: fixture.league.name, image: fixture.league.image_path } : null,
            startingAt: fixture.starting_at,
          },
          expectedValue: cardAnalysis.expected.total.all,
          // Benchmark: all bookmaker odds comparison
          benchmark,
          // Arbitrage opportunity check
          arbitrage,
        });
      });
    } catch (err) {
      console.error(`[ValueBets] Card analysis error for ${fixture.id}:`, err.message);
    }
  }

  // Process goals over/under if requested
  if (allowedTypes.includes('goals') && Object.keys(goalsOdds).length > 0) {
    try {
      // Get recent match stats for goals calculation (same pattern as corners)
      const [homeRecent, awayRecent] = await Promise.all([
        sportmonks.getTeamRecentMatchesWithStats(homeTeam.id, 5).catch(() => []),
        sportmonks.getTeamRecentMatchesWithStats(awayTeam.id, 5).catch(() => []),
      ]);

      const homeRecentForm = processRecentMatches(homeRecent, homeTeam.id);
      const awayRecentForm = processRecentMatches(awayRecent, awayTeam.id);

      // Calculate weighted goal averages from recent matches
      const homeWeightedStats = calculateWeightedAverages(homeRecentForm, 0.85);
      const awayWeightedStats = calculateWeightedAverages(awayRecentForm, 0.85);

      // Get goals scored and conceded from recent form
      const homeGoalsAvg = homeWeightedStats.goals?.weighted || LEAGUE_AVERAGES.goals;
      const awayGoalsAvg = awayWeightedStats.goals?.weighted || LEAGUE_AVERAGES.goals;
      const homeConcededAvg = homeWeightedStats.conceded?.goals?.weighted || LEAGUE_AVERAGES.goalsConceded;
      const awayConcededAvg = awayWeightedStats.conceded?.goals?.weighted || LEAGUE_AVERAGES.goalsConceded;

      // Calculate expected goals: (team attack + opponent defense) / 2, with home advantage
      const homeExpected = ((homeGoalsAvg + awayConcededAvg) / 2) * 1.08; // Home advantage
      const awayExpected = (awayGoalsAvg + homeConcededAvg) / 2;
      const totalExpectedGoals = homeExpected + awayExpected;

      // Calculate goals probabilities using Poisson
      const goalsProbs = calculateGoalsProbabilities(totalExpectedGoals);

      console.log(`[DEBUG Goals] Home recent goals: ${homeGoalsAvg.toFixed(2)}, Away recent goals: ${awayGoalsAvg.toFixed(2)}`);
      console.log(`[DEBUG Goals] Expected Total: ${totalExpectedGoals.toFixed(2)}`);
      console.log(`[DEBUG Goals] Probabilities:`, JSON.stringify(goalsProbs, null, 2));

      // Find value bets for goals
      const goalsValueBets = findGoalsValueBets(goalsProbs, goalsOdds, minEdgeDecimal);
      console.log(`[DEBUG Goals] Value Bets Found: ${goalsValueBets.length}`, goalsValueBets);

      goalsValueBets.forEach(bet => {
        // Extract line and direction from market name (e.g., "Goals Over 2.5")
        const marketMatch = bet.market.match(/(over|under)\s+([\d.]+)/i);
        const direction = marketMatch ? marketMatch[1].toLowerCase() : null;
        const line = marketMatch ? parseFloat(marketMatch[2]) : null;
        const selection = direction && line ? `${direction}_${line}` : null;

        // Generate benchmark (all bookmaker odds for this market)
        let benchmark = null;
        let arbitrage = null;
        if (selection && processedOdds) {
          benchmark = opticOddsService.generateBenchmark('total_goals', selection, processedOdds);
          arbitrage = opticOddsService.findArbitrage('total_goals', selection, bet.probability, processedOdds);
        }

        valueBets.push({
          ...bet,
          betType: 'goals',
          fixture: {
            id: fixture.id,
            name: fixture.name,
            homeTeam: { id: homeTeam.id, name: homeTeam.name, image: homeTeam.image_path },
            awayTeam: { id: awayTeam.id, name: awayTeam.name, image: awayTeam.image_path },
            league: fixture.league ? { id: fixture.league.id, name: fixture.league.name, image: fixture.league.image_path } : null,
            startingAt: fixture.starting_at,
          },
          expectedValue: totalExpectedGoals,
          // Benchmark: all bookmaker odds comparison
          benchmark,
          // Arbitrage opportunity check
          arbitrage,
          // Detailed calculation breakdown for UI explanation
          calculationDetails: {
            homeGoalsAvg: homeGoalsAvg,
            awayGoalsAvg: awayGoalsAvg,
            homeConcededAvg: homeConcededAvg,
            awayConcededAvg: awayConcededAvg,
            homeExpected: homeExpected,
            awayExpected: awayExpected,
            totalExpectedGoals: totalExpectedGoals,
            recentMatches: 5,
            decayFactor: 0.85,
            homeAdvantage: 1.08,
          },
        });
      });
    } catch (err) {
      console.error(`[ValueBets] Goals analysis error for ${fixture.id}:`, err.message);
    }
  }

  // Process BTTS if requested
  if (allowedTypes.includes('btts') && Object.keys(bttsOdds).length > 0) {
    try {
      // Get recent match stats for BTTS calculation (same pattern as goals)
      const [homeRecent, awayRecent] = await Promise.all([
        sportmonks.getTeamRecentMatchesWithStats(homeTeam.id, 5).catch(() => []),
        sportmonks.getTeamRecentMatchesWithStats(awayTeam.id, 5).catch(() => []),
      ]);

      const homeRecentForm = processRecentMatches(homeRecent, homeTeam.id);
      const awayRecentForm = processRecentMatches(awayRecent, awayTeam.id);

      // Calculate weighted goal averages from recent matches
      const homeWeightedStats = calculateWeightedAverages(homeRecentForm, 0.85);
      const awayWeightedStats = calculateWeightedAverages(awayRecentForm, 0.85);

      // Get goals scored and conceded from recent form
      const homeGoalsAvg = homeWeightedStats.goals?.weighted || LEAGUE_AVERAGES.goals;
      const awayGoalsAvg = awayWeightedStats.goals?.weighted || LEAGUE_AVERAGES.goals;
      const homeConcededAvg = homeWeightedStats.conceded?.goals?.weighted || LEAGUE_AVERAGES.goalsConceded;
      const awayConcededAvg = awayWeightedStats.conceded?.goals?.weighted || LEAGUE_AVERAGES.goalsConceded;

      // Calculate expected goals: (team attack + opponent defense) / 2, with home advantage
      const homeExpected = ((homeGoalsAvg + awayConcededAvg) / 2) * 1.08;
      const awayExpected = (awayGoalsAvg + homeConcededAvg) / 2;

      // Calculate BTTS probability using Poisson
      const bttsProbs = calculateBttsProbabilities(homeExpected, awayExpected);

      console.log(`[DEBUG BTTS] Home Goals Avg: ${homeGoalsAvg.toFixed(2)}, Away Goals Avg: ${awayGoalsAvg.toFixed(2)}`);
      console.log(`[DEBUG BTTS] Home Expected: ${homeExpected.toFixed(2)}, Away Expected: ${awayExpected.toFixed(2)}`);
      console.log(`[DEBUG BTTS] Probabilities: Yes=${(bttsProbs.yes*100).toFixed(1)}%, No=${(bttsProbs.no*100).toFixed(1)}%`);
      console.log(`[DEBUG BTTS] Odds Available:`, bttsOdds);

      // Find value bets for BTTS
      const bttsValueBets = findBttsValueBets(bttsProbs, bttsOdds, minEdgeDecimal);
      console.log(`[DEBUG BTTS] Value Bets Found: ${bttsValueBets.length}`, bttsValueBets);

      bttsValueBets.forEach(bet => {
        // Extract selection from market name (e.g., "BTTS Yes" or "BTTS No")
        const isYes = bet.market.toLowerCase().includes('yes');
        const selection = isYes ? 'yes' : 'no';

        // Generate benchmark (all bookmaker odds for this market)
        let benchmark = null;
        let arbitrage = null;
        if (processedOdds) {
          benchmark = opticOddsService.generateBenchmark('both_teams_to_score', selection, processedOdds);
          arbitrage = opticOddsService.findArbitrage('both_teams_to_score', selection, bet.probability, processedOdds);
        }

        valueBets.push({
          ...bet,
          betType: 'btts',
          fixture: {
            id: fixture.id,
            name: fixture.name,
            homeTeam: { id: homeTeam.id, name: homeTeam.name, image: homeTeam.image_path },
            awayTeam: { id: awayTeam.id, name: awayTeam.name, image: awayTeam.image_path },
            league: fixture.league ? { id: fixture.league.id, name: fixture.league.name, image: fixture.league.image_path } : null,
            startingAt: fixture.starting_at,
          },
          // Benchmark: all bookmaker odds comparison
          benchmark,
          // Arbitrage opportunity check
          arbitrage,
          // Detailed calculation breakdown for UI explanation
          calculationDetails: {
            homeGoalsAvg: homeGoalsAvg,
            awayGoalsAvg: awayGoalsAvg,
            homeConcededAvg: homeConcededAvg,
            awayConcededAvg: awayConcededAvg,
            homeExpected: homeExpected,
            awayExpected: awayExpected,
            bttsYes: bttsProbs.yes,
            bttsNo: bttsProbs.no,
            recentMatches: 5,
            decayFactor: 0.85,
            homeAdvantage: 1.08,
          },
        });
      });
    } catch (err) {
      console.error(`[ValueBets] BTTS analysis error for ${fixture.id}:`, err.message);
    }
  }

  // Process player shots if requested
  if (allowedTypes.includes('player_shots') || allowedTypes.includes('player_sot')) {
    try {
      // Debug: Log available player prop markets from OpticOdds
      if (processedOdds?.markets) {
        const playerMarkets = Object.keys(processedOdds.markets).filter(m =>
          m.includes('player') || m.includes('scorer')
        );
        console.log(`[DEBUG RAW] Player markets available:`, playerMarkets);
      }

      // Parse player odds using OpticOdds service methods
      const playerShotsOdds = opticOddsService.parsePlayerShotsOdds(processedOdds);
      const playerSoTOdds = opticOddsService.parsePlayerShotsOdds(processedOdds); // Same market for SoT

      console.log(`[DEBUG Player Shots] Found ${Object.keys(playerShotsOdds).length} players with shots odds`);
      console.log(`[DEBUG Player SoT] Found ${Object.keys(playerSoTOdds).length} players with SoT odds`);

      // Get player stats from fixture lineups
      const fixtureDetails = await sportmonks.getFixtureDetails(fixture.id);
      const lineups = fixtureDetails?.lineups || [];

      // Process each player with shots odds - fetch history for top players only (limit API calls)
      const playerHistoryCache = new Map();
      const MAX_HISTORY_FETCHES = 15; // Limit API calls per match to avoid rate limiting
      let historyFetchCount = 0;

      if (allowedTypes.includes('player_shots')) {
      for (const [playerKey, playerData] of Object.entries(playerShotsOdds)) {
        // Try to get player match history from SportMonks
        let playerHistory = null;
        let expectedShots = estimatePlayerExpectedShots(playerData.name, lineups, homeTeam.id, awayTeam.id);

        // Only fetch history for players with odds - limit API calls to avoid 429 rate limit
        if (!playerHistoryCache.has(playerData.name) && historyFetchCount < MAX_HISTORY_FETCHES) {
          try {
            playerHistory = await sportmonks.getPlayerMatchHistoryByName(playerData.name, 7);
            playerHistoryCache.set(playerData.name, playerHistory);
            historyFetchCount++;

            // Use historical average if available - any data is better than guessing
            if (playerHistory && playerHistory.averages?.matchesAnalyzed >= 1) {
              expectedShots = playerHistory.averages.shotsPerMatch;
              console.log(`[Player History] ${playerData.name}: ${expectedShots.toFixed(2)} shots/match from ${playerHistory.averages.matchesAnalyzed} matches`);
            }

            // Small delay to avoid rate limiting (100ms between requests)
            if (historyFetchCount < MAX_HISTORY_FETCHES) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } catch (err) {
            console.log(`[Player History] Could not fetch for ${playerData.name}: ${err.message}`);
          }
        } else if (playerHistoryCache.has(playerData.name)) {
          playerHistory = playerHistoryCache.get(playerData.name);
          if (playerHistory && playerHistory.averages?.matchesAnalyzed >= 1) {
            expectedShots = playerHistory.averages.shotsPerMatch;
          }
        }

        // Only create bets if expected shots > 0 (historical shows player takes shots)
        if (expectedShots > 0) {
          const shotValueBets = findPlayerShotsValueBets(expectedShots, playerData.markets, minEdgeDecimal);

          shotValueBets.forEach(bet => {
            valueBets.push({
              ...bet,
              betType: 'player_shots',
              player: playerData.name,
              fixture: {
                id: fixture.id,
                name: fixture.name,
                homeTeam: { id: homeTeam.id, name: homeTeam.name, image: homeTeam.image_path },
                awayTeam: { id: awayTeam.id, name: awayTeam.name, image: awayTeam.image_path },
                league: fixture.league ? { id: fixture.league.id, name: fixture.league.name, image: fixture.league.image_path } : null,
                startingAt: fixture.starting_at,
              },
              expectedValue: expectedShots,
              playerHistory: playerHistory ? {
                matches: playerHistory.matches.slice(0, 7).map(m => ({
                  date: m.date,
                  opponent: m.opponent,
                  shots: m.shots,
                  shotsOnTarget: m.shotsOnTarget,
                  goals: m.goals,
                  minutes: m.minutes,
                })),
                averages: playerHistory.averages,
              } : null,
            });
          });
        }
      }

      } // End player_shots check
      // Process each player with SoT odds (use same rate limit counter as shots)
      // Only process if player_sot is in allowed types
      if (allowedTypes.includes('player_sot')) {
      for (const [playerKey, playerData] of Object.entries(playerSoTOdds)) {
        // Check if we already have history cached
        let playerHistory = playerHistoryCache.get(playerData.name);
        let expectedSoT = estimatePlayerExpectedSoT(playerData.name, lineups, homeTeam.id, awayTeam.id);

        // Fetch history if not cached and under rate limit
        if (!playerHistory && historyFetchCount < MAX_HISTORY_FETCHES) {
          try {
            playerHistory = await sportmonks.getPlayerMatchHistoryByName(playerData.name, 7);
            playerHistoryCache.set(playerData.name, playerHistory);
            historyFetchCount++;

            if (playerHistory && playerHistory.averages?.matchesAnalyzed >= 1) {
              expectedSoT = playerHistory.averages.shotsOnTargetPerMatch;
              console.log(`[Player History SoT] ${playerData.name}: ${expectedSoT.toFixed(2)} SoT/match from ${playerHistory.averages.matchesAnalyzed} matches`);
            }

            // Small delay to avoid rate limiting
            if (historyFetchCount < MAX_HISTORY_FETCHES) {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
          } catch (err) {
            console.log(`[Player History SoT] Could not fetch for ${playerData.name}: ${err.message}`);
          }
        } else if (playerHistory && playerHistory.averages?.matchesAnalyzed >= 1) {
          expectedSoT = playerHistory.averages.shotsOnTargetPerMatch;
        }

        if (expectedSoT > 0) {
          const sotValueBets = findPlayerShotsValueBets(expectedSoT, playerData.markets, minEdgeDecimal);

          sotValueBets.forEach(bet => {
            valueBets.push({
              ...bet,
              market: bet.market.replace('Shots', 'Shots on Target'),
              betType: 'player_sot',
              player: playerData.name,
              fixture: {
                id: fixture.id,
                name: fixture.name,
                homeTeam: { id: homeTeam.id, name: homeTeam.name, image: homeTeam.image_path },
                awayTeam: { id: awayTeam.id, name: awayTeam.name, image: awayTeam.image_path },
                league: fixture.league ? { id: fixture.league.id, name: fixture.league.name, image: fixture.league.image_path } : null,
                startingAt: fixture.starting_at,
              },
              expectedValue: expectedSoT,
              playerHistory: playerHistory ? {
                matches: playerHistory.matches.slice(0, 7).map(m => ({
                  date: m.date,
                  opponent: m.opponent,
                  shots: m.shots,
                  shotsOnTarget: m.shotsOnTarget,
                  goals: m.goals,
                  minutes: m.minutes,
                })),
                averages: playerHistory.averages,
              } : null,
            });
          });
        }
      }
      } // End player_sot check
    } catch (err) {
      console.error(`[ValueBets] Player shots analysis error for ${fixture.id}:`, err.message);
    }
  }

  // Process goalscorer markets if requested
  if (allowedTypes.includes('goalscorer')) {
    try {
      const goalscorerOdds = opticOddsService.parseGoalscorerOdds(processedOdds);

      console.log(`[DEBUG Goalscorer] Found ${Object.keys(goalscorerOdds).length} players with goalscorer odds`);

      // Get player stats from fixture lineups
      const fixtureDetails = await sportmonks.getFixtureDetails(fixture.id);
      const lineups = fixtureDetails?.lineups || [];

      // Process each player with goalscorer odds
      for (const [playerKey, playerData] of Object.entries(goalscorerOdds)) {
        const expectedGoals = estimatePlayerExpectedGoals(playerData.name, lineups, homeTeam.id, awayTeam.id);

        if (expectedGoals > 0) {
          const goalscorerProbs = calculateGoalscorerProbabilities(expectedGoals, 70);
          const goalscorerValueBets = findGoalscorerValueBets(goalscorerProbs, playerData.markets, minEdgeDecimal);

          goalscorerValueBets.forEach(bet => {
            valueBets.push({
              ...bet,
              betType: 'goalscorer',
              player: playerData.name,
              fixture: {
                id: fixture.id,
                name: fixture.name,
                homeTeam: { id: homeTeam.id, name: homeTeam.name, image: homeTeam.image_path },
                awayTeam: { id: awayTeam.id, name: awayTeam.name, image: awayTeam.image_path },
                league: fixture.league ? { id: fixture.league.id, name: fixture.league.name, image: fixture.league.image_path } : null,
                startingAt: fixture.starting_at,
              },
              expectedValue: expectedGoals,
            });
          });
        }
      }
    } catch (err) {
      console.error(`[ValueBets] Goalscorer analysis error for ${fixture.id}:`, err.message);
    }
  }

  // Process team shots if requested
  if (allowedTypes.includes('team_shots')) {
    try {
      const teamShotsOdds = parseTeamShotsOddsFromOptic(processedOdds);

      console.log(`[DEBUG Team Shots] Match Shots: ${Object.keys(teamShotsOdds.matchShots).length}, Home: ${Object.keys(teamShotsOdds.homeShots).length}, Away: ${Object.keys(teamShotsOdds.awayShots).length}`);
      console.log(`[DEBUG Team SoT] Match SoT: ${Object.keys(teamShotsOdds.matchSoT).length}, Home: ${Object.keys(teamShotsOdds.homeSoT).length}, Away: ${Object.keys(teamShotsOdds.awaySoT).length}`);

      // Get team statistics for shots
      const [homeStats, awayStats] = await Promise.all([
        sportmonks.getTeamStatsForProbability(homeTeam.id),
        sportmonks.getTeamStatsForProbability(awayTeam.id),
      ]);

      // Calculate expected shots (league average is ~12 shots per team)
      const homeExpectedShots = homeStats.shots?.average || 12;
      const awayExpectedShots = awayStats.shots?.average || 11;
      const matchExpectedShots = homeExpectedShots + awayExpectedShots;

      // Calculate expected shots on target (~35-40% of total shots)
      const homeSoTRate = homeStats.shotsOnTarget?.rate || 0.37;
      const awaySoTRate = awayStats.shotsOnTarget?.rate || 0.35;
      const homeExpectedSoT = homeExpectedShots * homeSoTRate;
      const awayExpectedSoT = awayExpectedShots * awaySoTRate;
      const matchExpectedSoT = homeExpectedSoT + awayExpectedSoT;

      console.log(`[DEBUG Shots Expected] Home: ${homeExpectedShots.toFixed(2)}, Away: ${awayExpectedShots.toFixed(2)}, Match Total: ${matchExpectedShots.toFixed(2)}`);
      console.log(`[DEBUG SoT Expected] Home: ${homeExpectedSoT.toFixed(2)}, Away: ${awayExpectedSoT.toFixed(2)}, Match Total: ${matchExpectedSoT.toFixed(2)}`);

      // Team stats for transparency
      const shotsTeamStats = {
        homeAvg: homeExpectedShots,
        awayAvg: awayExpectedShots,
        homeTeamName: homeTeam.name,
        awayTeamName: awayTeam.name,
        matchesUsedHome: homeStats.matchesPlayed || null,
        matchesUsedAway: awayStats.matchesPlayed || null,
      };

      const sotTeamStats = {
        homeAvg: homeExpectedSoT,
        awayAvg: awayExpectedSoT,
        homeTeamName: homeTeam.name,
        awayTeamName: awayTeam.name,
        matchesUsedHome: homeStats.matchesPlayed || null,
        matchesUsedAway: awayStats.matchesPlayed || null,
      };

      // Find value bets for Match Shots
      const matchShotsValueBets = findTeamShotsValueBets(matchExpectedShots, teamShotsOdds.matchShots, minEdgeDecimal, 'Match Shots', shotsTeamStats);
      matchShotsValueBets.forEach(bet => {
        valueBets.push({
          ...bet,
          betType: 'team_shots',
          fixture: {
            id: fixture.id,
            name: fixture.name,
            homeTeam: { id: homeTeam.id, name: homeTeam.name, image: homeTeam.image_path },
            awayTeam: { id: awayTeam.id, name: awayTeam.name, image: awayTeam.image_path },
            league: fixture.league ? { id: fixture.league.id, name: fixture.league.name, image: fixture.league.image_path } : null,
            startingAt: fixture.starting_at,
          },
          expectedValue: matchExpectedShots,
        });
      });

      // Find value bets for Home Team Shots
      const homeShotsValueBets = findTeamShotsValueBets(homeExpectedShots, teamShotsOdds.homeShots, minEdgeDecimal, 'Home Team Shots', { ...shotsTeamStats, homeAvg: homeExpectedShots, awayAvg: null });
      homeShotsValueBets.forEach(bet => {
        valueBets.push({
          ...bet,
          betType: 'team_shots',
          fixture: {
            id: fixture.id,
            name: fixture.name,
            homeTeam: { id: homeTeam.id, name: homeTeam.name, image: homeTeam.image_path },
            awayTeam: { id: awayTeam.id, name: awayTeam.name, image: awayTeam.image_path },
            league: fixture.league ? { id: fixture.league.id, name: fixture.league.name, image: fixture.league.image_path } : null,
            startingAt: fixture.starting_at,
          },
          expectedValue: homeExpectedShots,
        });
      });

      // Find value bets for Away Team Shots
      const awayShotsValueBets = findTeamShotsValueBets(awayExpectedShots, teamShotsOdds.awayShots, minEdgeDecimal, 'Away Team Shots', { ...shotsTeamStats, homeAvg: null, awayAvg: awayExpectedShots });
      awayShotsValueBets.forEach(bet => {
        valueBets.push({
          ...bet,
          betType: 'team_shots',
          fixture: {
            id: fixture.id,
            name: fixture.name,
            homeTeam: { id: homeTeam.id, name: homeTeam.name, image: homeTeam.image_path },
            awayTeam: { id: awayTeam.id, name: awayTeam.name, image: awayTeam.image_path },
            league: fixture.league ? { id: fixture.league.id, name: fixture.league.name, image: fixture.league.image_path } : null,
            startingAt: fixture.starting_at,
          },
          expectedValue: awayExpectedShots,
        });
      });

      // Find value bets for Match Shots on Target
      const matchSoTValueBets = findTeamShotsValueBets(matchExpectedSoT, teamShotsOdds.matchSoT, minEdgeDecimal, 'Match Shots on Target', sotTeamStats);
      matchSoTValueBets.forEach(bet => {
        valueBets.push({
          ...bet,
          betType: 'team_shots',
          fixture: {
            id: fixture.id,
            name: fixture.name,
            homeTeam: { id: homeTeam.id, name: homeTeam.name, image: homeTeam.image_path },
            awayTeam: { id: awayTeam.id, name: awayTeam.name, image: awayTeam.image_path },
            league: fixture.league ? { id: fixture.league.id, name: fixture.league.name, image: fixture.league.image_path } : null,
            startingAt: fixture.starting_at,
          },
          expectedValue: matchExpectedSoT,
        });
      });

      // Home SoT
      const homeSoTValueBets = findTeamShotsValueBets(homeExpectedSoT, teamShotsOdds.homeSoT, minEdgeDecimal, 'Home Shots on Target', { ...sotTeamStats, homeAvg: homeExpectedSoT, awayAvg: null });
      homeSoTValueBets.forEach(bet => {
        valueBets.push({
          ...bet,
          betType: 'team_shots',
          fixture: {
            id: fixture.id,
            name: fixture.name,
            homeTeam: { id: homeTeam.id, name: homeTeam.name, image: homeTeam.image_path },
            awayTeam: { id: awayTeam.id, name: awayTeam.name, image: awayTeam.image_path },
            league: fixture.league ? { id: fixture.league.id, name: fixture.league.name, image: fixture.league.image_path } : null,
            startingAt: fixture.starting_at,
          },
          expectedValue: homeExpectedSoT,
        });
      });

      // Away SoT
      const awaySoTValueBets = findTeamShotsValueBets(awayExpectedSoT, teamShotsOdds.awaySoT, minEdgeDecimal, 'Away Shots on Target', { ...sotTeamStats, homeAvg: null, awayAvg: awayExpectedSoT });
      awaySoTValueBets.forEach(bet => {
        valueBets.push({
          ...bet,
          betType: 'team_shots',
          fixture: {
            id: fixture.id,
            name: fixture.name,
            homeTeam: { id: homeTeam.id, name: homeTeam.name, image: homeTeam.image_path },
            awayTeam: { id: awayTeam.id, name: awayTeam.name, image: awayTeam.image_path },
            league: fixture.league ? { id: fixture.league.id, name: fixture.league.name, image: fixture.league.image_path } : null,
            startingAt: fixture.starting_at,
          },
          expectedValue: awayExpectedSoT,
        });
      });
    } catch (err) {
      console.error(`[ValueBets] Team shots analysis error for ${fixture.id}:`, err.message);
    }
  }

  // Process offsides if requested
  // Check for any odds (match total, team, or first half) - exclude _structured from count
  const offsidesOddsKeys = Object.keys(offsidesOdds).filter(k => k !== '_structured');
  const offsidesStructured = offsidesOdds._structured || { matchTotal: {}, homeTeam: {}, awayTeam: {} };
  const hasOffsidesOdds = offsidesOddsKeys.length > 0 ||
    Object.keys(offsidesStructured.homeTeam || {}).length > 0 ||
    Object.keys(offsidesStructured.awayTeam || {}).length > 0;

  if (allowedTypes.includes('offsides') && hasOffsidesOdds) {
    try {
      // Get team stats for probability calculation
      const [homeStats, awayStats, homeRecent, awayRecent] = await Promise.all([
        sportmonks.getTeamAdvancedStats(homeTeam.id),
        sportmonks.getTeamAdvancedStats(awayTeam.id),
        sportmonks.getTeamRecentMatchesWithStats(homeTeam.id, 5).catch(() => []),
        sportmonks.getTeamRecentMatchesWithStats(awayTeam.id, 5).catch(() => []),
      ]);

      // Extract recent offsides form
      const homeRecentOffsides = homeRecent.map(m => {
        const stats = m.isHome ? m.homeStats : m.awayStats;
        return stats.offsides || stats.OFFSIDES || 0;
      }).filter(v => v > 0);

      const awayRecentOffsides = awayRecent.map(m => {
        const stats = m.isHome ? m.awayStats : m.homeStats;
        return stats.offsides || stats.OFFSIDES || 0;
      }).filter(v => v > 0);

      const enhancedHomeStats = {
        offsides: homeStats.offsides || { average: LEAGUE_AVERAGES.offsides },
        average: homeStats.offsides?.average || LEAGUE_AVERAGES.offsides,
      };

      const enhancedAwayStats = {
        offsides: awayStats.offsides || { average: LEAGUE_AVERAGES.offsides },
        average: awayStats.offsides?.average || LEAGUE_AVERAGES.offsides,
      };

      const offsidesAnalysis = analyzeMatchOffsides(enhancedHomeStats, enhancedAwayStats, {
        homeRecentForm: { offsides: homeRecentOffsides },
        awayRecentForm: { offsides: awayRecentOffsides },
      });

      console.log(`[DEBUG Offsides] Expected: Home=${offsidesAnalysis.expected.home.toFixed(2)}, Away=${offsidesAnalysis.expected.away.toFixed(2)}, Total=${offsidesAnalysis.expected.total.toFixed(2)}`);

      // Find value bets for MATCH TOTAL (using only match total odds)
      const matchTotalOdds = offsidesStructured.matchTotal || {};
      const offsidesValueBets = findOffsidesValueBets(offsidesAnalysis.totalMarkets, matchTotalOdds, minEdgeDecimal);
      console.log(`[DEBUG Offsides] Match Total Value Bets: ${offsidesValueBets.length}`);

      offsidesValueBets.forEach(bet => {
        valueBets.push({
          ...bet,
          betType: 'offsides',
          market: `Match Total Offsides ${bet.market}`,
          fixture: {
            id: fixture.id,
            name: fixture.name,
            homeTeam: { id: homeTeam.id, name: homeTeam.name, image: homeTeam.image_path },
            awayTeam: { id: awayTeam.id, name: awayTeam.name, image: awayTeam.image_path },
            league: fixture.league ? { id: fixture.league.id, name: fixture.league.name, image: fixture.league.image_path } : null,
            startingAt: fixture.starting_at,
          },
          expectedValue: offsidesAnalysis.expected.total,
        });
      });

      // Find value bets for HOME TEAM offsides (using team odds with team probabilities)
      const homeTeamOdds = offsidesStructured.homeTeam || {};
      if (Object.keys(homeTeamOdds).length > 0) {
        const homeTeamValueBets = findOffsidesValueBets(offsidesAnalysis.homeTeamMarkets, homeTeamOdds, minEdgeDecimal);
        console.log(`[DEBUG Offsides] Home Team Value Bets: ${homeTeamValueBets.length}`);

        homeTeamValueBets.forEach(bet => {
          valueBets.push({
            ...bet,
            betType: 'offsides',
            market: `${homeTeam.name} Offsides ${bet.market}`,
            fixture: {
              id: fixture.id,
              name: fixture.name,
              homeTeam: { id: homeTeam.id, name: homeTeam.name, image: homeTeam.image_path },
              awayTeam: { id: awayTeam.id, name: awayTeam.name, image: awayTeam.image_path },
              league: fixture.league ? { id: fixture.league.id, name: fixture.league.name, image: fixture.league.image_path } : null,
              startingAt: fixture.starting_at,
            },
            expectedValue: offsidesAnalysis.expected.home,
          });
        });
      }

      // Find value bets for AWAY TEAM offsides
      const awayTeamOdds = offsidesStructured.awayTeam || {};
      if (Object.keys(awayTeamOdds).length > 0) {
        const awayTeamValueBets = findOffsidesValueBets(offsidesAnalysis.awayTeamMarkets, awayTeamOdds, minEdgeDecimal);
        console.log(`[DEBUG Offsides] Away Team Value Bets: ${awayTeamValueBets.length}`);

        awayTeamValueBets.forEach(bet => {
          valueBets.push({
            ...bet,
            betType: 'offsides',
            market: `${awayTeam.name} Offsides ${bet.market}`,
            fixture: {
              id: fixture.id,
              name: fixture.name,
              homeTeam: { id: homeTeam.id, name: homeTeam.name, image: homeTeam.image_path },
              awayTeam: { id: awayTeam.id, name: awayTeam.name, image: awayTeam.image_path },
              league: fixture.league ? { id: fixture.league.id, name: fixture.league.name, image: fixture.league.image_path } : null,
              startingAt: fixture.starting_at,
            },
            expectedValue: offsidesAnalysis.expected.away,
          });
        });
      }
    } catch (err) {
      console.error(`[ValueBets] Offsides analysis error for ${fixture.id}:`, err.message);
    }
  }

  // Process throw-ins if requested
  // Check for any odds (match total, team, or first half) - exclude _structured from count
  const throwInsOddsKeys = Object.keys(throwInsOdds).filter(k => k !== '_structured');
  const throwInsStructured = throwInsOdds._structured || { matchTotal: {}, homeTeam: {}, awayTeam: {} };
  const hasThrowInsOdds = throwInsOddsKeys.length > 0 ||
    Object.keys(throwInsStructured.homeTeam || {}).length > 0 ||
    Object.keys(throwInsStructured.awayTeam || {}).length > 0;

  if (allowedTypes.includes('throw_ins') && hasThrowInsOdds) {
    try {
      // Get team stats for probability calculation
      const [homeStats, awayStats, homeRecent, awayRecent] = await Promise.all([
        sportmonks.getTeamAdvancedStats(homeTeam.id),
        sportmonks.getTeamAdvancedStats(awayTeam.id),
        sportmonks.getTeamRecentMatchesWithStats(homeTeam.id, 5).catch(() => []),
        sportmonks.getTeamRecentMatchesWithStats(awayTeam.id, 5).catch(() => []),
      ]);

      // Extract recent throw-ins form
      const homeRecentThrowIns = homeRecent.map(m => {
        const stats = m.isHome ? m.homeStats : m.awayStats;
        return stats.throwins || stats.THROWINS || stats.throw_ins || 0;
      }).filter(v => v > 0);

      const awayRecentThrowIns = awayRecent.map(m => {
        const stats = m.isHome ? m.awayStats : m.homeStats;
        return stats.throwins || stats.THROWINS || stats.throw_ins || 0;
      }).filter(v => v > 0);

      const enhancedHomeStats = {
        throwIns: homeStats.throwIns || { average: LEAGUE_AVERAGES.throwIns },
        average: homeStats.throwIns?.average || LEAGUE_AVERAGES.throwIns,
      };

      const enhancedAwayStats = {
        throwIns: awayStats.throwIns || { average: LEAGUE_AVERAGES.throwIns },
        average: awayStats.throwIns?.average || LEAGUE_AVERAGES.throwIns,
      };

      const throwInsAnalysis = analyzeMatchThrowIns(enhancedHomeStats, enhancedAwayStats, {
        homeRecentForm: { throwIns: homeRecentThrowIns },
        awayRecentForm: { throwIns: awayRecentThrowIns },
      });

      console.log(`[DEBUG Throw-Ins] Expected: Home=${throwInsAnalysis.expected.home.toFixed(2)}, Away=${throwInsAnalysis.expected.away.toFixed(2)}, Total=${throwInsAnalysis.expected.total.toFixed(2)}`);

      // Find value bets for MATCH TOTAL (using only match total odds)
      const matchTotalThrowInsOdds = throwInsStructured.matchTotal || {};
      const throwInsValueBets = findThrowInsValueBets(throwInsAnalysis.totalMarkets, matchTotalThrowInsOdds, minEdgeDecimal);
      console.log(`[DEBUG Throw-Ins] Match Total Value Bets: ${throwInsValueBets.length}`);

      throwInsValueBets.forEach(bet => {
        valueBets.push({
          ...bet,
          betType: 'throw_ins',
          market: `Match Total Throw-Ins ${bet.market}`,
          fixture: {
            id: fixture.id,
            name: fixture.name,
            homeTeam: { id: homeTeam.id, name: homeTeam.name, image: homeTeam.image_path },
            awayTeam: { id: awayTeam.id, name: awayTeam.name, image: awayTeam.image_path },
            league: fixture.league ? { id: fixture.league.id, name: fixture.league.name, image: fixture.league.image_path } : null,
            startingAt: fixture.starting_at,
          },
          expectedValue: throwInsAnalysis.expected.total,
        });
      });

      // Find value bets for HOME TEAM throw-ins (using team odds with team probabilities)
      const homeTeamThrowInsOdds = throwInsStructured.homeTeam || {};
      if (Object.keys(homeTeamThrowInsOdds).length > 0) {
        const homeTeamValueBets = findThrowInsValueBets(throwInsAnalysis.homeTeamMarkets, homeTeamThrowInsOdds, minEdgeDecimal);
        console.log(`[DEBUG Throw-Ins] Home Team Value Bets: ${homeTeamValueBets.length}`);

        homeTeamValueBets.forEach(bet => {
          valueBets.push({
            ...bet,
            betType: 'throw_ins',
            market: `${homeTeam.name} Throw-Ins ${bet.market}`,
            fixture: {
              id: fixture.id,
              name: fixture.name,
              homeTeam: { id: homeTeam.id, name: homeTeam.name, image: homeTeam.image_path },
              awayTeam: { id: awayTeam.id, name: awayTeam.name, image: awayTeam.image_path },
              league: fixture.league ? { id: fixture.league.id, name: fixture.league.name, image: fixture.league.image_path } : null,
              startingAt: fixture.starting_at,
            },
            expectedValue: throwInsAnalysis.expected.home,
          });
        });
      }

      // Find value bets for AWAY TEAM throw-ins
      const awayTeamThrowInsOdds = throwInsStructured.awayTeam || {};
      if (Object.keys(awayTeamThrowInsOdds).length > 0) {
        const awayTeamValueBets = findThrowInsValueBets(throwInsAnalysis.awayTeamMarkets, awayTeamThrowInsOdds, minEdgeDecimal);
        console.log(`[DEBUG Throw-Ins] Away Team Value Bets: ${awayTeamValueBets.length}`);

        awayTeamValueBets.forEach(bet => {
          valueBets.push({
            ...bet,
            betType: 'throw_ins',
            market: `${awayTeam.name} Throw-Ins ${bet.market}`,
            fixture: {
              id: fixture.id,
              name: fixture.name,
              homeTeam: { id: homeTeam.id, name: homeTeam.name, image: homeTeam.image_path },
              awayTeam: { id: awayTeam.id, name: awayTeam.name, image: awayTeam.image_path },
              league: fixture.league ? { id: fixture.league.id, name: fixture.league.name, image: fixture.league.image_path } : null,
              startingAt: fixture.starting_at,
            },
            expectedValue: throwInsAnalysis.expected.away,
          });
        });
      }
    } catch (err) {
      console.error(`[ValueBets] Throw-ins analysis error for ${fixture.id}:`, err.message);
    }
  }

  return valueBets;
}

/**
 * Find value bets for team shots markets
 */
function findTeamShotsValueBets(expected, oddsMap, minEdge, marketPrefix, teamStats = {}) {
  const valueBets = [];

  // Sanity check limits - filter unrealistic edges that likely indicate data errors
  const MAX_REALISTIC_EDGE = 0.35;  // 35% max edge (reduced from 50% - anything higher is suspicious)
  const MIN_LINE_RATIO = 0.4;       // Line should be at least 40% of expected
  const MAX_LINE_RATIO = 2.5;       // Line should be at most 250% of expected

  // Probability caps - no sporting event has 100% or 0% probability
  const MAX_PROB = 0.98;  // Cap at 98% - nothing is certain in sports
  const MIN_PROB = 0.02;  // Floor at 2% - nothing is impossible
  const MIN_FAIR_ODDS = 1.02;  // Corresponds to 98% probability

  for (const [marketKey, oddsInfo] of Object.entries(oddsMap)) {
    const match = marketKey.match(/(over|under)_(\d+\.?\d*)/);
    if (!match) continue;

    const direction = match[1];
    const line = parseFloat(match[2]);

    // SANITY CHECK 1: Skip lines that are unrealistically far from expected
    // This catches mislabeled markets (e.g., first-half or team-specific)
    const lineRatio = line / expected;
    if (direction === 'over' && lineRatio < MIN_LINE_RATIO) {
      // Over line too low compared to expected - likely wrong market
      continue;
    }
    if (direction === 'under' && lineRatio > MAX_LINE_RATIO) {
      // Under line too high compared to expected - likely wrong market
      continue;
    }

    // Calculate probability using Poisson
    let rawProb;
    if (direction === 'over') {
      const threshold = Math.floor(line) + 1;
      rawProb = 1 - poissonCDF(expected, threshold - 1);
    } else {
      const threshold = Math.floor(line);
      rawProb = poissonCDF(expected, threshold);
    }

    // CAP probability to realistic bounds - no sporting outcome is 100% or 0% certain
    const prob = Math.max(MIN_PROB, Math.min(MAX_PROB, rawProb));
    const fairOdds = Math.max(MIN_FAIR_ODDS, 1 / prob);

    const ev = (prob * oddsInfo.odds) - 1;

    // SANITY CHECK 2: Cap unrealistic edges (likely data errors)
    if (ev > MAX_REALISTIC_EDGE) {
      console.log(`[SANITY CHECK] Skipping ${marketPrefix} ${direction} ${line}: edge ${(ev * 100).toFixed(1)}% exceeds ${MAX_REALISTIC_EDGE * 100}% cap (expected: ${expected.toFixed(2)}, odds: ${oddsInfo.odds})`);
      continue;
    }

    if (ev >= minEdge) {
      // Generate description explaining the calculation
      const directionText = direction === 'over' ? 'more than' : 'fewer than';
      const lineText = direction === 'under' ? Math.floor(line) + ' or fewer' : `${Math.floor(line) + 1} or more`;

      let reasoning = `Based on season averages, we expect ${expected.toFixed(1)} ${marketPrefix.toLowerCase()} in this match. `;
      if (teamStats.homeAvg && teamStats.awayAvg) {
        reasoning += `Home team averages ${teamStats.homeAvg.toFixed(1)} shots/match, away team averages ${teamStats.awayAvg.toFixed(1)} shots/match. `;
      }
      reasoning += `Using Poisson distribution, the probability of ${lineText} shots is ${(prob * 100).toFixed(1)}%. `;
      reasoning += `Fair odds: ${fairOdds.toFixed(2)}, bookmaker offers ${oddsInfo.odds.toFixed(2)} = ${(ev * 100).toFixed(1)}% edge.`;

      valueBets.push({
        market: `${marketPrefix} ${direction.charAt(0).toUpperCase() + direction.slice(1)} ${line}`,
        probability: prob,
        fairOdds: fairOdds,  // Use capped fair odds
        bookmakerOdds: oddsInfo.odds,
        bookmaker: oddsInfo.bookmaker,
        edge: ev,
        edgePercent: (ev * 100).toFixed(1) + '%',
        line,
        direction,
        stats: {
          expected: parseFloat(expected.toFixed(2)),
          homeExpected: teamStats.homeAvg ? parseFloat(teamStats.homeAvg.toFixed(2)) : null,
          awayExpected: teamStats.awayAvg ? parseFloat(teamStats.awayAvg.toFixed(2)) : null,
          homeAvg: teamStats.homeAvg ? parseFloat(teamStats.homeAvg.toFixed(2)) : null,
          awayAvg: teamStats.awayAvg ? parseFloat(teamStats.awayAvg.toFixed(2)) : null,
          homeTeam: teamStats.homeTeamName || null,
          awayTeam: teamStats.awayTeamName || null,
          matchesUsedHome: teamStats.matchesUsedHome || null,
          matchesUsedAway: teamStats.matchesUsedAway || null,
          reasoning,
          calculation: {
            model: 'Poisson Distribution',
            lambda: parseFloat(expected.toFixed(2)),
            threshold: direction === 'over' ? Math.floor(line) + 1 : Math.floor(line),
            formula: direction === 'over'
              ? `P(X > ${Math.floor(line)}) = 1 - Σ P(X=k) for k=0 to ${Math.floor(line)}`
              : `P(X ≤ ${Math.floor(line)}) = Σ P(X=k) for k=0 to ${Math.floor(line)}`,
          },
        },
      });
    }
  }

  return valueBets;
}

/**
 * Estimate expected shots for a player based on lineup data and historical averages
 */
function estimatePlayerExpectedShots(playerName, lineups, homeTeamId, awayTeamId) {
  // Try to find player in lineups
  for (const lineup of lineups) {
    const player = lineup.player;
    if (!player) continue;

    const name = player.display_name || player.name || '';
    if (normalizePlayerName(name) === normalizePlayerName(playerName)) {
      // Get player stats
      const stats = player.statistics?.[0]?.details || [];
      let shotsPer90 = 0;
      let appearances = 1;

      for (const stat of stats) {
        const typeName = (stat.type?.developer_name || stat.type?.name || '').toLowerCase();
        const value = typeof stat.value === 'object' ? stat.value?.total : stat.value;

        if (typeName === 'shots_total' || typeName === 'shots') {
          shotsPer90 = value || 0;
        }
        if (typeName.includes('appearance')) {
          appearances = value || 1;
        }
      }

      if (shotsPer90 > 0 && appearances > 0) {
        return (shotsPer90 / appearances) * 0.78; // Adjust for expected ~70 min
      }
    }
  }

  // Default estimates based on position (attackers shoot more)
  // Use conservative estimate if we can't find player data
  return 1.5; // Average shots for an attacking player
}

/**
 * Estimate expected shots on target for a player
 */
function estimatePlayerExpectedSoT(playerName, lineups, homeTeamId, awayTeamId) {
  const expectedShots = estimatePlayerExpectedShots(playerName, lineups, homeTeamId, awayTeamId);
  // SoT rate typically around 35-40% of total shots
  return expectedShots * 0.37;
}

/**
 * Estimate expected goals for a player based on historical data
 */
function estimatePlayerExpectedGoals(playerName, lineups, homeTeamId, awayTeamId) {
  // Try to find player in lineups
  for (const lineup of lineups) {
    const player = lineup.player;
    if (!player) continue;

    const name = player.display_name || player.name || '';
    if (normalizePlayerName(name) === normalizePlayerName(playerName)) {
      // Get player stats
      const stats = player.statistics?.[0]?.details || [];
      let goalsPer90 = 0;
      let appearances = 1;

      for (const stat of stats) {
        const typeName = (stat.type?.developer_name || stat.type?.name || '').toLowerCase();
        const value = typeof stat.value === 'object' ? stat.value?.total : stat.value;

        if (typeName === 'goals' || typeName === 'goals_scored') {
          goalsPer90 = value || 0;
        }
        if (typeName.includes('appearance')) {
          appearances = value || 1;
        }
      }

      if (goalsPer90 > 0 && appearances > 0) {
        return (goalsPer90 / appearances) * 0.78; // Adjust for expected ~70 min
      }
    }
  }

  // Default estimate based on position
  return 0.25; // Average goals for an attacking player per match
}

/**
 * Parse corner odds from bookmaker data
 * The Odds API returns bookmakers as an object: { "888Sport": [...markets], "Bet365": [...markets] }
 */
function parseCornerOdds(oddsData) {
  const cornerOdds = {};

  if (!oddsData?.bookmakers || typeof oddsData.bookmakers !== 'object') return cornerOdds;

  // Iterate over bookmaker names (object keys)
  for (const [bookmakerName, markets] of Object.entries(oddsData.bookmakers)) {
    if (!Array.isArray(markets)) continue;

    for (const market of markets) {
      const marketName = (market.name || '').toLowerCase();

      // Check if this is a corner market (exclude HT/half-time and team-specific markets)
      const isCornerMarket = marketName.includes('corner') &&
        (marketName.includes('over') || marketName.includes('under') || marketName.includes('total'));
      const isHalfTime = marketName.includes('ht') || marketName.includes('half') || marketName.includes('1st');
      const isTeamSpecific = marketName.includes('home') || marketName.includes('away') || marketName.includes('team');

      // Only process full-match corner totals (not HT, not team-specific)
      if (isCornerMarket && !isHalfTime && !isTeamSpecific) {
        const odds = market.odds || [];

        for (const outcome of odds) {
          if (outcome.over !== undefined || outcome.under !== undefined) {
            const line = parseFloat(outcome.hdp || outcome.line || extractLineFromMarketName(marketName));
            const overOdds = parseFloat(outcome.over);
            const underOdds = parseFloat(outcome.under);

            if (!isNaN(line)) {
              // Validate over odds: must be reasonable (1.01-50) and NOT equal to the line value (parsing error)
              if (outcome.over && outcome.over !== 'N/A' && outcome.over !== 'NaN' && !isNaN(overOdds)) {
                const isValidOverOdds = overOdds >= 1.01 && overOdds <= 50 &&
                  Math.abs(overOdds - line) > 0.01 && Math.abs(overOdds - Math.floor(line)) > 0.01;
                if (isValidOverOdds) {
                  if (!cornerOdds[`over_${line}`] || overOdds > cornerOdds[`over_${line}`].odds) {
                    cornerOdds[`over_${line}`] = { odds: overOdds, bookmaker: bookmakerName };
                  }
                }
              }
              // Validate under odds: must be reasonable (1.01-50) and NOT equal to the line value
              if (outcome.under && outcome.under !== 'N/A' && outcome.under !== 'NaN' && !isNaN(underOdds)) {
                const isValidUnderOdds = underOdds >= 1.01 && underOdds <= 50 &&
                  Math.abs(underOdds - line) > 0.01 && Math.abs(underOdds - Math.floor(line)) > 0.01;
                if (isValidUnderOdds) {
                  if (!cornerOdds[`under_${line}`] || underOdds > cornerOdds[`under_${line}`].odds) {
                    cornerOdds[`under_${line}`] = { odds: underOdds, bookmaker: bookmakerName };
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return cornerOdds;
}

/**
 * Parse card odds from bookmaker data
 * The Odds API returns bookmakers as an object: { "888Sport": [...markets], "Bet365": [...markets] }
 */
function parseCardOdds(oddsData) {
  const cardOdds = {};

  if (!oddsData?.bookmakers || typeof oddsData.bookmakers !== 'object') return cardOdds;

  // Iterate over bookmaker names (object keys)
  for (const [bookmakerName, markets] of Object.entries(oddsData.bookmakers)) {
    if (!Array.isArray(markets)) continue;

    for (const market of markets) {
      const marketName = (market.name || '').toLowerCase();

      // Check if this is a card/booking market (exclude HT/half-time and team-specific markets)
      const isCardMarket = (marketName.includes('card') || marketName.includes('booking')) &&
        (marketName.includes('over') || marketName.includes('under') || marketName.includes('total'));
      const isHalfTime = marketName.includes('ht') || marketName.includes('half') || marketName.includes('1st');
      const isTeamSpecific = marketName.includes('home') || marketName.includes('away') || marketName.includes('team');

      // Only process full-match card totals (not HT, not team-specific)
      if (isCardMarket && !isHalfTime && !isTeamSpecific) {
        const odds = market.odds || [];

        for (const outcome of odds) {
          // Handle different odds structures
          if (outcome.over !== undefined || outcome.under !== undefined) {
            // Structure: { hdp: 3.5, over: "1.85", under: "1.95" }
            const line = parseFloat(outcome.hdp || outcome.line || extractLineFromMarketName(marketName));
            if (!isNaN(line)) {
              // Validate over odds: must be reasonable (1.01-50) and NOT equal to the line value
              if (outcome.over && outcome.over !== 'N/A' && outcome.over !== 'NaN') {
                const overOdds = parseFloat(outcome.over);
                const isValidOverOdds = !isNaN(overOdds) && overOdds >= 1.01 && overOdds <= 50 &&
                  Math.abs(overOdds - line) > 0.01 && Math.abs(overOdds - Math.floor(line)) > 0.01;
                if (isValidOverOdds && (!cardOdds[`cards_over_${line}`] || overOdds > cardOdds[`cards_over_${line}`].odds)) {
                  cardOdds[`cards_over_${line}`] = { odds: overOdds, bookmaker: bookmakerName };
                }
              }
              // Validate under odds: must be reasonable (1.01-50) and NOT equal to the line value
              if (outcome.under && outcome.under !== 'N/A' && outcome.under !== 'NaN') {
                const underOdds = parseFloat(outcome.under);
                const isValidUnderOdds = !isNaN(underOdds) && underOdds >= 1.01 && underOdds <= 50 &&
                  Math.abs(underOdds - line) > 0.01 && Math.abs(underOdds - Math.floor(line)) > 0.01;
                if (isValidUnderOdds && (!cardOdds[`cards_under_${line}`] || underOdds > cardOdds[`cards_under_${line}`].odds)) {
                  cardOdds[`cards_under_${line}`] = { odds: underOdds, bookmaker: bookmakerName };
                }
              }
            }
          }
        }
      }
    }
  }

  return cardOdds;
}

/**
 * Extract line number from market name (e.g., "Total Corners Over/Under 9.5" -> 9.5)
 */
function extractLineFromMarketName(name) {
  const match = name.match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : NaN;
}

/**
 * Extract line number from outcome name (legacy)
 */
function extractLineFromName(name) {
  const match = name.match(/(\d+\.?\d*)/);
  return match ? parseFloat(match[1]) : NaN;
}

/**
 * Parse match result (1X2/ML) odds from bookmaker data
 */
function parseMatchOdds(oddsData) {
  const matchOdds = {};

  if (!oddsData?.bookmakers || typeof oddsData.bookmakers !== 'object') return matchOdds;

  for (const [bookmakerName, markets] of Object.entries(oddsData.bookmakers)) {
    if (!Array.isArray(markets)) continue;

    for (const market of markets) {
      const marketName = (market.name || '').toUpperCase();

      // Check if this is a match result market (ML, 1X2, Match Winner)
      if (marketName === 'ML' || marketName === '1X2' || marketName.includes('MATCH') || marketName.includes('WINNER')) {
        const odds = market.odds || [];

        for (const outcome of odds) {
          // Handle structure: { home: "2.10", draw: "3.30", away: "3.50" }
          // Validate odds are reasonable (1.01-100 for match result)
          if (outcome.home !== undefined) {
            const homeOdds = parseFloat(outcome.home);
            if (!isNaN(homeOdds) && homeOdds >= 1.01 && homeOdds <= 100) {
              if (!matchOdds.home || homeOdds > matchOdds.home.odds) {
                matchOdds.home = { odds: homeOdds, bookmaker: bookmakerName };
              }
            }
          }
          if (outcome.draw !== undefined) {
            const drawOdds = parseFloat(outcome.draw);
            if (!isNaN(drawOdds) && drawOdds >= 1.01 && drawOdds <= 100) {
              if (!matchOdds.draw || drawOdds > matchOdds.draw.odds) {
                matchOdds.draw = { odds: drawOdds, bookmaker: bookmakerName };
              }
            }
          }
          if (outcome.away !== undefined) {
            const awayOdds = parseFloat(outcome.away);
            if (!isNaN(awayOdds) && awayOdds >= 1.01 && awayOdds <= 100) {
              if (!matchOdds.away || awayOdds > matchOdds.away.odds) {
                matchOdds.away = { odds: awayOdds, bookmaker: bookmakerName };
              }
            }
          }
        }
      }
    }
  }

  return matchOdds;
}

/**
 * Parse goals over/under odds from bookmaker data
 */
function parseGoalsOdds(oddsData) {
  const goalsOdds = {};

  if (!oddsData?.bookmakers || typeof oddsData.bookmakers !== 'object') return goalsOdds;

  for (const [bookmakerName, markets] of Object.entries(oddsData.bookmakers)) {
    if (!Array.isArray(markets)) continue;

    for (const market of markets) {
      const marketName = (market.name || '').toLowerCase();

      // Match goals markets: "Totals", "Goals Over/Under", etc.
      // Market names from API: "Totals", "Goals Over/Under", "Alternative Goal Line"
      // Exclude: team-specific (Home/Away), half-time, and non-goals markets
      const isGoalsMarket = (
        marketName === 'totals' ||
        marketName === 'goals over/under' ||
        (marketName.includes('goal') && marketName.includes('line'))
      ) && (
        !marketName.includes('corner') &&
        !marketName.includes('card') &&
        !marketName.includes('team') &&
        !marketName.includes('home') &&
        !marketName.includes('away') &&
        !marketName.includes('ht') &&
        !marketName.includes('half') &&
        !marketName.includes('1st') &&
        !marketName.includes('goalkeeper') &&
        !marketName.includes('save') &&
        !marketName.includes('scorer') &&
        !marketName.includes('score 2') &&
        !marketName.includes('score 3')
      );

      if (isGoalsMarket) {
        const odds = market.odds || [];

        for (const outcome of odds) {
          if (outcome.over !== undefined || outcome.under !== undefined) {
            // The API uses 'hdp' (handicap) for the line, not 'line'
            const line = parseFloat(outcome.hdp || outcome.line || extractLineFromMarketName(marketName));
            if (!isNaN(line)) {
              // Validate over odds: must be reasonable (1.01-50) and NOT equal to the line value
              if (outcome.over && outcome.over !== 'N/A' && outcome.over !== 'NaN') {
                const overOdds = parseFloat(outcome.over);
                const isValidOverOdds = !isNaN(overOdds) && overOdds >= 1.01 && overOdds <= 50 &&
                  Math.abs(overOdds - line) > 0.01 && Math.abs(overOdds - Math.floor(line)) > 0.01;
                if (isValidOverOdds && (!goalsOdds[`goals_over_${line}`] || overOdds > goalsOdds[`goals_over_${line}`].odds)) {
                  goalsOdds[`goals_over_${line}`] = { odds: overOdds, bookmaker: bookmakerName, line };
                }
              }
              // Validate under odds: must be reasonable (1.01-50) and NOT equal to the line value
              if (outcome.under && outcome.under !== 'N/A' && outcome.under !== 'NaN') {
                const underOdds = parseFloat(outcome.under);
                const isValidUnderOdds = !isNaN(underOdds) && underOdds >= 1.01 && underOdds <= 50 &&
                  Math.abs(underOdds - line) > 0.01 && Math.abs(underOdds - Math.floor(line)) > 0.01;
                if (isValidUnderOdds && (!goalsOdds[`goals_under_${line}`] || underOdds > goalsOdds[`goals_under_${line}`].odds)) {
                  goalsOdds[`goals_under_${line}`] = { odds: underOdds, bookmaker: bookmakerName, line };
                }
              }
            }
          }
        }
      }
    }
  }

  return goalsOdds;
}

/**
 * Parse BTTS (Both Teams to Score) odds from bookmaker data
 */
function parseBttsOdds(oddsData) {
  const bttsOdds = {};

  if (!oddsData?.bookmakers || typeof oddsData.bookmakers !== 'object') return bttsOdds;

  for (const [bookmakerName, markets] of Object.entries(oddsData.bookmakers)) {
    if (!Array.isArray(markets)) continue;

    for (const market of markets) {
      const marketName = (market.name || '').toLowerCase();

      // Match BTTS markets (exclude HT and period-specific)
      const isBttsMarket = marketName.includes('btts') || marketName.includes('both teams') || marketName.includes('gg/ng');
      const isHalfTime = marketName.includes('ht') || marketName.includes('half') || marketName.includes('1st') || marketName.includes('2nd');

      if (isBttsMarket && !isHalfTime) {
        const odds = market.odds || [];

        for (const outcome of odds) {
          // Handle yes/no structure - validate odds are reasonable (1.01-20)
          if (outcome.yes !== undefined) {
            const yesOdds = parseFloat(outcome.yes);
            if (!isNaN(yesOdds) && yesOdds >= 1.01 && yesOdds <= 20) {
              if (!bttsOdds.yes || yesOdds > bttsOdds.yes.odds) {
                bttsOdds.yes = { odds: yesOdds, bookmaker: bookmakerName };
              }
            }
          }
          if (outcome.no !== undefined) {
            const noOdds = parseFloat(outcome.no);
            if (!isNaN(noOdds) && noOdds >= 1.01 && noOdds <= 20) {
              if (!bttsOdds.no || noOdds > bttsOdds.no.odds) {
                bttsOdds.no = { odds: noOdds, bookmaker: bookmakerName };
              }
            }
          }
          // Handle GG/NG structure - validate odds are reasonable (1.01-20)
          if (outcome.gg !== undefined) {
            const ggOdds = parseFloat(outcome.gg);
            if (!isNaN(ggOdds) && ggOdds >= 1.01 && ggOdds <= 20) {
              if (!bttsOdds.yes || ggOdds > bttsOdds.yes.odds) {
                bttsOdds.yes = { odds: ggOdds, bookmaker: bookmakerName };
              }
            }
          }
          if (outcome.ng !== undefined) {
            const ngOdds = parseFloat(outcome.ng);
            if (!isNaN(ngOdds) && ngOdds >= 1.01 && ngOdds <= 20) {
              if (!bttsOdds.no || ngOdds > bttsOdds.no.odds) {
                bttsOdds.no = { odds: ngOdds, bookmaker: bookmakerName };
              }
            }
          }
        }
      }
    }
  }

  return bttsOdds;
}

/**
 * Parse match result (1X2/ML) odds from OpticOdds processed format
 */
function parseMatchOddsFromOptic(processedOdds) {
  const matchOdds = {};

  if (!processedOdds?.markets) return matchOdds;

  // Look for moneyline market
  const moneylineMarket = processedOdds.markets['moneyline'] || [];

  for (const odd of moneylineMarket) {
    const selection = (odd.selection || '').toLowerCase();
    const decimalOdds = odd.decimalOdds;

    if (!decimalOdds || decimalOdds < 1.01 || decimalOdds > 100) continue;

    if (selection.includes('home') || odd.name?.toLowerCase().includes('home')) {
      if (!matchOdds.home || decimalOdds > matchOdds.home.odds) {
        matchOdds.home = { odds: decimalOdds, bookmaker: odd.sportsbook };
      }
    } else if (selection === 'draw') {
      if (!matchOdds.draw || decimalOdds > matchOdds.draw.odds) {
        matchOdds.draw = { odds: decimalOdds, bookmaker: odd.sportsbook };
      }
    } else if (selection.includes('away') || odd.name?.toLowerCase().includes('away')) {
      if (!matchOdds.away || decimalOdds > matchOdds.away.odds) {
        matchOdds.away = { odds: decimalOdds, bookmaker: odd.sportsbook };
      }
    }
  }

  // Also check moneyline_3-way market
  const moneyline3Way = processedOdds.markets['moneyline_3-way'] || [];
  for (const odd of moneyline3Way) {
    const selection = (odd.selection || '').toLowerCase();
    const decimalOdds = odd.decimalOdds;

    if (!decimalOdds || decimalOdds < 1.01 || decimalOdds > 100) continue;

    // In 3-way, first team is home, draw is draw, second team is away
    if (selection === 'draw') {
      if (!matchOdds.draw || decimalOdds > matchOdds.draw.odds) {
        matchOdds.draw = { odds: decimalOdds, bookmaker: odd.sportsbook };
      }
    } else if (!matchOdds.home) {
      // First non-draw selection is home
      matchOdds.home = { odds: decimalOdds, bookmaker: odd.sportsbook };
    } else if (!matchOdds.away) {
      // Second non-draw selection is away
      matchOdds.away = { odds: decimalOdds, bookmaker: odd.sportsbook };
    }
  }

  return matchOdds;
}

/**
 * Parse card odds from OpticOdds processed format
 */
function parseCardOddsFromOptic(processedOdds) {
  const cardOdds = {};

  if (!processedOdds?.markets) return cardOdds;

  // Look for total_cards and total_card_points markets
  const cardMarkets = [
    ...(processedOdds.markets['total_cards'] || []),
    ...(processedOdds.markets['total_card_points'] || [])
  ];

  for (const odd of cardMarkets) {
    const line = odd.points;
    if (line === undefined) continue;

    const isOver = odd.selectionLine === 'over' || odd.name?.toLowerCase().includes('over');
    const decimalOdds = odd.decimalOdds;

    if (!decimalOdds || decimalOdds < 1.01 || decimalOdds > 50) continue;

    const marketKey = isOver ? `cards_over_${line}` : `cards_under_${line}`;

    if (!cardOdds[marketKey] || decimalOdds > cardOdds[marketKey].odds) {
      cardOdds[marketKey] = {
        odds: decimalOdds,
        bookmaker: odd.sportsbook,
        line,
        isOver
      };
    }
  }

  return cardOdds;
}

/**
 * Parse team shots odds from OpticOdds processed format
 * Processes each market type SEPARATELY to avoid confusing team totals with match totals
 */
function parseTeamShotsOddsFromOptic(processedOdds) {
  const teamShotsOdds = {
    matchShots: {},      // Match total shots (both teams combined, expected ~24)
    homeShots: {},       // Home team shots only (expected ~12)
    awayShots: {},       // Away team shots only (expected ~12)
    matchSoT: {},        // Match total shots on target (expected ~8)
    homeSoT: {},         // Home team shots on target (expected ~4)
    awaySoT: {}          // Away team shots on target (expected ~4)
  };

  if (!processedOdds?.markets) return teamShotsOdds;

  // Helper function to add odds to target object
  const addOddsToTarget = (targetObj, odd) => {
    const line = odd.points;
    if (line === undefined) return;

    const isOver = odd.selectionLine === 'over' || odd.name?.toLowerCase().includes('over');
    const decimalOdds = odd.decimalOdds;

    if (!decimalOdds || decimalOdds < 1.01 || decimalOdds > 50) return;

    const marketKey = isOver ? `over_${line}` : `under_${line}`;

    if (!targetObj[marketKey] || decimalOdds > targetObj[marketKey].odds) {
      targetObj[marketKey] = {
        odds: decimalOdds,
        bookmaker: odd.sportsbook,
        line,
        isOver
      };
    }
  };

  // Process MATCH TOTAL SHOTS (total_shots market - MATCH TOTAL, expected ~24)
  const matchShotsMarkets = processedOdds.markets['total_shots'] || [];
  for (const odd of matchShotsMarkets) {
    const selection = (odd.selection || '').toLowerCase();
    // Skip if this is actually a team-specific selection within total_shots
    if (selection.includes('home') || selection.includes('away')) {
      // This shouldn't happen, but handle it anyway
      if (selection.includes('home')) {
        addOddsToTarget(teamShotsOdds.homeShots, odd);
      } else {
        addOddsToTarget(teamShotsOdds.awayShots, odd);
      }
    } else {
      // Match total shots
      addOddsToTarget(teamShotsOdds.matchShots, odd);
    }
  }

  // Process MATCH TOTAL SHOTS ON TARGET (total_shots_on_target market, expected ~8)
  const matchSoTMarkets = processedOdds.markets['total_shots_on_target'] || [];
  for (const odd of matchSoTMarkets) {
    const selection = (odd.selection || '').toLowerCase();
    if (selection.includes('home') || selection.includes('away')) {
      if (selection.includes('home')) {
        addOddsToTarget(teamShotsOdds.homeSoT, odd);
      } else {
        addOddsToTarget(teamShotsOdds.awaySoT, odd);
      }
    } else {
      // Match total SoT
      addOddsToTarget(teamShotsOdds.matchSoT, odd);
    }
  }

  // Process TEAM TOTAL SHOTS (team_total_shots market - team specific, expected ~12 each)
  const teamShotsMarkets = processedOdds.markets['team_total_shots'] || [];
  for (const odd of teamShotsMarkets) {
    const selection = (odd.selection || '').toLowerCase();
    if (selection.includes('home')) {
      addOddsToTarget(teamShotsOdds.homeShots, odd);
    } else if (selection.includes('away')) {
      addOddsToTarget(teamShotsOdds.awayShots, odd);
    } else {
      // If no team specified, assume match total (unlikely but handle it)
      addOddsToTarget(teamShotsOdds.matchShots, odd);
    }
  }

  // Process TEAM TOTAL SHOTS ON TARGET (team_total_shots_on_target market, expected ~4 each)
  const teamSoTMarkets = processedOdds.markets['team_total_shots_on_target'] || [];
  for (const odd of teamSoTMarkets) {
    const selection = (odd.selection || '').toLowerCase();
    if (selection.includes('home')) {
      addOddsToTarget(teamShotsOdds.homeSoT, odd);
    } else if (selection.includes('away')) {
      addOddsToTarget(teamShotsOdds.awaySoT, odd);
    } else {
      addOddsToTarget(teamShotsOdds.matchSoT, odd);
    }
  }

  console.log('[DEBUG Shots Parsing] Match shots lines:', Object.keys(teamShotsOdds.matchShots));
  console.log('[DEBUG Shots Parsing] Home shots lines:', Object.keys(teamShotsOdds.homeShots));
  console.log('[DEBUG Shots Parsing] Away shots lines:', Object.keys(teamShotsOdds.awayShots));
  console.log('[DEBUG Shots Parsing] Match SoT lines:', Object.keys(teamShotsOdds.matchSoT));

  return teamShotsOdds;
}

/**
 * Calculate match result probabilities using Poisson distribution
 */
function calculateMatchProbabilities(homeExpected, awayExpected) {
  // Poisson probability function
  const poisson = (lambda, k) => {
    return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
  };

  const factorial = (n) => {
    if (n <= 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  };

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;

  // Calculate probabilities for scorelines 0-0 to 6-6
  for (let h = 0; h <= 6; h++) {
    for (let a = 0; a <= 6; a++) {
      const prob = poisson(homeExpected, h) * poisson(awayExpected, a);
      if (h > a) homeWin += prob;
      else if (h === a) draw += prob;
      else awayWin += prob;
    }
  }

  // Normalize to ensure they sum to 1
  const total = homeWin + draw + awayWin;
  return {
    home: homeWin / total,
    draw: draw / total,
    away: awayWin / total,
  };
}

/**
 * Find match result value bets
 */
function findMatchValueBets(probs, oddsMap, minEdge) {
  const valueBets = [];

  // Check home win
  if (oddsMap.home) {
    const ev = (probs.home * oddsMap.home.odds) - 1;
    if (ev >= minEdge) {
      valueBets.push({
        market: 'Home Win',
        probability: probs.home,
        fairOdds: 1 / probs.home,
        bookmakerOdds: oddsMap.home.odds,
        bookmaker: oddsMap.home.bookmaker,
        edge: ev,
        edgePercent: (ev * 100).toFixed(1) + '%',
      });
    }
  }

  // Check draw
  if (oddsMap.draw) {
    const ev = (probs.draw * oddsMap.draw.odds) - 1;
    if (ev >= minEdge) {
      valueBets.push({
        market: 'Draw',
        probability: probs.draw,
        fairOdds: 1 / probs.draw,
        bookmakerOdds: oddsMap.draw.odds,
        bookmaker: oddsMap.draw.bookmaker,
        edge: ev,
        edgePercent: (ev * 100).toFixed(1) + '%',
      });
    }
  }

  // Check away win
  if (oddsMap.away) {
    const ev = (probs.away * oddsMap.away.odds) - 1;
    if (ev >= minEdge) {
      valueBets.push({
        market: 'Away Win',
        probability: probs.away,
        fairOdds: 1 / probs.away,
        bookmakerOdds: oddsMap.away.odds,
        bookmaker: oddsMap.away.bookmaker,
        edge: ev,
        edgePercent: (ev * 100).toFixed(1) + '%',
      });
    }
  }

  return valueBets;
}

/**
 * Calculate goals over/under probabilities using Poisson distribution
 */
function calculateGoalsProbabilities(expectedTotalGoals) {
  const poisson = (lambda, k) => {
    let result = 1;
    for (let i = 1; i <= k; i++) {
      result *= lambda / i;
    }
    return result * Math.exp(-lambda);
  };

  // Calculate cumulative probabilities for 0-10 goals
  const goalProbs = [];
  for (let i = 0; i <= 10; i++) {
    goalProbs[i] = poisson(expectedTotalGoals, i);
  }

  // Calculate over/under probabilities for common lines
  const lines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5];
  const probs = {};

  for (const line of lines) {
    let underProb = 0;
    for (let i = 0; i <= Math.floor(line); i++) {
      underProb += goalProbs[i];
    }
    probs[`under_${line}`] = underProb;
    probs[`over_${line}`] = 1 - underProb;
  }

  return probs;
}

/**
 * Calculate BTTS probabilities using Poisson distribution
 */
function calculateBttsProbabilities(homeExpected, awayExpected) {
  const poisson = (lambda, k) => {
    let result = 1;
    for (let i = 1; i <= k; i++) {
      result *= lambda / i;
    }
    return result * Math.exp(-lambda);
  };

  // P(home scores 0) and P(away scores 0)
  const homeScoresZero = poisson(homeExpected, 0);
  const awayScoresZero = poisson(awayExpected, 0);

  // P(BTTS Yes) = 1 - P(home=0) - P(away=0) + P(both=0)
  const bttsNo = homeScoresZero + awayScoresZero - (homeScoresZero * awayScoresZero);
  const bttsYes = 1 - bttsNo;

  return {
    yes: bttsYes,
    no: bttsNo,
  };
}

/**
 * Find goals over/under value bets
 */
function findGoalsValueBets(probs, oddsMap, minEdge) {
  const valueBets = [];
  const MAX_REALISTIC_EDGE = 0.50;  // 50% max edge

  for (const [key, oddsInfo] of Object.entries(oddsMap)) {
    // key format from OpticOdds is "over_2.5" or "under_1.5"
    const match = key.match(/(over|under)_(\d+\.?\d*)/);
    if (!match) continue;

    const direction = match[1];
    const line = parseFloat(match[2]);
    const probKey = `${direction}_${line}`;
    const prob = probs[probKey];

    if (prob === undefined) continue;

    // Support both old format (.odds) and OpticOdds format (.decimalOdds)
    const odds = oddsInfo.decimalOdds || oddsInfo.odds;
    const bookmaker = oddsInfo.sportsbook || oddsInfo.bookmaker;

    if (!odds) continue;

    const ev = (prob * odds) - 1;

    // Sanity check: skip unrealistic edges
    if (ev > MAX_REALISTIC_EDGE) {
      console.log(`[SANITY CHECK] Skipping Goals ${direction} ${line}: edge ${(ev * 100).toFixed(1)}% exceeds ${MAX_REALISTIC_EDGE * 100}% cap`);
      continue;
    }

    if (ev >= minEdge) {
      valueBets.push({
        market: `Goals ${direction.charAt(0).toUpperCase() + direction.slice(1)} ${line}`,
        probability: prob,
        fairOdds: 1 / prob,
        bookmakerOdds: odds,
        bookmaker: bookmaker,
        edge: ev,
        edgePercent: (ev * 100).toFixed(1) + '%',
      });
    }
  }

  return valueBets;
}

/**
 * Find BTTS value bets
 */
function findBttsValueBets(probs, oddsMap, minEdge) {
  const valueBets = [];

  if (oddsMap.yes) {
    // Support both old format (.odds) and OpticOdds format (.decimalOdds)
    const odds = oddsMap.yes.decimalOdds || oddsMap.yes.odds;
    const bookmaker = oddsMap.yes.sportsbook || oddsMap.yes.bookmaker;

    if (odds) {
      const ev = (probs.yes * odds) - 1;
      if (ev >= minEdge) {
        valueBets.push({
          market: 'BTTS Yes',
          probability: probs.yes,
          fairOdds: 1 / probs.yes,
          bookmakerOdds: odds,
          bookmaker: bookmaker,
          edge: ev,
          edgePercent: (ev * 100).toFixed(1) + '%',
        });
      }
    }
  }

  if (oddsMap.no) {
    // Support both old format (.odds) and OpticOdds format (.decimalOdds)
    const odds = oddsMap.no.decimalOdds || oddsMap.no.odds;
    const bookmaker = oddsMap.no.sportsbook || oddsMap.no.bookmaker;

    if (odds) {
      const ev = (probs.no * odds) - 1;
      if (ev >= minEdge) {
        valueBets.push({
          market: 'BTTS No',
          probability: probs.no,
          fairOdds: 1 / probs.no,
          bookmakerOdds: odds,
          bookmaker: bookmaker,
          edge: ev,
          edgePercent: (ev * 100).toFixed(1) + '%',
        });
      }
    }
  }

  return valueBets;
}

/**
 * Find corner value bets from calculated markets and odds
 */
function findCornerValueBetsFromMarkets(markets, oddsMap, minEdge) {
  const valueBets = [];
  const MAX_REALISTIC_EDGE = 0.35;  // 35% max edge (reduced from 50%)
  const MAX_PROB = 0.98;
  const MIN_PROB = 0.02;
  const MIN_FAIR_ODDS = 1.02;

  for (const market of markets) {
    const overKey = `over_${market.line}`;
    const underKey = `under_${market.line}`;

    if (oddsMap[overKey]) {
      // Support both old format (.odds) and OpticOdds format (.decimalOdds)
      const odds = oddsMap[overKey].decimalOdds || oddsMap[overKey].odds;
      const bookmaker = oddsMap[overKey].sportsbook || oddsMap[overKey].bookmaker;

      if (odds) {
        // Cap probability to realistic bounds
        const prob = Math.max(MIN_PROB, Math.min(MAX_PROB, market.over.probability));
        const fairOdds = Math.max(MIN_FAIR_ODDS, 1 / prob);
        const ev = (prob * odds) - 1;
        // Sanity check: skip unrealistic edges
        if (ev > MAX_REALISTIC_EDGE) continue;
        if (ev >= minEdge) {
          valueBets.push({
            market: `Corners Over ${market.line}`,
            probability: prob,
            fairOdds: fairOdds,
            bookmakerOdds: odds,
            bookmaker: bookmaker,
            edge: ev,
            edgePercent: (ev * 100).toFixed(1) + '%',
          });
        }
      }
    }

    if (oddsMap[underKey]) {
      // Support both old format (.odds) and OpticOdds format (.decimalOdds)
      const odds = oddsMap[underKey].decimalOdds || oddsMap[underKey].odds;
      const bookmaker = oddsMap[underKey].sportsbook || oddsMap[underKey].bookmaker;

      if (odds) {
        // Cap probability to realistic bounds
        const prob = Math.max(MIN_PROB, Math.min(MAX_PROB, market.under.probability));
        const fairOdds = Math.max(MIN_FAIR_ODDS, 1 / prob);
        const ev = (prob * odds) - 1;
        // Sanity check: skip unrealistic edges
        if (ev > MAX_REALISTIC_EDGE) continue;
        if (ev >= minEdge) {
          valueBets.push({
            market: `Corners Under ${market.line}`,
            probability: prob,
            fairOdds: fairOdds,
            bookmakerOdds: odds,
            bookmaker: bookmaker,
            edge: ev,
            edgePercent: (ev * 100).toFixed(1) + '%',
          });
        }
      }
    }
  }

  return valueBets;
}

/**
 * Find card value bets from calculated markets and odds
 */
function findCardValueBetsFromMarkets(markets, oddsMap, minEdge) {
  const valueBets = [];
  const MAX_REALISTIC_EDGE = 0.35;  // 35% max edge (reduced from 50%)
  const MAX_PROB = 0.98;
  const MIN_PROB = 0.02;
  const MIN_FAIR_ODDS = 1.02;

  for (const market of markets) {
    const overKey = `cards_over_${market.line}`;
    const underKey = `cards_under_${market.line}`;

    if (oddsMap[overKey]) {
      // Support both old format (.odds) and OpticOdds format (.decimalOdds)
      const odds = oddsMap[overKey].decimalOdds || oddsMap[overKey].odds;
      const bookmaker = oddsMap[overKey].sportsbook || oddsMap[overKey].bookmaker;

      if (odds) {
        // Cap probability to realistic bounds
        const prob = Math.max(MIN_PROB, Math.min(MAX_PROB, market.over.probability));
        const fairOdds = Math.max(MIN_FAIR_ODDS, 1 / prob);
        const ev = (prob * odds) - 1;
        // Sanity check: skip unrealistic edges
        if (ev > MAX_REALISTIC_EDGE) continue;
        if (ev >= minEdge) {
          valueBets.push({
            market: `Cards Over ${market.line}`,
            probability: prob,
            fairOdds: fairOdds,
            bookmakerOdds: odds,
            bookmaker: bookmaker,
            edge: ev,
            edgePercent: (ev * 100).toFixed(1) + '%',
          });
        }
      }
    }

    if (oddsMap[underKey]) {
      // Support both old format (.odds) and OpticOdds format (.decimalOdds)
      const odds = oddsMap[underKey].decimalOdds || oddsMap[underKey].odds;
      const bookmaker = oddsMap[underKey].sportsbook || oddsMap[underKey].bookmaker;

      if (odds) {
        // Cap probability to realistic bounds
        const prob = Math.max(MIN_PROB, Math.min(MAX_PROB, market.under.probability));
        const fairOdds = Math.max(MIN_FAIR_ODDS, 1 / prob);
        const ev = (prob * odds) - 1;
        // Sanity check: skip unrealistic edges
        if (ev > MAX_REALISTIC_EDGE) continue;
        if (ev >= minEdge) {
          valueBets.push({
            market: `Cards Under ${market.line}`,
            probability: prob,
            fairOdds: fairOdds,
            bookmakerOdds: odds,
            bookmaker: bookmaker,
            edge: ev,
            edgePercent: (ev * 100).toFixed(1) + '%',
          });
        }
      }
    }
  }

  return valueBets;
}

/**
 * Parse Player Shots odds from bookmaker data
 * Market name: "Player Shots"
 * Structure: { label: "Player Name (1)", hdp: 2.5, over: "1.833" }
 */
function parsePlayerShotsOdds(oddsData) {
  const playerShotsOdds = {};

  if (!oddsData?.bookmakers || typeof oddsData.bookmakers !== 'object') return playerShotsOdds;

  for (const [bookmakerName, markets] of Object.entries(oddsData.bookmakers)) {
    if (!Array.isArray(markets)) continue;

    for (const market of markets) {
      const marketName = (market.name || '').toLowerCase();

      // Match "Player Shots" but not "Player Shots On Target" or team shots
      if (marketName === 'player shots' || (marketName.includes('player') && marketName.includes('shots') && !marketName.includes('target') && !marketName.includes('team') && !marketName.includes('match'))) {
        const odds = market.odds || [];

        for (const outcome of odds) {
          // Player name is in 'label' field: "Henry Camara (1)"
          let playerName = outcome.label || outcome.player || outcome.name || outcome.description;
          if (!playerName) continue;

          // Clean player name - remove "(1)" or "(2)" suffix
          playerName = playerName.replace(/\s*\(\d+\)\s*$/, '').trim();

          const line = parseFloat(outcome.hdp || outcome.line || outcome.points);
          if (isNaN(line)) continue;

          const playerKey = normalizePlayerName(playerName);

          if (!playerShotsOdds[playerKey]) {
            playerShotsOdds[playerKey] = { name: playerName, markets: {} };
          }

          // Parse over odds (player props typically only have over)
          if (outcome.over && !isNaN(parseFloat(outcome.over))) {
            const overOdds = parseFloat(outcome.over);
            if (overOdds >= 1.01 && overOdds <= 50) {
              if (!playerShotsOdds[playerKey].markets[`over_${line}`] || overOdds > playerShotsOdds[playerKey].markets[`over_${line}`].odds) {
                playerShotsOdds[playerKey].markets[`over_${line}`] = { odds: overOdds, bookmaker: bookmakerName, line };
              }
            }
          }
          if (outcome.under && !isNaN(parseFloat(outcome.under))) {
            const underOdds = parseFloat(outcome.under);
            if (underOdds >= 1.01 && underOdds <= 50) {
              if (!playerShotsOdds[playerKey].markets[`under_${line}`] || underOdds > playerShotsOdds[playerKey].markets[`under_${line}`].odds) {
                playerShotsOdds[playerKey].markets[`under_${line}`] = { odds: underOdds, bookmaker: bookmakerName, line };
              }
            }
          }
        }
      }
    }
  }

  return playerShotsOdds;
}

/**
 * Parse Team Shots odds (Match Shots, Team Shots Home/Away, Total Shots)
 * These are team-level totals for shots in the match
 */
function parseTeamShotsOdds(oddsData) {
  const teamShotsOdds = {
    matchShots: {},      // Total match shots
    homeShots: {},       // Home team shots
    awayShots: {},       // Away team shots
    matchSoT: {},        // Total shots on target
    homeSoT: {},         // Home shots on target
    awaySoT: {}          // Away shots on target
  };

  if (!oddsData?.bookmakers || typeof oddsData.bookmakers !== 'object') return teamShotsOdds;

  for (const [bookmakerName, markets] of Object.entries(oddsData.bookmakers)) {
    if (!Array.isArray(markets)) continue;

    for (const market of markets) {
      const marketName = (market.name || '').toLowerCase();
      const odds = market.odds || [];

      // Match Shots / Total Shots
      if ((marketName === 'match shots' || marketName === 'total shots') && !marketName.includes('target')) {
        for (const outcome of odds) {
          const line = parseFloat(outcome.hdp || outcome.line);
          if (isNaN(line)) continue;

          if (outcome.over) {
            const overOdds = parseFloat(outcome.over);
            if (!isNaN(overOdds) && overOdds >= 1.01 && overOdds <= 50) {
              if (!teamShotsOdds.matchShots[`over_${line}`] || overOdds > teamShotsOdds.matchShots[`over_${line}`].odds) {
                teamShotsOdds.matchShots[`over_${line}`] = { odds: overOdds, bookmaker: bookmakerName, line };
              }
            }
          }
          if (outcome.under) {
            const underOdds = parseFloat(outcome.under);
            if (!isNaN(underOdds) && underOdds >= 1.01 && underOdds <= 50) {
              if (!teamShotsOdds.matchShots[`under_${line}`] || underOdds > teamShotsOdds.matchShots[`under_${line}`].odds) {
                teamShotsOdds.matchShots[`under_${line}`] = { odds: underOdds, bookmaker: bookmakerName, line };
              }
            }
          }
        }
      }

      // Team Shots Home / Total Shots Home
      if ((marketName.includes('shots') && marketName.includes('home')) && !marketName.includes('target')) {
        for (const outcome of odds) {
          const line = parseFloat(outcome.hdp || outcome.line);
          if (isNaN(line)) continue;

          if (outcome.over) {
            const overOdds = parseFloat(outcome.over);
            if (!isNaN(overOdds) && overOdds >= 1.01 && overOdds <= 50) {
              if (!teamShotsOdds.homeShots[`over_${line}`] || overOdds > teamShotsOdds.homeShots[`over_${line}`].odds) {
                teamShotsOdds.homeShots[`over_${line}`] = { odds: overOdds, bookmaker: bookmakerName, line };
              }
            }
          }
          if (outcome.under) {
            const underOdds = parseFloat(outcome.under);
            if (!isNaN(underOdds) && underOdds >= 1.01 && underOdds <= 50) {
              if (!teamShotsOdds.homeShots[`under_${line}`] || underOdds > teamShotsOdds.homeShots[`under_${line}`].odds) {
                teamShotsOdds.homeShots[`under_${line}`] = { odds: underOdds, bookmaker: bookmakerName, line };
              }
            }
          }
        }
      }

      // Team Shots Away / Total Shots Away
      if ((marketName.includes('shots') && marketName.includes('away')) && !marketName.includes('target')) {
        for (const outcome of odds) {
          const line = parseFloat(outcome.hdp || outcome.line);
          if (isNaN(line)) continue;

          if (outcome.over) {
            const overOdds = parseFloat(outcome.over);
            if (!isNaN(overOdds) && overOdds >= 1.01 && overOdds <= 50) {
              if (!teamShotsOdds.awayShots[`over_${line}`] || overOdds > teamShotsOdds.awayShots[`over_${line}`].odds) {
                teamShotsOdds.awayShots[`over_${line}`] = { odds: overOdds, bookmaker: bookmakerName, line };
              }
            }
          }
          if (outcome.under) {
            const underOdds = parseFloat(outcome.under);
            if (!isNaN(underOdds) && underOdds >= 1.01 && underOdds <= 50) {
              if (!teamShotsOdds.awayShots[`under_${line}`] || underOdds > teamShotsOdds.awayShots[`under_${line}`].odds) {
                teamShotsOdds.awayShots[`under_${line}`] = { odds: underOdds, bookmaker: bookmakerName, line };
              }
            }
          }
        }
      }

      // Match Shots on Target / Total Shots on Target
      if ((marketName === 'match shots on target' || marketName === 'total shots on target') && !marketName.includes('home') && !marketName.includes('away')) {
        for (const outcome of odds) {
          const line = parseFloat(outcome.hdp || outcome.line);
          if (isNaN(line)) continue;

          if (outcome.over) {
            const overOdds = parseFloat(outcome.over);
            if (!isNaN(overOdds) && overOdds >= 1.01 && overOdds <= 50) {
              if (!teamShotsOdds.matchSoT[`over_${line}`] || overOdds > teamShotsOdds.matchSoT[`over_${line}`].odds) {
                teamShotsOdds.matchSoT[`over_${line}`] = { odds: overOdds, bookmaker: bookmakerName, line };
              }
            }
          }
          if (outcome.under) {
            const underOdds = parseFloat(outcome.under);
            if (!isNaN(underOdds) && underOdds >= 1.01 && underOdds <= 50) {
              if (!teamShotsOdds.matchSoT[`under_${line}`] || underOdds > teamShotsOdds.matchSoT[`under_${line}`].odds) {
                teamShotsOdds.matchSoT[`under_${line}`] = { odds: underOdds, bookmaker: bookmakerName, line };
              }
            }
          }
        }
      }

      // Shots on Target Home
      if (marketName.includes('shots') && marketName.includes('target') && marketName.includes('home')) {
        for (const outcome of odds) {
          const line = parseFloat(outcome.hdp || outcome.line);
          if (isNaN(line)) continue;

          if (outcome.over) {
            const overOdds = parseFloat(outcome.over);
            if (!isNaN(overOdds) && overOdds >= 1.01 && overOdds <= 50) {
              if (!teamShotsOdds.homeSoT[`over_${line}`] || overOdds > teamShotsOdds.homeSoT[`over_${line}`].odds) {
                teamShotsOdds.homeSoT[`over_${line}`] = { odds: overOdds, bookmaker: bookmakerName, line };
              }
            }
          }
          if (outcome.under) {
            const underOdds = parseFloat(outcome.under);
            if (!isNaN(underOdds) && underOdds >= 1.01 && underOdds <= 50) {
              if (!teamShotsOdds.homeSoT[`under_${line}`] || underOdds > teamShotsOdds.homeSoT[`under_${line}`].odds) {
                teamShotsOdds.homeSoT[`under_${line}`] = { odds: underOdds, bookmaker: bookmakerName, line };
              }
            }
          }
        }
      }

      // Shots on Target Away
      if (marketName.includes('shots') && marketName.includes('target') && marketName.includes('away')) {
        for (const outcome of odds) {
          const line = parseFloat(outcome.hdp || outcome.line);
          if (isNaN(line)) continue;

          if (outcome.over) {
            const overOdds = parseFloat(outcome.over);
            if (!isNaN(overOdds) && overOdds >= 1.01 && overOdds <= 50) {
              if (!teamShotsOdds.awaySoT[`over_${line}`] || overOdds > teamShotsOdds.awaySoT[`over_${line}`].odds) {
                teamShotsOdds.awaySoT[`over_${line}`] = { odds: overOdds, bookmaker: bookmakerName, line };
              }
            }
          }
          if (outcome.under) {
            const underOdds = parseFloat(outcome.under);
            if (!isNaN(underOdds) && underOdds >= 1.01 && underOdds <= 50) {
              if (!teamShotsOdds.awaySoT[`under_${line}`] || underOdds > teamShotsOdds.awaySoT[`under_${line}`].odds) {
                teamShotsOdds.awaySoT[`under_${line}`] = { odds: underOdds, bookmaker: bookmakerName, line };
              }
            }
          }
        }
      }
    }
  }

  return teamShotsOdds;
}

/**
 * Parse Player Shots On Target odds from bookmaker data
 * Market name: "Player Shots On Target"
 * Structure: { label: "Player Name (1)", hdp: 0.5, over: "1.833" }
 */
function parsePlayerSoTOdds(oddsData) {
  const playerSoTOdds = {};

  if (!oddsData?.bookmakers || typeof oddsData.bookmakers !== 'object') return playerSoTOdds;

  for (const [bookmakerName, markets] of Object.entries(oddsData.bookmakers)) {
    if (!Array.isArray(markets)) continue;

    for (const market of markets) {
      const marketName = (market.name || '').toLowerCase();

      // Match "Player Shots On Target" but not team-level markets
      if (marketName.includes('player') && marketName.includes('shots') && marketName.includes('target')) {
        const odds = market.odds || [];

        for (const outcome of odds) {
          // Player name is in 'label' field
          let playerName = outcome.label || outcome.player || outcome.name || outcome.description;
          if (!playerName) continue;

          // Clean player name - remove "(1)" or "(2)" suffix
          playerName = playerName.replace(/\s*\(\d+\)\s*$/, '').trim();

          const line = parseFloat(outcome.hdp || outcome.line || outcome.points);
          if (isNaN(line)) continue;

          const playerKey = normalizePlayerName(playerName);

          if (!playerSoTOdds[playerKey]) {
            playerSoTOdds[playerKey] = { name: playerName, markets: {} };
          }

          // Parse over odds (player props typically only have over)
          if (outcome.over && !isNaN(parseFloat(outcome.over))) {
            const overOdds = parseFloat(outcome.over);
            if (overOdds >= 1.01 && overOdds <= 50) {
              if (!playerSoTOdds[playerKey].markets[`over_${line}`] || overOdds > playerSoTOdds[playerKey].markets[`over_${line}`].odds) {
                playerSoTOdds[playerKey].markets[`over_${line}`] = { odds: overOdds, bookmaker: bookmakerName, line };
              }
            }
          }
          if (outcome.under && !isNaN(parseFloat(outcome.under))) {
            const underOdds = parseFloat(outcome.under);
            if (underOdds >= 1.01 && underOdds <= 50) {
              if (!playerSoTOdds[playerKey].markets[`under_${line}`] || underOdds > playerSoTOdds[playerKey].markets[`under_${line}`].odds) {
                playerSoTOdds[playerKey].markets[`under_${line}`] = { odds: underOdds, bookmaker: bookmakerName, line };
              }
            }
          }
        }
      }
    }
  }

  return playerSoTOdds;
}

/**
 * Parse Anytime Goalscorer odds from bookmaker data
 * Market name: "Anytime Goalscorer", "To Score 2+ Goals", etc.
 * Structure: { label: "Player Name", hdp: 0.5, over: "3.600" }
 */
function parseGoalscorerOdds(oddsData) {
  const goalscorerOdds = {};

  if (!oddsData?.bookmakers || typeof oddsData.bookmakers !== 'object') return goalscorerOdds;

  for (const [bookmakerName, markets] of Object.entries(oddsData.bookmakers)) {
    if (!Array.isArray(markets)) continue;

    for (const market of markets) {
      const marketName = (market.name || '').toLowerCase();

      // Match goalscorer markets
      if (marketName.includes('goalscorer') || marketName.includes('to score')) {
        const isAnytime = marketName.includes('anytime') || marketName === 'goalscorer';
        const isFirst = marketName.includes('first');
        const isLast = marketName.includes('last');
        const is2Plus = marketName.includes('2+') || marketName.includes('score 2');
        const is3Plus = marketName.includes('3+') || marketName.includes('score 3');

        const odds = market.odds || [];

        for (const outcome of odds) {
          // Player name is in 'label' field
          let playerName = outcome.label || outcome.player || outcome.name || outcome.description;
          if (!playerName) continue;

          // Clean player name - remove "(Score)" or "(2)" suffix
          playerName = playerName.replace(/\s*\([^)]*\)\s*$/, '').trim();

          // Odds are in 'over' field (for anytime goalscorer it's the price for scoring)
          const playerOdds = parseFloat(outcome.over || outcome.odds || outcome.price || outcome.value);
          if (isNaN(playerOdds) || playerOdds < 1.01 || playerOdds > 500) continue;

          const playerKey = normalizePlayerName(playerName);

          if (!goalscorerOdds[playerKey]) {
            goalscorerOdds[playerKey] = { name: playerName, markets: {} };
          }

          let marketKey = 'anytime';
          if (isFirst) marketKey = 'first';
          else if (isLast) marketKey = 'last';
          else if (is2Plus) marketKey = '2+_goals';
          else if (is3Plus) marketKey = '3+_goals';

          if (!goalscorerOdds[playerKey].markets[marketKey] || playerOdds > goalscorerOdds[playerKey].markets[marketKey].odds) {
            goalscorerOdds[playerKey].markets[marketKey] = { odds: playerOdds, bookmaker: bookmakerName };
          }
        }
      }
    }
  }

  return goalscorerOdds;
}

/**
 * Normalize player name for matching
 */
function normalizePlayerName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Calculate goalscorer probabilities using Poisson
 * @param {number} expectedGoals - Expected goals per 90 for the player
 * @param {number} expectedMinutes - Expected minutes to play
 */
function calculateGoalscorerProbabilities(expectedGoals, expectedMinutes = 70) {
  const minutesFactor = expectedMinutes / 90;
  const lambda = expectedGoals * minutesFactor;

  // P(0 goals) = e^(-lambda)
  const p0 = Math.exp(-lambda);
  const pAnytime = 1 - p0; // P(1+ goals)

  // P(exactly 1) = lambda * e^(-lambda)
  const p1 = lambda * Math.exp(-lambda);

  // P(2+) = 1 - P(0) - P(1) = 1 - e^(-lambda) - lambda*e^(-lambda)
  const p2Plus = 1 - p0 - p1;

  // P(3+) using Poisson CDF
  let p012 = 0;
  for (let k = 0; k <= 2; k++) {
    p012 += (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
  }
  const p3Plus = 1 - p012;

  return {
    anytime: pAnytime,
    '2+_goals': p2Plus,
    '3+_goals': p3Plus,
    expected: lambda,
  };
}

function factorial(n) {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

/**
 * Find value bets for goalscorer markets
 */
function findGoalscorerValueBets(probs, oddsMap, minEdge) {
  const valueBets = [];

  for (const [marketKey, probValue] of Object.entries(probs)) {
    if (marketKey === 'expected') continue;

    const oddsInfo = oddsMap[marketKey];
    if (!oddsInfo) continue;

    const ev = (probValue * oddsInfo.odds) - 1;
    if (ev >= minEdge) {
      valueBets.push({
        market: marketKey === 'anytime' ? 'Anytime Goalscorer' :
                marketKey === '2+_goals' ? 'To Score 2+ Goals' :
                marketKey === '3+_goals' ? 'To Score 3+ Goals' : marketKey,
        probability: probValue,
        fairOdds: 1 / probValue,
        bookmakerOdds: oddsInfo.odds,
        bookmaker: oddsInfo.bookmaker,
        edge: ev,
        edgePercent: (ev * 100).toFixed(1) + '%',
      });
    }
  }

  return valueBets;
}

/**
 * Find value bets for player shots markets
 */
function findPlayerShotsValueBets(expected, oddsMap, minEdge) {
  const valueBets = [];

  // Probability caps - no sporting event has 100% or 0% probability
  const MAX_PROB = 0.98;
  const MIN_PROB = 0.02;
  const MIN_FAIR_ODDS = 1.02;
  const MAX_REALISTIC_EDGE = 0.35;

  // Calculate Poisson probabilities for each line
  for (const [marketKey, oddsInfo] of Object.entries(oddsMap)) {
    const match = marketKey.match(/(over|under)_(\d+\.?\d*)/);
    if (!match) continue;

    const direction = match[1];
    const line = parseFloat(match[2]);

    // Calculate probability using Poisson
    let rawProb;
    if (direction === 'over') {
      // P(X >= line+1) for integer lines, P(X > line) for non-integer
      const threshold = Math.floor(line) + 1;
      rawProb = 1 - poissonCDF(expected, threshold - 1);
    } else {
      // P(X <= floor(line))
      const threshold = Math.floor(line);
      rawProb = poissonCDF(expected, threshold);
    }

    // CAP probability to realistic bounds
    const prob = Math.max(MIN_PROB, Math.min(MAX_PROB, rawProb));
    const fairOdds = Math.max(MIN_FAIR_ODDS, 1 / prob);

    const ev = (prob * oddsInfo.odds) - 1;

    // Skip unrealistic edges
    if (ev > MAX_REALISTIC_EDGE) continue;

    if (ev >= minEdge) {
      valueBets.push({
        market: `Shots ${direction.charAt(0).toUpperCase() + direction.slice(1)} ${line}`,
        probability: prob,
        fairOdds: fairOdds,
        bookmakerOdds: oddsInfo.odds,
        bookmaker: oddsInfo.bookmaker,
        edge: ev,
        edgePercent: (ev * 100).toFixed(1) + '%',
      });
    }
  }

  return valueBets;
}

/**
 * Poisson CDF - P(X <= k)
 */
function poissonCDF(lambda, k) {
  let sum = 0;
  for (let i = 0; i <= k; i++) {
    sum += (Math.pow(lambda, i) * Math.exp(-lambda)) / factorial(i);
  }
  return sum;
}

export default router;



