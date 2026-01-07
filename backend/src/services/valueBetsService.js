/**
 * Value Bets Service
 *
 * New approach:
 * 1. Scan market odds every 30 seconds
 * 2. Find outliers where playable bookmakers > sharp books
 * 3. Validate outliers with our stats-based probability (Poisson)
 * 4. Return only bets that pass both checks
 */

import { cache } from '../config/redis.js';
import sportmonks from './sportmonks.js';
import { opticOddsService } from './opticOdds.js';
import { marketScanner } from './marketScanner.js';
import { OPTIC_ODDS_CONFIG } from '../config/opticOddsConfig.js';

const { minEdge } = OPTIC_ODDS_CONFIG;

// Configuration
const CONFIG = {
  SCAN_INTERVAL: 30000, // 30 seconds
  CACHE_TTL: 60,        // 1 minute cache (scans run every 30 sec anyway)
  BATCH_SIZE: 3,        // Process 3 fixtures in parallel
  VALUE_BETS_DAYS: 2,   // Only scan next 2 days
};

class ValueBetsService {
  constructor() {
    this.lastScanTime = null;
    this.isScanning = false;
    this.scanResults = new Map(); // date -> results
  }

  /**
   * Get dates to scan (today and tomorrow)
   */
  getDateRange() {
    const dates = [];
    const today = new Date();

    for (let i = 0; i <= CONFIG.VALUE_BETS_DAYS; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }

    return dates;
  }

  /**
   * Main scan method - runs every 30 seconds
   * Scans all upcoming fixtures and finds value bets
   */
  async runScan() {
    if (this.isScanning) {
      console.log('[ValueBetsService] Scan already in progress, skipping...');
      return null;
    }

    this.isScanning = true;
    const startTime = Date.now();

    try {
      console.log('[ValueBetsService] Starting market scan...');

      const dates = this.getDateRange();
      const allValueBets = [];
      const scanMeta = {
        scannedAt: new Date().toISOString(),
        dates: dates,
        fixturesScanned: 0,
        outliersFound: 0,
        valueBetsConfirmed: 0,
        errors: []
      };

      for (const date of dates) {
        try {
          const result = await this.scanDate(date);
          allValueBets.push(...result.valueBets);
          scanMeta.fixturesScanned += result.fixturesScanned;
          scanMeta.outliersFound += result.outliersFound;
          scanMeta.valueBetsConfirmed += result.valueBetsConfirmed;
        } catch (error) {
          console.error(`[ValueBetsService] Error scanning ${date}:`, error.message);
          scanMeta.errors.push({ date, error: error.message });
        }
      }

      // Sort by confidence then edge
      allValueBets.sort((a, b) => {
        // Grade A first, then B, then C
        const gradeOrder = { 'A': 0, 'B': 1, 'C': 2, 'D': 3 };
        const gradeCompare = (gradeOrder[a.confidence] || 3) - (gradeOrder[b.confidence] || 3);
        if (gradeCompare !== 0) return gradeCompare;
        // Then by edge descending
        return (b.ourEdge || 0) - (a.ourEdge || 0);
      });

      scanMeta.duration = Date.now() - startTime;
      this.lastScanTime = new Date();

      // Cache the results
      const cacheKey = 'valuebets:scan:latest';
      await cache.set(cacheKey, {
        valueBets: allValueBets,
        meta: scanMeta
      }, CONFIG.CACHE_TTL);

      console.log(`[ValueBetsService] Scan complete: ${scanMeta.valueBetsConfirmed} value bets from ${scanMeta.outliersFound} outliers in ${scanMeta.duration}ms`);

      return { valueBets: allValueBets, meta: scanMeta };
    } catch (error) {
      console.error('[ValueBetsService] Scan failed:', error.message);
      throw error;
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Scan a single date for value bets
   */
  async scanDate(date) {
    console.log(`[ValueBetsService] Scanning ${date}...`);

    // Get fixtures for the date
    const fixtures = await sportmonks.getFixturesByDate(date);

    if (!fixtures || fixtures.length === 0) {
      return { valueBets: [], fixturesScanned: 0, outliersFound: 0, valueBetsConfirmed: 0 };
    }

    // Filter only upcoming matches (not finished or in play)
    const upcomingFixtures = fixtures.filter(f => {
      const state = f.state?.state || f.state?.short_name || 'NS';
      const finishedStates = ['FT', 'FT_PEN', 'AET', 'ABD', 'AWD', 'WO', 'LIVE', '1H', '2H', 'HT'];
      return !finishedStates.includes(state);
    });

    const allValueBets = [];
    let totalOutliers = 0;
    let totalConfirmed = 0;

    // Process fixtures in batches
    for (let i = 0; i < upcomingFixtures.length; i += CONFIG.BATCH_SIZE) {
      const batch = upcomingFixtures.slice(i, i + CONFIG.BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (fixture) => {
          try {
            return await this.scanFixture(fixture);
          } catch (err) {
            console.error(`[ValueBetsService] Error scanning fixture ${fixture.id}:`, err.message);
            return { valueBets: [], outliersFound: 0 };
          }
        })
      );

      // Collect results
      for (const result of batchResults) {
        allValueBets.push(...result.valueBets);
        totalOutliers += result.outliersFound;
        totalConfirmed += result.valueBets.filter(b => b.isValueBet).length;
      }
    }

    // Cache date-specific results
    const cacheKey = `valuebets:scan:${date}`;
    await cache.set(cacheKey, {
      valueBets: allValueBets,
      meta: { date, fixturesScanned: upcomingFixtures.length }
    }, CONFIG.CACHE_TTL);

    return {
      valueBets: allValueBets,
      fixturesScanned: upcomingFixtures.length,
      outliersFound: totalOutliers,
      valueBetsConfirmed: totalConfirmed
    };
  }

  /**
   * Scan a single fixture for value bets
   */
  async scanFixture(fixture) {
    const homeTeam = fixture.participants?.find(p => p.meta?.location === 'home');
    const awayTeam = fixture.participants?.find(p => p.meta?.location === 'away');

    if (!homeTeam || !awayTeam) {
      return { valueBets: [], outliersFound: 0 };
    }

    // Get odds from OpticOdds API
    const oddsData = await opticOddsService.getOddsForFixture(fixture);
    if (!oddsData?.odds) {
      return { valueBets: [], outliersFound: 0 };
    }

    // Use market scanner to find outliers and validate with stats
    const valueBets = await marketScanner.scanAndValidate(fixture, oddsData);

    // Enrich with fixture info
    const enrichedBets = valueBets.map(bet => this.enrichBetWithFixtureInfo(bet, fixture));

    return {
      valueBets: enrichedBets,
      outliersFound: valueBets.length
    };
  }

  /**
   * Enrich bet with fixture information for display
   */
  enrichBetWithFixtureInfo(bet, fixture) {
    const homeTeam = fixture.participants?.find(p => p.meta?.location === 'home');
    const awayTeam = fixture.participants?.find(p => p.meta?.location === 'away');

    // Determine bet type for filtering
    const betType = this.determineBetType(bet.marketId || bet.market);

    // Format selection name nicely
    const selectionName = this.formatSelectionName(bet);

    return {
      ...bet,
      // Fixture info
      fixtureId: fixture.id,
      fixtureName: `${homeTeam?.name} vs ${awayTeam?.name}`,
      homeTeam: {
        id: homeTeam?.id,
        name: homeTeam?.name,
        image: homeTeam?.image_path
      },
      awayTeam: {
        id: awayTeam?.id,
        name: awayTeam?.name,
        image: awayTeam?.image_path
      },
      league: fixture.league ? {
        id: fixture.league.id,
        name: fixture.league.name,
        image: fixture.league.image_path
      } : null,
      startingAt: fixture.starting_at,
      kickoffTime: new Date(fixture.starting_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      // Bet info for display
      betType,
      selectionName,
      // Odds info (formatted for frontend)
      bookmakerOdds: bet.playableBook?.decimalOdds,
      bookmaker: bet.playableBook?.sportsbook,
      americanOdds: bet.playableBook?.americanOdds,
      // Probability and edge
      probability: bet.ourProbability,
      fairOdds: bet.ourFairOdds,
      edge: bet.ourEdge,
      edgePercent: bet.ourEdgePercent,
      // Expected value
      ev: bet.expectedValuePer10,
      // Grading
      grade: bet.confidence,
      // Comparison data
      sharpOdds: bet.sharpBook?.decimalOdds,
      sharpBook: bet.sharpBook?.sportsbook,
      marketAvgOdds: bet.marketAverage,
      edgeVsSharp: bet.edgeVsSharp,
      edgeVsMarket: bet.edgeVsAverage,
      // Match state info for live matches
      matchState: fixture.state ? {
        id: fixture.state.id,
        state: fixture.state.state || fixture.state.short_name,
        name: fixture.state.name,
        shortName: fixture.state.short_name,
      } : null,
      scores: fixture.scores || null,
    };
  }

  /**
   * Determine bet type from market ID
   */
  determineBetType(market) {
    if (!market) return 'other';
    const m = market.toLowerCase();

    // Player props FIRST (more specific checks before general ones)
    if (m.includes('player_goal') || m.includes('anytime_goal_scorer') || m.includes('first_goal_scorer')) return 'goalscorer';
    if (m.includes('player_shot') || m.includes('shots_on_target')) return 'player_shots';
    if (m.includes('player_card') || m.includes('player_booking')) return 'player_cards';
    if (m.includes('player_corner')) return 'player_corners';
    if (m.includes('player_assist')) return 'player_assists';
    if (m.includes('player_')) return 'player_props'; // Catch-all for other player props

    // Team/match markets
    if (m.includes('total_goal') || m.includes('asian_total_goal')) return 'goals';
    if (m.includes('btts') || m.includes('both_teams_to_score')) return 'btts';
    if (m.includes('corner')) return 'corners';
    if (m.includes('card') || m.includes('booking')) return 'cards';
    if (m.includes('shot')) return 'team_shots';
    if (m.includes('offside')) return 'offsides';
    if (m.includes('throw')) return 'throw_ins';
    if (m.includes('handicap')) return 'handicap';
    if (m.includes('moneyline') || m.includes('1x2')) return 'match';

    return 'other';
  }

  /**
   * Format selection name for display
   */
  formatSelectionName(bet) {
    const market = bet.market || bet.marketId || '';
    const selection = bet.selectionLine || bet.selection || '';
    const line = bet.points;

    // Format based on market type
    if (market.toLowerCase().includes('goal')) {
      return `Goals ${selection} ${line}`;
    }
    if (market.toLowerCase().includes('btts') || market.toLowerCase().includes('both_teams')) {
      return `BTTS ${bet.selection || (selection === 'over' ? 'Yes' : 'No')}`;
    }
    if (market.toLowerCase().includes('corner')) {
      return `Corners ${selection} ${line}`;
    }
    if (market.toLowerCase().includes('card')) {
      return `Cards ${selection} ${line}`;
    }
    if (market.toLowerCase().includes('offside')) {
      return `Offsides ${selection} ${line}`;
    }
    if (market.toLowerCase().includes('throw')) {
      return `Throw-Ins ${selection} ${line}`;
    }
    if (market.toLowerCase().includes('shot')) {
      return `Shots ${selection} ${line}`;
    }

    // Default
    return bet.name || `${market} ${selection} ${line || ''}`.trim();
  }

  /**
   * Get cached value bets (for API response)
   */
  async getValueBets(options = {}) {
    const {
      date,
      minEdge: minEdgePercent = 3,
      betTypes,
      grades,
      bookmakers,
      leagues
    } = options;

    // Try to get from cache first
    const cacheKey = date ? `valuebets:scan:${date}` : 'valuebets:scan:latest';
    const cached = await cache.get(cacheKey);

    let valueBets = cached?.valueBets || [];
    let meta = cached?.meta || {};

    // If no cache or cache expired, run a scan
    if (!cached && !this.isScanning) {
      const scanResult = await this.runScan();
      valueBets = scanResult?.valueBets || [];
      meta = scanResult?.meta || {};
    }

    // Apply filters
    const minEdgeDecimal = parseFloat(minEdgePercent) / 100;
    const allowedTypes = betTypes ? betTypes.split(',').map(t => t.trim().toLowerCase()) : null;
    const allowedGrades = grades ? grades.split(',').map(g => g.trim().toUpperCase()) : null;
    const allowedBooks = bookmakers ? bookmakers.split(',').map(b => b.trim().toLowerCase()) : null;
    const allowedLeagues = leagues ? leagues.split(',').map(l => parseInt(l)) : null;

    const filteredBets = valueBets.filter(bet => {
      // Edge filter
      if (bet.ourEdge !== undefined && bet.ourEdge < minEdgeDecimal) return false;

      // Bet type filter
      if (allowedTypes && !allowedTypes.includes(bet.betType)) return false;

      // Grade filter
      if (allowedGrades && !allowedGrades.includes(bet.confidence)) return false;

      // Bookmaker filter
      if (allowedBooks && !allowedBooks.includes(bet.bookmaker?.toLowerCase())) return false;

      // League filter
      if (allowedLeagues && !allowedLeagues.includes(bet.league?.id)) return false;

      // Date filter - handle both ISO format (T separator) and space-separated dates
      if (date) {
        const startingAt = bet.startingAt || '';
        // Extract just the date portion (handles "2026-01-08T17:30:00" and "2026-01-08 17:30:00")
        const betDate = startingAt.includes('T')
          ? startingAt.split('T')[0]
          : startingAt.split(' ')[0];
        if (betDate !== date) return false;
      }

      return true;
    });

    return {
      valueBets: filteredBets,
      meta: {
        ...meta,
        filteredCount: filteredBets.length,
        totalCount: valueBets.length,
        filters: { minEdge: minEdgePercent, betTypes, grades, bookmakers, leagues }
      }
    };
  }

  /**
   * Get scan status
   */
  getStatus() {
    return {
      isScanning: this.isScanning,
      lastScanTime: this.lastScanTime?.toISOString() || null,
      scanInterval: CONFIG.SCAN_INTERVAL
    };
  }
}

// Export singleton instance
export const valueBetsService = new ValueBetsService();
export default valueBetsService;
