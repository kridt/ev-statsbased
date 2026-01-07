/**
 * Odds API Service
 *
 * Integrates with Odds API (https://api2.odds-api.io) to fetch bookmaker odds.
 * Uses hybrid matching approach:
 * 1. Event-based matching (primary) - Match by date + team names
 * 2. JSON mapping fallback - Pre-defined team ID mappings
 *
 * API Documentation: https://api2.odds-api.io/v3/docs/index.html
 */

import axios from 'axios';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cache } from '../config/redis.js';
import {
  ODDS_API_CONFIG,
  LEAGUE_MAPPING,
  getOddsApiLeague,
} from '../config/oddsApiConfig.js';

// Load team mapping JSON
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const teamMappingPath = join(__dirname, '../config/teamMapping.json');
const teamMappingData = JSON.parse(readFileSync(teamMappingPath, 'utf-8'));

const { baseUrl, apiKey, cacheTTL, defaultBookmakers } = ODDS_API_CONFIG;

// Create axios instance for Odds API
const oddsApi = axios.create({
  baseURL: baseUrl,
  params: {
    apiKey: apiKey,
  },
});

// Request interceptor for logging
oddsApi.interceptors.request.use((config) => {
  console.log(`[OddsAPI] ${config.method?.toUpperCase()} ${config.url}`);
  return config;
});

// Response interceptor for error handling
oddsApi.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('[OddsAPI Error]', error.response?.data || error.message);
    throw error;
  }
);

/**
 * Normalize team name for comparison
 * Removes common suffixes/prefixes and standardizes format
 */
function normalizeTeamName(name) {
  if (!name) return '';

  let normalized = name
    .toLowerCase()
    .trim()
    // Remove common suffixes
    .replace(/\s+(fc|afc|sc|cf|ssc|ac|as|us|ss|fk|sk|bk|if|ik)$/i, '')
    // Remove common prefixes
    .replace(/^(fc|afc|sc|cf|ssc|ac|as|us|ss|fk|sk|bk|if|ik)\s+/i, '')
    // Standardize common variations
    .replace(/united/gi, 'utd')
    .replace(/saint/gi, 'st')
    .replace(/city/gi, 'city')
    .replace(/athletic/gi, 'ath')
    .replace(/sporting/gi, 'sport')
    // Remove special characters
    .replace(/[^a-z0-9\s]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}

/**
 * Calculate similarity score between two team names
 * Returns a score from 0 to 1
 */
function calculateNameSimilarity(name1, name2) {
  const n1 = normalizeTeamName(name1);
  const n2 = normalizeTeamName(name2);

  if (n1 === n2) return 1.0;

  // Check if one contains the other
  if (n1.includes(n2) || n2.includes(n1)) {
    return 0.9;
  }

  // Levenshtein distance based similarity
  const maxLen = Math.max(n1.length, n2.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(n1, n2);
  return 1 - distance / maxLen;
}

/**
 * Levenshtein distance calculation
 */
function levenshteinDistance(s1, s2) {
  const m = s1.length;
  const n = s2.length;
  const dp = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

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

class OddsApiService {
  constructor() {
    this.teamMapping = teamMappingData.teams;
  }

  /**
   * Helper for cached requests
   */
  async cachedRequest(cacheKey, ttl, requestFn) {
    const cached = await cache.get(cacheKey);
    if (cached) {
      console.log(`[OddsAPI Cache HIT] ${cacheKey}`);
      return cached;
    }

    console.log(`[OddsAPI Cache MISS] ${cacheKey}`);
    const data = await requestFn();
    await cache.set(cacheKey, data, ttl);
    return data;
  }

  /**
   * Get available sports
   */
  async getSports() {
    return this.cachedRequest('oddsapi:sports', cacheTTL.leagues, async () => {
      const response = await oddsApi.get('/sports');
      return response.data;
    });
  }

  /**
   * Get leagues for football
   */
  async getLeagues() {
    return this.cachedRequest('oddsapi:leagues:football', cacheTTL.leagues, async () => {
      const response = await oddsApi.get('/leagues', {
        params: { sport: 'football' },
      });
      return response.data;
    });
  }

  /**
   * Get events for a league
   */
  async getEvents(leagueSlug, options = {}) {
    const { status = 'pending' } = options;
    const cacheKey = `oddsapi:events:${leagueSlug}:${status}`;

    return this.cachedRequest(cacheKey, cacheTTL.events, async () => {
      const response = await oddsApi.get('/events', {
        params: {
          sport: 'football',
          league: leagueSlug,
          status,
        },
      });
      return response.data || [];
    });
  }

  /**
   * Get selected bookmakers
   */
  async getSelectedBookmakers() {
    const response = await oddsApi.get('/bookmakers/selected');
    return response.data;
  }

  /**
   * Get odds for a specific event
   * @param {string|number} eventId - Odds API event ID
   * @param {string} bookmakers - Comma-separated bookmaker names (optional, uses default)
   */
  async getEventOdds(eventId, bookmakers = defaultBookmakers) {
    const cacheKey = `oddsapi:odds:${eventId}`;

    return this.cachedRequest(cacheKey, cacheTTL.odds, async () => {
      try {
        const response = await oddsApi.get('/odds', {
          params: {
            eventId,
            bookmakers,
          },
        });
        return response.data;
      } catch (error) {
        if (error.response?.data?.error === 'Missing bookmakers') {
          console.warn('[OddsAPI] No odds available for this event');
          return null;
        }
        throw error;
      }
    });
  }

  /**
   * Get odds for multiple events
   * @param {Array} eventIds - Array of Odds API event IDs
   * @param {string} bookmakers - Comma-separated bookmaker names (optional)
   */
  async getMultiEventOdds(eventIds, bookmakers = defaultBookmakers) {
    if (!eventIds || eventIds.length === 0) return [];

    // API allows max 10 events per request
    const chunks = [];
    for (let i = 0; i < eventIds.length; i += 10) {
      chunks.push(eventIds.slice(i, i + 10));
    }

    const results = [];
    for (const chunk of chunks) {
      try {
        const response = await oddsApi.get('/odds/multi', {
          params: {
            eventIds: chunk.join(','),
            bookmakers,
          },
        });
        if (response.data) {
          results.push(...(Array.isArray(response.data) ? response.data : [response.data]));
        }
      } catch (error) {
        console.error('[OddsAPI] Multi odds error:', error.message);
      }
    }

    return results;
  }

  /**
   * Find Odds API team ID from SportMonks team ID
   * Uses JSON mapping as primary source
   */
  getOddsApiTeamId(sportmonksTeamId) {
    const mapping = this.teamMapping[sportmonksTeamId.toString()];
    return mapping?.oddsApiId || null;
  }

  /**
   * Find matching Odds API event for a SportMonks fixture
   * Uses hybrid approach: event-based matching with JSON fallback
   *
   * @param {Object} fixture - SportMonks fixture object
   * @returns {Object|null} Matching Odds API event or null
   */
  async findMatchingEvent(fixture) {
    if (!fixture) return null;

    const leagueId = fixture.league_id || fixture.league?.id;
    const oddsApiLeague = getOddsApiLeague(leagueId);

    if (!oddsApiLeague) {
      console.log(`[OddsAPI] No league mapping for SportMonks league ${leagueId}`);
      return null;
    }

    // Get events from Odds API for this league
    const events = await this.getEvents(oddsApiLeague);

    if (!events || events.length === 0) {
      console.log(`[OddsAPI] No events found for league ${oddsApiLeague}`);
      return null;
    }

    // Extract team info from fixture
    const homeTeam = fixture.participants?.find((p) => p.meta?.location === 'home');
    const awayTeam = fixture.participants?.find((p) => p.meta?.location === 'away');

    if (!homeTeam || !awayTeam) {
      console.log('[OddsAPI] Missing team info in fixture');
      return null;
    }

    const fixtureDate = new Date(fixture.starting_at);

    // Try to find matching event
    let bestMatch = null;
    let bestScore = 0;

    for (const event of events) {
      const eventDate = new Date(event.date);

      // Check if dates are within 24 hours (to account for timezone differences)
      const dateDiff = Math.abs(eventDate - fixtureDate);
      const hoursApart = dateDiff / (1000 * 60 * 60);

      if (hoursApart > 24) continue;

      // Calculate team name similarity scores
      const homeScore = calculateNameSimilarity(homeTeam.name, event.home);
      const awayScore = calculateNameSimilarity(awayTeam.name, event.away);

      // Combined score (average of both teams)
      const combinedScore = (homeScore + awayScore) / 2;

      // Bonus for exact date match
      const dateBonus = hoursApart < 2 ? 0.1 : 0;
      const totalScore = combinedScore + dateBonus;

      if (totalScore > bestScore && combinedScore > 0.6) {
        bestScore = totalScore;
        bestMatch = {
          ...event,
          matchScore: combinedScore,
          homeScore,
          awayScore,
        };
      }
    }

    if (bestMatch) {
      console.log(
        `[OddsAPI] Matched: ${homeTeam.name} vs ${awayTeam.name} -> ${bestMatch.home} vs ${bestMatch.away} (score: ${bestMatch.matchScore.toFixed(2)})`
      );
    } else {
      console.log(`[OddsAPI] No match found for: ${homeTeam.name} vs ${awayTeam.name}`);
    }

    return bestMatch;
  }

  /**
   * Get odds for a SportMonks fixture
   * Main method to use from routes
   *
   * @param {Object} fixture - SportMonks fixture object
   * @returns {Object|null} Odds data or null
   */
  async getOddsForFixture(fixture) {
    const matchingEvent = await this.findMatchingEvent(fixture);

    if (!matchingEvent) {
      return null;
    }

    // Get odds with timestamp tracking
    const { odds, fetchedAt, isCached } = await this.getEventOddsWithTimestamp(matchingEvent.id);

    return {
      event: {
        id: matchingEvent.id,
        home: matchingEvent.home,
        away: matchingEvent.away,
        homeId: matchingEvent.homeId,
        awayId: matchingEvent.awayId,
        date: matchingEvent.date,
        status: matchingEvent.status,
        matchScore: matchingEvent.matchScore,
      },
      odds: odds,
      mapping: {
        sportmonksFixtureId: fixture.id,
        oddsApiEventId: matchingEvent.id,
        league: matchingEvent.league,
      },
      // Timestamp info for "last updated" display
      meta: {
        fetchedAt: fetchedAt,
        isCached: isCached,
        cacheTTL: cacheTTL.odds,
      },
    };
  }

  /**
   * Get odds for a specific event with timestamp tracking
   * @param {string|number} eventId - Odds API event ID
   * @param {string} bookmakers - Comma-separated bookmaker names (optional)
   * @returns {Object} { odds, fetchedAt, isCached }
   */
  async getEventOddsWithTimestamp(eventId, bookmakers = defaultBookmakers) {
    const cacheKey = `oddsapi:odds:${eventId}`;
    const timestampKey = `oddsapi:odds:timestamp:${eventId}`;

    // Check cache
    const cached = await cache.get(cacheKey);
    const cachedTimestamp = await cache.get(timestampKey);

    if (cached && cachedTimestamp) {
      console.log(`[OddsAPI Cache HIT] ${cacheKey}`);
      return {
        odds: cached,
        fetchedAt: cachedTimestamp,
        isCached: true,
      };
    }

    console.log(`[OddsAPI Cache MISS] ${cacheKey}`);

    // Fetch fresh data
    const now = new Date().toISOString();
    try {
      const response = await oddsApi.get('/odds', {
        params: {
          eventId,
          bookmakers,
        },
      });

      const odds = response.data;

      // Store odds and timestamp
      await cache.set(cacheKey, odds, cacheTTL.odds);
      await cache.set(timestampKey, now, cacheTTL.odds);

      return {
        odds: odds,
        fetchedAt: now,
        isCached: false,
      };
    } catch (error) {
      if (error.response?.data?.error === 'Missing bookmakers') {
        console.warn('[OddsAPI] No odds available for this event');
        return { odds: null, fetchedAt: now, isCached: false };
      }
      throw error;
    }
  }

  /**
   * Get odds for multiple SportMonks fixtures
   *
   * @param {Array} fixtures - Array of SportMonks fixtures
   * @returns {Object} Map of fixture ID to odds data
   */
  async getOddsForFixtures(fixtures) {
    const results = {};
    const matchedEvents = [];

    // First, find all matching events
    for (const fixture of fixtures) {
      const matchingEvent = await this.findMatchingEvent(fixture);
      if (matchingEvent) {
        matchedEvents.push({
          fixtureId: fixture.id,
          event: matchingEvent,
        });
      }
    }

    // Get odds for all matched events
    if (matchedEvents.length > 0) {
      const eventIds = matchedEvents.map((m) => m.event.id);
      const allOdds = await this.getMultiEventOdds(eventIds);

      // Map odds back to fixtures
      for (const match of matchedEvents) {
        const eventOdds = allOdds.find((o) => o?.eventId === match.event.id);
        results[match.fixtureId] = {
          event: match.event,
          odds: eventOdds || null,
        };
      }
    }

    return results;
  }

  /**
   * Add or update team mapping
   * Used to build the mapping dynamically
   */
  addTeamMapping(sportmonksTeamId, oddsApiTeamId, sportmonksName, oddsApiName) {
    this.teamMapping[sportmonksTeamId.toString()] = {
      oddsApiId: oddsApiTeamId,
      sportmonksName,
      oddsApiName,
      aliases: [sportmonksName, oddsApiName],
    };

    console.log(`[OddsAPI] Added team mapping: ${sportmonksName} (${sportmonksTeamId}) -> ${oddsApiName} (${oddsApiTeamId})`);
  }

  /**
   * Get current team mapping stats
   */
  getMappingStats() {
    return {
      totalMappings: Object.keys(this.teamMapping).length,
      leagues: Object.keys(LEAGUE_MAPPING).length,
    };
  }
}

// Export singleton instance
export const oddsApiService = new OddsApiService();

export default oddsApiService;
