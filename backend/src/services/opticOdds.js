/**
 * OpticOdds API Service
 *
 * Integrates with OpticOdds (https://api.opticodds.com) to fetch bookmaker odds.
 * Replaces the previous Odds API integration with a more comprehensive data source.
 *
 * Features:
 * - Fetches odds from multiple sportsbooks
 * - Uses sharp books (Pinnacle, Betfair) for true probability estimation
 * - Supports player props, match markets, and live odds
 * - Calculates EV based on sharp vs soft book comparison
 */

import axios from 'axios';
import { cache } from '../config/redis.js';
import {
  OPTIC_ODDS_CONFIG,
  LEAGUE_MAPPING,
  getOpticOddsLeague,
  americanToDecimal,
  oddsToImpliedProbability,
  removeVig
} from '../config/opticOddsConfig.js';

const { baseUrl, apiKey, cacheTTL, sharpBooks, allSportsbooks, playableBooks, minEdge, markets } = OPTIC_ODDS_CONFIG;

// Create axios instance for OpticOdds API
const opticOddsApi = axios.create({
  baseURL: baseUrl,
  headers: {
    'x-api-key': apiKey
  }
});

// Request interceptor for logging
opticOddsApi.interceptors.request.use((config) => {
  console.log(`[OpticOdds] ${config.method?.toUpperCase()} ${config.url}`);
  return config;
});

// Response interceptor for error handling
opticOddsApi.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('[OpticOdds Error]', error.response?.data || error.message);
    throw error;
  }
);

/**
 * Normalize team name for comparison
 */
function normalizeTeamName(name) {
  if (!name) return '';

  return name
    .toLowerCase()
    .trim()
    .replace(/\s+(fc|afc|sc|cf|ssc|ac|as|us|ss|fk|sk|bk|if|ik)$/i, '')
    .replace(/^(fc|afc|sc|cf|ssc|ac|as|us|ss|fk|sk|bk|if|ik)\s+/i, '')
    .replace(/united/gi, 'utd')
    .replace(/saint/gi, 'st')
    .replace(/athletic/gi, 'ath')
    .replace(/sporting/gi, 'sport')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate similarity score between two team names
 */
function calculateNameSimilarity(name1, name2) {
  const n1 = normalizeTeamName(name1);
  const n2 = normalizeTeamName(name2);

  if (n1 === n2) return 1.0;
  if (n1.includes(n2) || n2.includes(n1)) return 0.9;

  const maxLen = Math.max(n1.length, n2.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(n1, n2);
  return 1 - distance / maxLen;
}

function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

class OpticOddsService {
  constructor() {
    this.fixtureCache = new Map();
  }

  /**
   * Helper for cached requests
   */
  async cachedRequest(cacheKey, ttl, requestFn) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      console.log(`[OpticOdds Cache HIT] ${cacheKey}`);
      return cached;
    }

    console.log(`[OpticOdds Cache MISS] ${cacheKey}`);
    const data = await requestFn();
    await cache.set(cacheKey, data, ttl);
    return data;
  }

  /**
   * Get available sports
   */
  async getSports() {
    return this.cachedRequest('opticodds:sports', cacheTTL.leagues, async () => {
      const response = await opticOddsApi.get('/sports');
      return response.data.data || [];
    });
  }

  /**
   * Get available sportsbooks
   */
  async getSportsbooks() {
    return this.cachedRequest('opticodds:sportsbooks', cacheTTL.sportsbooks, async () => {
      const response = await opticOddsApi.get('/sportsbooks');
      return response.data.data || [];
    });
  }

  /**
   * Get available leagues for soccer
   */
  async getLeagues() {
    return this.cachedRequest('opticodds:leagues:soccer', cacheTTL.leagues, async () => {
      const response = await opticOddsApi.get('/leagues', {
        params: { sport: 'soccer' }
      });
      return response.data.data || [];
    });
  }

  /**
   * Get available markets for soccer
   */
  async getMarkets() {
    return this.cachedRequest('opticodds:markets:soccer', cacheTTL.markets, async () => {
      const response = await opticOddsApi.get('/markets', {
        params: { sport: 'soccer' }
      });
      return response.data.data || [];
    });
  }

  /**
   * Get active fixtures for a league
   */
  async getActiveFixtures(leagueSlug) {
    const cacheKey = `opticodds:fixtures:active:${leagueSlug}`;

    return this.cachedRequest(cacheKey, cacheTTL.fixtures, async () => {
      const response = await opticOddsApi.get('/fixtures/active', {
        params: {
          sport: 'soccer',
          league: leagueSlug
        }
      });
      return response.data.data || [];
    });
  }

  /**
   * Get odds for a specific fixture
   * @param {string} fixtureId - OpticOdds fixture ID
   * @param {Array} sportsbooks - Array of sportsbook names
   */
  async getFixtureOdds(fixtureId, sportsbooks = allSportsbooks) {
    const cacheKey = `opticodds:odds:${fixtureId}`;

    return this.cachedRequest(cacheKey, cacheTTL.odds, async () => {
      try {
        // OpticOdds API doesn't accept comma-separated sportsbooks
        // We need to call for each sportsbook and merge the results
        // For efficiency, start with opticodds_ai (our sharp book) and prioritize playable books
        const allOdds = [];
        let fixtureData = null;

        // Priority order: playable books first (from config), then sharp books, then others
        const prioritySportsbooks = [
          ...playableBooks.filter(s => sportsbooks.includes(s)),
          'opticodds_ai',
          'pinnacle',
          ...sportsbooks.filter(s => !playableBooks.includes(s) && s !== 'opticodds_ai' && s !== 'pinnacle')
        ].slice(0, 12); // Increased limit to include more books

        for (const sportsbook of prioritySportsbooks) {
          try {
            const response = await opticOddsApi.get('/fixtures/odds', {
              params: {
                fixture_id: fixtureId,
                sportsbook: sportsbook
              }
            });

            const data = response.data.data?.[0];
            if (data) {
              if (!fixtureData) {
                fixtureData = { ...data, odds: [] };
              }
              if (data.odds && data.odds.length > 0) {
                allOdds.push(...data.odds);
              }
            }
          } catch (err) {
            // Skip failed sportsbooks silently
          }
        }

        if (fixtureData) {
          fixtureData.odds = allOdds;
          return fixtureData;
        }

        return null;
      } catch (error) {
        console.error(`[OpticOdds] Error fetching odds for ${fixtureId}:`, error.message);
        return null;
      }
    });
  }

  /**
   * Get players for a league
   */
  async getPlayers(leagueSlug) {
    const cacheKey = `opticodds:players:${leagueSlug}`;

    return this.cachedRequest(cacheKey, cacheTTL.players, async () => {
      const response = await opticOddsApi.get('/players', {
        params: {
          sport: 'soccer',
          league: leagueSlug
        }
      });
      return response.data.data || [];
    });
  }

  /**
   * Find matching OpticOdds fixture for a SportMonks fixture
   */
  async findMatchingFixture(fixture) {
    if (!fixture) return null;

    const leagueId = fixture.league_id || fixture.league?.id;
    const opticLeague = getOpticOddsLeague(leagueId);

    if (!opticLeague) {
      console.log(`[OpticOdds] No league mapping for SportMonks league ${leagueId}`);
      return null;
    }

    // Get active fixtures from OpticOdds
    const opticFixtures = await this.getActiveFixtures(opticLeague);

    if (!opticFixtures || opticFixtures.length === 0) {
      console.log(`[OpticOdds] No fixtures found for league ${opticLeague}`);
      return null;
    }

    // Extract team info from SportMonks fixture
    const homeTeam = fixture.participants?.find((p) => p.meta?.location === 'home');
    const awayTeam = fixture.participants?.find((p) => p.meta?.location === 'away');

    if (!homeTeam || !awayTeam) {
      console.log('[OpticOdds] Missing team info in fixture');
      return null;
    }

    const fixtureDate = new Date(fixture.starting_at);

    // Find best matching OpticOdds fixture
    let bestMatch = null;
    let bestScore = 0;

    for (const opticFixture of opticFixtures) {
      const opticDate = new Date(opticFixture.start_date);

      // Check if dates are within 24 hours
      const hoursApart = Math.abs(opticDate - fixtureDate) / (1000 * 60 * 60);
      if (hoursApart > 24) continue;

      // Calculate team name similarity
      const homeScore = calculateNameSimilarity(homeTeam.name, opticFixture.home_team_display);
      const awayScore = calculateNameSimilarity(awayTeam.name, opticFixture.away_team_display);
      const combinedScore = (homeScore + awayScore) / 2;

      // Bonus for exact date match
      const dateBonus = hoursApart < 2 ? 0.1 : 0;
      const totalScore = combinedScore + dateBonus;

      if (totalScore > bestScore && combinedScore > 0.6) {
        bestScore = totalScore;
        bestMatch = {
          ...opticFixture,
          matchScore: combinedScore,
          homeScore,
          awayScore
        };
      }
    }

    if (bestMatch) {
      console.log(
        `[OpticOdds] Matched: ${homeTeam.name} vs ${awayTeam.name} -> ${bestMatch.home_team_display} vs ${bestMatch.away_team_display} (score: ${bestMatch.matchScore.toFixed(2)})`
      );
    } else {
      console.log(`[OpticOdds] No match found for: ${homeTeam.name} vs ${awayTeam.name}`);
    }

    return bestMatch;
  }

  /**
   * Get odds for a SportMonks fixture
   * Main method to use from routes
   */
  async getOddsForFixture(fixture) {
    const matchingFixture = await this.findMatchingFixture(fixture);

    if (!matchingFixture) {
      return null;
    }

    // Get odds from OpticOdds
    const oddsData = await this.getFixtureOdds(matchingFixture.id);

    if (!oddsData || !oddsData.odds || oddsData.odds.length === 0) {
      return null;
    }

    // Process and structure odds
    const processedOdds = this.processOdds(oddsData.odds);

    return {
      event: {
        id: matchingFixture.id,
        home: matchingFixture.home_team_display,
        away: matchingFixture.away_team_display,
        homeId: matchingFixture.home_competitors?.[0]?.id,
        awayId: matchingFixture.away_competitors?.[0]?.id,
        date: matchingFixture.start_date,
        status: matchingFixture.status,
        matchScore: matchingFixture.matchScore,
        league: matchingFixture.league
      },
      odds: processedOdds,
      rawOdds: oddsData.odds,
      mapping: {
        sportmonksFixtureId: fixture.id,
        opticOddsFixtureId: matchingFixture.id,
        league: matchingFixture.league?.name
      },
      meta: {
        fetchedAt: new Date().toISOString(),
        sportsbooksCount: this.countSportsbooks(oddsData.odds),
        marketsCount: this.countMarkets(oddsData.odds)
      }
    };
  }

  /**
   * Process raw odds into structured format
   */
  processOdds(rawOdds) {
    const processed = {
      bookmakers: {},
      markets: {},
      sharp: {},
      best: {}
    };

    if (!rawOdds || !Array.isArray(rawOdds)) return processed;

    // Group odds by market and sportsbook
    for (const odd of rawOdds) {
      // Normalize sportsbook name: lowercase and replace spaces with underscores
      const sportsbook = odd.sportsbook?.toLowerCase().replace(/\s+/g, '_') || odd.sportsbook;
      const marketId = odd.market_id || odd.market?.toLowerCase().replace(/\s+/g, '_');
      const decimalPrice = americanToDecimal(odd.price);

      // By sportsbook
      if (!processed.bookmakers[sportsbook]) {
        processed.bookmakers[sportsbook] = [];
      }
      processed.bookmakers[sportsbook].push({
        market: odd.market,
        marketId: marketId,
        name: odd.name,
        selection: odd.selection,
        selectionLine: odd.selection_line,
        points: odd.points,
        americanOdds: odd.price,
        decimalOdds: decimalPrice,
        impliedProbability: oddsToImpliedProbability(decimalPrice),
        playerId: odd.player_id,
        teamId: odd.team_id,
        isMain: odd.is_main,
        timestamp: odd.timestamp
      });

      // By market
      if (!processed.markets[marketId]) {
        processed.markets[marketId] = [];
      }
      processed.markets[marketId].push({
        sportsbook: sportsbook,
        name: odd.name,
        selection: odd.selection,
        selectionLine: odd.selection_line,
        points: odd.points,
        americanOdds: odd.price,
        decimalOdds: decimalPrice,
        impliedProbability: oddsToImpliedProbability(decimalPrice),
        playerId: odd.player_id,
        teamId: odd.team_id
      });

      // Track sharp book odds for true probability calculation
      if (sharpBooks.includes(sportsbook)) {
        const key = `${marketId}:${odd.name}:${odd.points || ''}`;
        if (!processed.sharp[key]) {
          processed.sharp[key] = [];
        }
        processed.sharp[key].push({
          sportsbook,
          decimalOdds: decimalPrice,
          impliedProbability: oddsToImpliedProbability(decimalPrice)
        });
      }

      // Track best odds per market/selection
      const bestKey = `${marketId}:${odd.name}:${odd.points || ''}`;
      if (!processed.best[bestKey] || decimalPrice > processed.best[bestKey].decimalOdds) {
        processed.best[bestKey] = {
          sportsbook,
          market: odd.market,
          name: odd.name,
          selection: odd.selection,
          points: odd.points,
          decimalOdds: decimalPrice,
          americanOdds: odd.price,
          playerId: odd.player_id
        };
      }
    }

    return processed;
  }

  /**
   * Calculate true probability from sharp books (averaged)
   */
  calculateTrueProbability(sharpOdds) {
    if (!sharpOdds || sharpOdds.length === 0) return null;

    // Average the implied probabilities from sharp books
    const avgImplied = sharpOdds.reduce((sum, o) => sum + o.impliedProbability, 0) / sharpOdds.length;

    // Apply a small vig adjustment (typically ~1-2% for sharp books)
    // This gives a more accurate true probability
    const vigAdjustment = 0.985; // Remove ~1.5% vig
    return Math.min(avgImplied * vigAdjustment, 0.99);
  }

  /**
   * Find value bets by comparing sharp vs soft books
   */
  findValueBets(processedOdds, minEdgeThreshold = minEdge) {
    const valueBets = [];

    // For each market/selection, compare sharp probability to soft book odds
    for (const [key, sharpOdds] of Object.entries(processedOdds.sharp)) {
      const trueProbability = this.calculateTrueProbability(sharpOdds);
      if (!trueProbability) continue;

      // Find the best available odds for this selection
      const bestOdds = processedOdds.best[key];
      if (!bestOdds) continue;

      // Calculate edge: (true probability * decimal odds) - 1
      const edge = (trueProbability * bestOdds.decimalOdds) - 1;

      if (edge >= minEdgeThreshold) {
        valueBets.push({
          market: bestOdds.market,
          name: bestOdds.name,
          selection: bestOdds.selection,
          points: bestOdds.points,
          playerId: bestOdds.playerId,
          sportsbook: bestOdds.sportsbook,
          bookmakerOdds: bestOdds.decimalOdds,
          americanOdds: bestOdds.americanOdds,
          probability: trueProbability,
          fairOdds: 1 / trueProbability,
          edge: edge,
          edgePercent: (edge * 100).toFixed(2) + '%',
          sharpAvgProbability: sharpOdds.reduce((s, o) => s + o.impliedProbability, 0) / sharpOdds.length,
          confidence: this.calculateConfidence(sharpOdds, edge)
        });
      }
    }

    // Sort by edge descending
    return valueBets.sort((a, b) => b.edge - a.edge);
  }

  /**
   * Calculate confidence score for a value bet
   */
  calculateConfidence(sharpOdds, edge) {
    // Factors that increase confidence:
    // 1. More sharp books agree
    // 2. Sharp books have similar probabilities (low variance)
    // 3. Edge is significant but not too extreme

    const numSharps = sharpOdds.length;
    const probs = sharpOdds.map(o => o.impliedProbability);
    const variance = this.calculateVariance(probs);

    let confidence = 0.5; // Base confidence

    // More sharp books = higher confidence
    if (numSharps >= 2) confidence += 0.1;
    if (numSharps >= 3) confidence += 0.1;

    // Low variance in sharp probabilities = higher confidence
    if (variance < 0.001) confidence += 0.15;
    else if (variance < 0.005) confidence += 0.1;

    // Reasonable edge range (3-15%) = higher confidence
    if (edge >= 0.03 && edge <= 0.15) confidence += 0.1;
    // Very high edge might indicate stale odds
    if (edge > 0.30) confidence -= 0.2;

    return Math.max(0, Math.min(1, confidence));
  }

  calculateVariance(values) {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  }

  countSportsbooks(odds) {
    if (!odds) return 0;
    return new Set(odds.map(o => o.sportsbook)).size;
  }

  countMarkets(odds) {
    if (!odds) return 0;
    return new Set(odds.map(o => o.market_id || o.market)).size;
  }

  /**
   * Get odds for multiple SportMonks fixtures
   */
  async getOddsForFixtures(fixtures) {
    const results = {};

    for (const fixture of fixtures) {
      try {
        const oddsData = await this.getOddsForFixture(fixture);
        if (oddsData) {
          results[fixture.id] = oddsData;
        }
      } catch (error) {
        console.error(`[OpticOdds] Error getting odds for fixture ${fixture.id}:`, error.message);
      }
    }

    return results;
  }

  /**
   * Parse player shots odds from processed odds
   */
  parsePlayerShotsOdds(processedOdds) {
    const playerOdds = {};

    // Look for player_shots_on_target market
    const sotMarket = processedOdds.markets?.['player_shots_on_target'] || [];

    for (const odd of sotMarket) {
      const playerName = odd.selection || odd.name?.split(' Over')?.[0]?.split(' Under')?.[0];
      if (!playerName) continue;

      const key = playerName.toLowerCase().replace(/\s+/g, '_');
      if (!playerOdds[key]) {
        playerOdds[key] = {
          name: playerName,
          playerId: odd.playerId,
          markets: {}
        };
      }

      const line = odd.points;
      const isOver = odd.selectionLine === 'over' || odd.name?.toLowerCase().includes('over');

      if (line !== undefined) {
        const marketKey = isOver ? `over_${line}` : `under_${line}`;
        playerOdds[key].markets[marketKey] = {
          line,
          isOver,
          decimalOdds: odd.decimalOdds,
          americanOdds: odd.americanOdds,
          sportsbook: odd.sportsbook,
          impliedProbability: odd.impliedProbability
        };
      }
    }

    return playerOdds;
  }

  /**
   * Parse goalscorer odds from processed odds
   */
  parseGoalscorerOdds(processedOdds) {
    const playerOdds = {};

    // Look for anytime_goal_scorer and player_goals markets
    const scorerMarkets = [
      ...(processedOdds.markets?.['anytime_goal_scorer'] || []),
      ...(processedOdds.markets?.['player_goals'] || [])
    ];

    for (const odd of scorerMarkets) {
      const playerName = odd.selection || odd.name?.replace(/\s+Over.*/, '').replace(/\s+Under.*/, '');
      if (!playerName) continue;

      const key = playerName.toLowerCase().replace(/\s+/g, '_');
      if (!playerOdds[key]) {
        playerOdds[key] = {
          name: playerName,
          playerId: odd.playerId,
          markets: {}
        };
      }

      const line = odd.points || 0.5; // Default to 0.5 for anytime scorer
      const isOver = odd.selectionLine === 'over' || odd.name?.toLowerCase().includes('over') || odd.market?.includes('anytime');

      const marketKey = `over_${line}`;
      if (!playerOdds[key].markets[marketKey] || odd.decimalOdds > playerOdds[key].markets[marketKey].decimalOdds) {
        playerOdds[key].markets[marketKey] = {
          line,
          isOver: true,
          decimalOdds: odd.decimalOdds,
          americanOdds: odd.americanOdds,
          sportsbook: odd.sportsbook,
          impliedProbability: odd.impliedProbability
        };
      }
    }

    return playerOdds;
  }

  /**
   * Parse total goals odds from processed odds
   */
  parseTotalGoalsOdds(processedOdds) {
    const goalsOdds = {};

    const goalsMarkets = [
      ...(processedOdds.markets?.['total_goals'] || []),
      ...(processedOdds.markets?.['asian_total_goals'] || [])
    ];

    for (const odd of goalsMarkets) {
      const line = odd.points;
      if (line === undefined) continue;

      const isOver = odd.selectionLine === 'over' || odd.name?.toLowerCase().includes('over');
      const marketKey = isOver ? `over_${line}` : `under_${line}`;

      if (!goalsOdds[marketKey] || odd.decimalOdds > goalsOdds[marketKey].decimalOdds) {
        goalsOdds[marketKey] = {
          line,
          isOver,
          decimalOdds: odd.decimalOdds,
          americanOdds: odd.americanOdds,
          sportsbook: odd.sportsbook,
          impliedProbability: odd.impliedProbability
        };
      }
    }

    return goalsOdds;
  }

  /**
   * Parse BTTS odds from processed odds
   */
  parseBttsOdds(processedOdds) {
    const bttsOdds = {};

    const bttsMarket = processedOdds.markets?.['both_teams_to_score'] || [];

    for (const odd of bttsMarket) {
      const isYes = odd.selection?.toLowerCase() === 'yes' || odd.name?.toLowerCase().includes('yes');
      const marketKey = isYes ? 'yes' : 'no';

      if (!bttsOdds[marketKey] || odd.decimalOdds > bttsOdds[marketKey].decimalOdds) {
        bttsOdds[marketKey] = {
          isYes,
          decimalOdds: odd.decimalOdds,
          americanOdds: odd.americanOdds,
          sportsbook: odd.sportsbook,
          impliedProbability: odd.impliedProbability
        };
      }
    }

    return bttsOdds;
  }

  /**
   * Parse corner odds from processed odds
   */
  parseCornerOdds(processedOdds) {
    const cornerOdds = {};

    const cornerMarkets = [
      ...(processedOdds.markets?.['total_corners'] || []),
      ...(processedOdds.markets?.['team_total_corners'] || [])
    ];

    for (const odd of cornerMarkets) {
      const line = odd.points;
      if (line === undefined) continue;

      const isOver = odd.selectionLine === 'over' || odd.name?.toLowerCase().includes('over');
      const marketKey = isOver ? `over_${line}` : `under_${line}`;

      if (!cornerOdds[marketKey] || odd.decimalOdds > cornerOdds[marketKey].decimalOdds) {
        cornerOdds[marketKey] = {
          line,
          isOver,
          decimalOdds: odd.decimalOdds,
          americanOdds: odd.americanOdds,
          sportsbook: odd.sportsbook,
          impliedProbability: odd.impliedProbability
        };
      }
    }

    return cornerOdds;
  }

  /**
   * Parse offsides odds from processed odds
   * Returns separate objects for match total vs team total markets
   */
  parseOffsidesOdds(processedOdds) {
    const offsidesOdds = {
      matchTotal: {},    // Total offsides in match (both teams combined)
      homeTeam: {},      // Home team offsides only
      awayTeam: {},      // Away team offsides only
      firstHalf: {},     // 1st half total
    };

    // Process match total markets
    const matchTotalMarkets = processedOdds.markets?.['total_offsides'] || [];
    for (const odd of matchTotalMarkets) {
      const line = odd.points;
      if (line === undefined) continue;

      const isOver = odd.selectionLine === 'over' || odd.name?.toLowerCase().includes('over');
      const marketKey = isOver ? `over_${line}` : `under_${line}`;

      if (!offsidesOdds.matchTotal[marketKey] || odd.decimalOdds > offsidesOdds.matchTotal[marketKey].decimalOdds) {
        offsidesOdds.matchTotal[marketKey] = {
          line,
          isOver,
          decimalOdds: odd.decimalOdds,
          americanOdds: odd.americanOdds,
          sportsbook: odd.sportsbook,
          impliedProbability: odd.impliedProbability
        };
      }
    }

    // Process team total markets - need to determine home vs away from selection name
    const teamTotalMarkets = processedOdds.markets?.['team_total_offsides'] || [];
    for (const odd of teamTotalMarkets) {
      const line = odd.points;
      if (line === undefined) continue;

      const isOver = odd.selectionLine === 'over' || odd.name?.toLowerCase().includes('over');
      const marketKey = isOver ? `over_${line}` : `under_${line}`;

      // Determine if home or away based on selection/name
      const selectionLower = (odd.selection || odd.name || '').toLowerCase();
      const isHome = selectionLower.includes('home') || odd.teamId === 'home';
      const isAway = selectionLower.includes('away') || odd.teamId === 'away';

      const targetObj = isHome ? offsidesOdds.homeTeam :
                        isAway ? offsidesOdds.awayTeam :
                        offsidesOdds.homeTeam; // Default to home if unclear

      if (!targetObj[marketKey] || odd.decimalOdds > targetObj[marketKey].decimalOdds) {
        targetObj[marketKey] = {
          line,
          isOver,
          decimalOdds: odd.decimalOdds,
          americanOdds: odd.americanOdds,
          sportsbook: odd.sportsbook,
          impliedProbability: odd.impliedProbability
        };
      }
    }

    // Process 1st half markets
    const firstHalfMarkets = [
      ...(processedOdds.markets?.['1st_half_total_offsides'] || []),
      ...(processedOdds.markets?.['1st_half_team_total_offsides'] || [])
    ];
    for (const odd of firstHalfMarkets) {
      const line = odd.points;
      if (line === undefined) continue;

      const isOver = odd.selectionLine === 'over' || odd.name?.toLowerCase().includes('over');
      const marketKey = isOver ? `over_${line}` : `under_${line}`;

      if (!offsidesOdds.firstHalf[marketKey] || odd.decimalOdds > offsidesOdds.firstHalf[marketKey].decimalOdds) {
        offsidesOdds.firstHalf[marketKey] = {
          line,
          isOver,
          decimalOdds: odd.decimalOdds,
          americanOdds: odd.americanOdds,
          sportsbook: odd.sportsbook,
          impliedProbability: odd.impliedProbability
        };
      }
    }

    // For backward compatibility, also return flat structure with only match total
    // This prevents breaking existing code that expects the old format
    return {
      ...offsidesOdds.matchTotal,  // Flat structure for backward compat (match total only)
      _structured: offsidesOdds    // New structured format with all markets
    };
  }

  /**
   * Parse throw-ins odds from processed odds
   * Returns separate objects for match total vs team total markets
   */
  parseThrowInsOdds(processedOdds) {
    const throwInsOdds = {
      matchTotal: {},    // Total throw-ins in match (both teams combined)
      homeTeam: {},      // Home team throw-ins only
      awayTeam: {},      // Away team throw-ins only
      firstHalf: {},     // 1st half total
    };

    // Process match total markets
    const matchTotalMarkets = processedOdds.markets?.['total_throw_ins'] || [];
    for (const odd of matchTotalMarkets) {
      const line = odd.points;
      if (line === undefined) continue;

      const isOver = odd.selectionLine === 'over' || odd.name?.toLowerCase().includes('over');
      const marketKey = isOver ? `over_${line}` : `under_${line}`;

      if (!throwInsOdds.matchTotal[marketKey] || odd.decimalOdds > throwInsOdds.matchTotal[marketKey].decimalOdds) {
        throwInsOdds.matchTotal[marketKey] = {
          line,
          isOver,
          decimalOdds: odd.decimalOdds,
          americanOdds: odd.americanOdds,
          sportsbook: odd.sportsbook,
          impliedProbability: odd.impliedProbability
        };
      }
    }

    // Process team total markets
    const teamTotalMarkets = processedOdds.markets?.['team_total_throw_ins'] || [];
    for (const odd of teamTotalMarkets) {
      const line = odd.points;
      if (line === undefined) continue;

      const isOver = odd.selectionLine === 'over' || odd.name?.toLowerCase().includes('over');
      const marketKey = isOver ? `over_${line}` : `under_${line}`;

      // Determine if home or away based on selection/name
      const selectionLower = (odd.selection || odd.name || '').toLowerCase();
      const isHome = selectionLower.includes('home') || odd.teamId === 'home';
      const isAway = selectionLower.includes('away') || odd.teamId === 'away';

      const targetObj = isHome ? throwInsOdds.homeTeam :
                        isAway ? throwInsOdds.awayTeam :
                        throwInsOdds.homeTeam; // Default to home if unclear

      if (!targetObj[marketKey] || odd.decimalOdds > targetObj[marketKey].decimalOdds) {
        targetObj[marketKey] = {
          line,
          isOver,
          decimalOdds: odd.decimalOdds,
          americanOdds: odd.americanOdds,
          sportsbook: odd.sportsbook,
          impliedProbability: odd.impliedProbability
        };
      }
    }

    // Process 1st half markets
    const firstHalfMarkets = [
      ...(processedOdds.markets?.['1st_half_total_throw_ins'] || []),
      ...(processedOdds.markets?.['1st_half_team_total_throw_ins'] || [])
    ];
    for (const odd of firstHalfMarkets) {
      const line = odd.points;
      if (line === undefined) continue;

      const isOver = odd.selectionLine === 'over' || odd.name?.toLowerCase().includes('over');
      const marketKey = isOver ? `over_${line}` : `under_${line}`;

      if (!throwInsOdds.firstHalf[marketKey] || odd.decimalOdds > throwInsOdds.firstHalf[marketKey].decimalOdds) {
        throwInsOdds.firstHalf[marketKey] = {
          line,
          isOver,
          decimalOdds: odd.decimalOdds,
          americanOdds: odd.americanOdds,
          sportsbook: odd.sportsbook,
          impliedProbability: odd.impliedProbability
        };
      }
    }

    // For backward compatibility, also return flat structure with only match total
    return {
      ...throwInsOdds.matchTotal,  // Flat structure for backward compat (match total only)
      _structured: throwInsOdds    // New structured format with all markets
    };
  }

  /**
   * Get mapping statistics
   */
  getMappingStats() {
    return {
      totalLeagueMappings: Object.keys(LEAGUE_MAPPING).length,
      sharpBooks: sharpBooks,
      allSportsbooks: allSportsbooks.length,
      minEdge: minEdge
    };
  }

  /**
   * Generate benchmark data for a specific market - shows all bookmaker odds
   * @param {string} marketId - Market identifier (e.g., 'total_goals', 'both_teams_to_score')
   * @param {string} selection - Selection name/line (e.g., 'over_2.5', 'yes')
   * @param {object} processedOdds - The processed odds object from processOdds()
   * @returns {object} Benchmark data with all bookmaker odds sorted
   */
  generateBenchmark(marketId, selection, processedOdds) {
    if (!processedOdds?.markets?.[marketId]) {
      return null;
    }

    const marketOdds = processedOdds.markets[marketId];

    // Filter for this specific selection
    const selectionOdds = marketOdds.filter(odd => {
      const oddSelection = odd.selectionLine || odd.selection || '';
      const oddPoints = odd.points;

      // Match by selection line (over/under) and points
      if (selection.includes('over_') || selection.includes('under_')) {
        const [side, line] = selection.split('_');
        const matchesSide = oddSelection.toLowerCase() === side ||
                           odd.name?.toLowerCase().includes(side);
        const matchesLine = oddPoints == parseFloat(line);
        return matchesSide && matchesLine;
      }

      // Match by yes/no (BTTS)
      if (selection === 'yes' || selection === 'no') {
        return oddSelection.toLowerCase() === selection ||
               odd.name?.toLowerCase().includes(selection);
      }

      return oddSelection === selection;
    });

    if (selectionOdds.length === 0) {
      return null;
    }

    // Sort by best odds (highest decimal odds = best for bettor)
    const sorted = [...selectionOdds].sort((a, b) => b.decimalOdds - a.decimalOdds);

    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const avg = sorted.reduce((sum, o) => sum + o.decimalOdds, 0) / sorted.length;

    return {
      marketId,
      selection,
      bookmakerCount: sorted.length,
      allBookmakers: sorted.map(o => ({
        sportsbook: o.sportsbook,
        decimalOdds: o.decimalOdds,
        americanOdds: o.americanOdds,
        impliedProbability: o.impliedProbability,
        diffFromBest: ((best.decimalOdds - o.decimalOdds) / best.decimalOdds * 100).toFixed(2) + '%'
      })),
      best: {
        sportsbook: best.sportsbook,
        decimalOdds: best.decimalOdds,
        americanOdds: best.americanOdds,
        impliedProbability: best.impliedProbability
      },
      worst: {
        sportsbook: worst.sportsbook,
        decimalOdds: worst.decimalOdds,
        americanOdds: worst.americanOdds,
        impliedProbability: worst.impliedProbability
      },
      average: {
        decimalOdds: parseFloat(avg.toFixed(3)),
        impliedProbability: parseFloat((1 / avg).toFixed(4))
      },
      spread: parseFloat((best.decimalOdds - worst.decimalOdds).toFixed(3)),
      spreadPercent: parseFloat(((best.decimalOdds - worst.decimalOdds) / worst.decimalOdds * 100).toFixed(2))
    };
  }

  /**
   * Find arbitrage opportunity by checking opposite bet
   * @param {string} marketId - Market identifier
   * @param {string} selection - Current selection (e.g., 'over_2.5')
   * @param {number} currentProb - Our calculated probability for this bet
   * @param {object} processedOdds - The processed odds object
   * @returns {object|null} Arbitrage data if opportunity exists
   */
  findArbitrage(marketId, selection, currentProb, processedOdds) {
    if (!processedOdds?.markets?.[marketId]) {
      return null;
    }

    // Determine opposite selection
    let oppositeSelection;
    if (selection.startsWith('over_')) {
      oppositeSelection = selection.replace('over_', 'under_');
    } else if (selection.startsWith('under_')) {
      oppositeSelection = selection.replace('under_', 'over_');
    } else if (selection === 'yes') {
      oppositeSelection = 'no';
    } else if (selection === 'no') {
      oppositeSelection = 'yes';
    } else {
      return null; // Can't determine opposite
    }

    const oppositeBenchmark = this.generateBenchmark(marketId, oppositeSelection, processedOdds);
    if (!oppositeBenchmark) {
      return null;
    }

    const currentBenchmark = this.generateBenchmark(marketId, selection, processedOdds);
    if (!currentBenchmark) {
      return null;
    }

    // Get best odds for both sides
    const bestCurrent = currentBenchmark.best;
    const bestOpposite = oppositeBenchmark.best;

    // Calculate combined implied probability (for arbitrage)
    const combinedImplied = bestCurrent.impliedProbability + bestOpposite.impliedProbability;

    // Arbitrage exists if combined implied prob < 1 (100%)
    const hasArbitrage = combinedImplied < 1;

    // Calculate arbitrage percentage (profit margin if < 0, meaning arbitrage exists)
    const arbitrageMargin = (1 - combinedImplied) * 100;

    // Check if opposite bet is profitable
    // If our model says current has X% probability, opposite has (1-X)%
    // Compare to bookmaker's implied probability
    const oppositeModelProb = 1 - currentProb;
    const oppositeBookmakerProb = bestOpposite.impliedProbability;
    const oppositeEdge = (oppositeModelProb * bestOpposite.decimalOdds) - 1;
    const oppositeHasValue = oppositeEdge > 0;

    return {
      oppositeSelection,
      oppositeBest: bestOpposite,
      oppositeBenchmark,
      combinedImpliedProbability: parseFloat(combinedImplied.toFixed(4)),
      hasArbitrage,
      arbitrageMargin: parseFloat(arbitrageMargin.toFixed(2)),
      oppositeEdge: parseFloat((oppositeEdge * 100).toFixed(2)),
      oppositeHasValue,
      recommendation: hasArbitrage
        ? `ARBITRAGE: Bet both sides for guaranteed ${arbitrageMargin.toFixed(2)}% profit`
        : oppositeHasValue
          ? `Consider opposite: ${oppositeSelection} on ${bestOpposite.sportsbook} (${oppositeEdge.toFixed(1)}% edge)`
          : null
    };
  }

  /**
   * Generate complete market comparison with all bookmakers and arbitrage check
   */
  generateFullMarketAnalysis(marketId, line, probability, processedOdds) {
    const overSelection = `over_${line}`;
    const underSelection = `under_${line}`;

    const overBenchmark = this.generateBenchmark(marketId, overSelection, processedOdds);
    const underBenchmark = this.generateBenchmark(marketId, underSelection, processedOdds);

    if (!overBenchmark && !underBenchmark) {
      return null;
    }

    let arbitrage = null;
    if (overBenchmark && underBenchmark) {
      const combinedImplied = overBenchmark.best.impliedProbability + underBenchmark.best.impliedProbability;
      const hasArbitrage = combinedImplied < 1;

      arbitrage = {
        combinedImpliedProbability: parseFloat(combinedImplied.toFixed(4)),
        hasArbitrage,
        arbitrageMargin: parseFloat(((1 - combinedImplied) * 100).toFixed(2)),
        overBook: overBenchmark.best.sportsbook,
        underBook: underBenchmark.best.sportsbook,
        overOdds: overBenchmark.best.decimalOdds,
        underOdds: underBenchmark.best.decimalOdds
      };
    }

    return {
      marketId,
      line,
      over: overBenchmark,
      under: underBenchmark,
      arbitrage,
      modelProbability: probability,
      bestOverEdge: overBenchmark ? parseFloat(((probability * overBenchmark.best.decimalOdds - 1) * 100).toFixed(2)) : null,
      bestUnderEdge: underBenchmark ? parseFloat((((1 - probability) * underBenchmark.best.decimalOdds - 1) * 100).toFixed(2)) : null
    };
  }
}

// Export singleton instance
export const opticOddsService = new OpticOddsService();

// Also export as oddsApiService for backward compatibility
export const oddsApiService = opticOddsService;

export default opticOddsService;
