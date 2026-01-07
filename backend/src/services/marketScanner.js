/**
 * Market Scanner Service
 *
 * Scans odds markets to find outliers where playable bookmakers
 * offer better odds than sharp books (Pinnacle, OpticOdds AI).
 *
 * Workflow:
 * 1. Fetch odds from ALL bookmakers for all markets
 * 2. Find the best sharp book odds for each selection
 * 3. Flag playable bookmakers offering odds ABOVE sharp books
 * 4. These outliers are potential value bets to validate with stats
 */

import { opticOddsService } from './opticOdds.js';
import { probabilityCalculator } from './probabilityCalculator.js';
import { OPTIC_ODDS_CONFIG } from '../config/opticOddsConfig.js';

const { sharpBooks, playableBooks, minEdge } = OPTIC_ODDS_CONFIG;

// Markets to scan - ONLY these markets will be processed
// Other markets from the API will be ignored
const MARKETS_TO_SCAN = [
  'total_goals',
  'asian_total_goals',
  'both_teams_to_score',
  'total_corners',
  'team_total_corners',
  'total_cards',
  'total_card_points',
  'total_offsides',
  'team_total_offsides',
  'total_throw_ins',
  'team_total_throw_ins',
  'moneyline',
  'asian_handicap',
  // Player props
  'player_shots_on_target',
  'player_goals',
  'anytime_goal_scorer',
];

// Markets to explicitly exclude - these have data quality issues from OpticOdds
// (lines that don't actually exist at bookmakers)
const EXCLUDED_MARKETS = [
  'total_shots',         // Match shots - lines don't match actual bookmaker offerings
  'team_total_shots',    // Team shots - same issue
  'total_fouls',         // Often synthetic/interpolated
  'team_total_fouls',
];

class MarketScanner {
  constructor() {
    this.lastScanTime = null;
    this.scanResults = new Map(); // fixtureId -> scan results
  }

  /**
   * Scan a fixture's odds for outliers
   * @param {object} fixture - SportMonks fixture
   * @param {object} oddsData - Processed odds from OpticOdds
   * @returns {Array} List of outlier bets
   */
  async scanFixtureForOutliers(fixture, oddsData) {
    if (!oddsData || !oddsData.odds) {
      return [];
    }

    const outliers = [];
    const processedOdds = oddsData.odds;

    // Group all odds by market+selection+line
    const marketSelections = this.groupOddsBySelection(processedOdds);

    // For each selection, check if any playable book beats sharp books
    for (const [selectionKey, bookOdds] of Object.entries(marketSelections)) {
      const outlier = this.findOutlierForSelection(selectionKey, bookOdds, fixture);
      if (outlier) {
        outliers.push(outlier);
      }
    }

    return outliers;
  }

  /**
   * Check if a market should be processed
   */
  isMarketAllowed(marketId) {
    if (!marketId) return false;
    const normalizedMarket = marketId.toLowerCase();

    // First check if explicitly excluded (data quality issues)
    if (EXCLUDED_MARKETS.some(m => normalizedMarket.includes(m))) {
      return false;
    }

    // Then check if it's in our allowed list
    return MARKETS_TO_SCAN.some(m => normalizedMarket.includes(m));
  }

  /**
   * Group odds by market+selection+line
   */
  groupOddsBySelection(processedOdds) {
    const grouped = {};

    // Iterate through all bookmakers
    for (const [sportsbook, odds] of Object.entries(processedOdds.bookmakers || {})) {
      for (const odd of odds) {
        // Skip markets not in our allowed list or explicitly excluded
        const marketId = odd.marketId || odd.market?.toLowerCase().replace(/\s+/g, '_');
        if (!this.isMarketAllowed(marketId)) {
          continue;
        }

        // Create unique key for this selection
        const selectionKey = this.createSelectionKey(odd);
        if (!selectionKey) continue;

        if (!grouped[selectionKey]) {
          grouped[selectionKey] = {
            market: odd.market,
            marketId: odd.marketId,
            name: odd.name,
            selection: odd.selection,
            selectionLine: odd.selectionLine,
            points: odd.points,
            playerId: odd.playerId,
            odds: []
          };
        }

        grouped[selectionKey].odds.push({
          sportsbook: sportsbook.toLowerCase(),
          decimalOdds: odd.decimalOdds,
          americanOdds: odd.americanOdds,
          impliedProbability: odd.impliedProbability,
          isSharp: sharpBooks.includes(sportsbook.toLowerCase()),
          isPlayable: playableBooks.includes(sportsbook.toLowerCase())
        });
      }
    }

    return grouped;
  }

  /**
   * Create a unique key for a selection
   */
  createSelectionKey(odd) {
    if (!odd.market && !odd.marketId) return null;

    const market = odd.marketId || odd.market?.toLowerCase().replace(/\s+/g, '_');
    const selection = odd.selectionLine || odd.selection || '';
    const points = odd.points !== undefined ? odd.points : '';
    const playerId = odd.playerId || '';

    return `${market}:${selection}:${points}:${playerId}`;
  }

  /**
   * Find outlier for a specific selection
   * Returns outlier if a playable book offers better odds than ALL sharp books
   */
  findOutlierForSelection(selectionKey, selectionData, fixture) {
    const { odds, market, marketId, name, selection, selectionLine, points, playerId } = selectionData;

    if (odds.length < 2) return null; // Need at least 2 bookmakers to compare

    // Filter out extreme odds (likely "max payout" joke lines)
    const validOdds = odds.filter(o => o.decimalOdds >= 1.1 && o.decimalOdds <= 100);
    if (validOdds.length < 2) return null;

    // Find best sharp book odds (from valid odds only)
    const sharpOdds = validOdds.filter(o => o.isSharp);
    if (sharpOdds.length === 0) {
      // No sharp book reference - use market average as fallback
      return this.findOutlierVsAverage(selectionKey, { ...selectionData, odds: validOdds }, fixture);
    }

    const bestSharpOdds = Math.max(...sharpOdds.map(o => o.decimalOdds));
    const bestSharpBook = sharpOdds.find(o => o.decimalOdds === bestSharpOdds);

    // Find playable books that beat the best sharp odds (from valid odds only)
    const playableOdds = validOdds.filter(o => o.isPlayable && o.decimalOdds > bestSharpOdds);

    if (playableOdds.length === 0) return null;

    // Get the best playable outlier
    const bestPlayable = playableOdds.reduce((best, curr) =>
      curr.decimalOdds > best.decimalOdds ? curr : best
    );

    // Calculate how much better the playable is vs sharp
    const edgeVsSharp = (bestPlayable.decimalOdds - bestSharpOdds) / bestSharpOdds;

    // Calculate market average (valid bookmakers only)
    const avgOdds = validOdds.reduce((sum, o) => sum + o.decimalOdds, 0) / validOdds.length;
    const edgeVsAverage = (bestPlayable.decimalOdds - avgOdds) / avgOdds;

    return {
      selectionKey,
      market,
      marketId,
      name,
      selection,
      selectionLine,
      points,
      playerId,
      fixture: {
        id: fixture.id,
        homeTeam: fixture.participants?.find(p => p.meta?.location === 'home'),
        awayTeam: fixture.participants?.find(p => p.meta?.location === 'away'),
        startingAt: fixture.starting_at
      },
      sharpBook: {
        sportsbook: bestSharpBook?.sportsbook,
        decimalOdds: bestSharpOdds,
        impliedProbability: 1 / bestSharpOdds
      },
      playableBook: {
        sportsbook: bestPlayable.sportsbook,
        decimalOdds: bestPlayable.decimalOdds,
        americanOdds: bestPlayable.americanOdds,
        impliedProbability: bestPlayable.impliedProbability
      },
      edgeVsSharp: edgeVsSharp,
      edgeVsSharpPercent: (edgeVsSharp * 100).toFixed(2) + '%',
      edgeVsAverage: edgeVsAverage,
      edgeVsAveragePercent: (edgeVsAverage * 100).toFixed(2) + '%',
      marketAverage: avgOdds,
      allBookmakers: validOdds.map(o => ({
        sportsbook: o.sportsbook,
        decimalOdds: o.decimalOdds,
        isSharp: o.isSharp,
        isPlayable: o.isPlayable
      })).sort((a, b) => b.decimalOdds - a.decimalOdds),
      // Status flags
      isOutlier: true,
      needsStatsValidation: true
    };
  }

  /**
   * Fallback: Find outlier vs market average when no sharp book available
   * Note: odds are already filtered for extreme values when called from findOutlierForSelection
   */
  findOutlierVsAverage(selectionKey, selectionData, fixture) {
    const { odds, market, marketId, name, selection, selectionLine, points, playerId } = selectionData;

    // Filter extreme odds if not already filtered
    const validOdds = odds.filter(o => o.decimalOdds >= 1.1 && o.decimalOdds <= 100);
    if (validOdds.length < 2) return null;

    // Calculate market average
    const avgOdds = validOdds.reduce((sum, o) => sum + o.decimalOdds, 0) / validOdds.length;

    // Find playable books significantly above average (>3%)
    const threshold = avgOdds * 1.03; // 3% above average
    const playableOdds = validOdds.filter(o => o.isPlayable && o.decimalOdds > threshold);

    if (playableOdds.length === 0) return null;

    // Get the best playable outlier
    const bestPlayable = playableOdds.reduce((best, curr) =>
      curr.decimalOdds > best.decimalOdds ? curr : best
    );

    const edgeVsAverage = (bestPlayable.decimalOdds - avgOdds) / avgOdds;

    return {
      selectionKey,
      market,
      marketId,
      name,
      selection,
      selectionLine,
      points,
      playerId,
      fixture: {
        id: fixture.id,
        homeTeam: fixture.participants?.find(p => p.meta?.location === 'home'),
        awayTeam: fixture.participants?.find(p => p.meta?.location === 'away'),
        startingAt: fixture.starting_at
      },
      sharpBook: null, // No sharp book available
      playableBook: {
        sportsbook: bestPlayable.sportsbook,
        decimalOdds: bestPlayable.decimalOdds,
        americanOdds: bestPlayable.americanOdds,
        impliedProbability: bestPlayable.impliedProbability
      },
      edgeVsSharp: null,
      edgeVsSharpPercent: null,
      edgeVsAverage: edgeVsAverage,
      edgeVsAveragePercent: (edgeVsAverage * 100).toFixed(2) + '%',
      marketAverage: avgOdds,
      allBookmakers: validOdds.map(o => ({
        sportsbook: o.sportsbook,
        decimalOdds: o.decimalOdds,
        isSharp: o.isSharp,
        isPlayable: o.isPlayable
      })).sort((a, b) => b.decimalOdds - a.decimalOdds),
      isOutlier: true,
      needsStatsValidation: true,
      noSharpReference: true
    };
  }

  /**
   * Validate outlier with statistical probability
   * @param {object} outlier - Outlier bet from scan
   * @param {object} fixtureProbabilities - Pre-calculated probabilities
   * @returns {object|null} Validated value bet or null if not +EV
   */
  validateOutlierWithStats(outlier, fixtureProbabilities) {
    if (!fixtureProbabilities) return null;

    // Determine if this is over or under
    const isOver = outlier.selectionLine === 'over' ||
                   outlier.name?.toLowerCase().includes('over') ||
                   outlier.selection?.toLowerCase() === 'yes';

    // Get our calculated probability
    const ourProbability = fixtureProbabilities.getProbability(
      outlier.marketId || outlier.market,
      outlier.points,
      isOver,
      { selection: outlier.selection, teamOnly: this.extractTeamFromSelection(outlier) }
    );

    if (ourProbability === null) {
      // Market not supported for probability calculation
      return {
        ...outlier,
        statsValidated: false,
        reason: 'Market not supported for probability calculation'
      };
    }

    // Calculate edge using our probability
    const bookmakerOdds = outlier.playableBook.decimalOdds;
    const ourEdge = probabilityCalculator.calculateEdge(ourProbability, bookmakerOdds);
    const ourFairOdds = probabilityCalculator.calculateFairOdds(ourProbability);
    const expectedValue = probabilityCalculator.calculateExpectedValue(ourProbability, bookmakerOdds, 10);

    // Check if edge meets minimum threshold (3%)
    const isValueBet = ourEdge >= minEdge;

    return {
      ...outlier,
      statsValidated: true,
      ourProbability: ourProbability,
      ourProbabilityPercent: (ourProbability * 100).toFixed(1) + '%',
      ourFairOdds: parseFloat(ourFairOdds?.toFixed(2)),
      ourEdge: ourEdge,
      ourEdgePercent: (ourEdge * 100).toFixed(2) + '%',
      expectedValuePer10: parseFloat(expectedValue?.toFixed(2)),
      isValueBet: isValueBet,
      // Confidence based on both outlier status AND stats validation
      confidence: this.calculateConfidence(outlier, ourEdge, ourProbability)
    };
  }

  /**
   * Extract team (home/away) from selection name if applicable
   */
  extractTeamFromSelection(outlier) {
    const selectionLower = (outlier.selection || outlier.name || '').toLowerCase();
    if (selectionLower.includes('home')) return 'home';
    if (selectionLower.includes('away')) return 'away';
    return null;
  }

  /**
   * Calculate confidence grade for a value bet
   * A = Strong (outlier + stats confirm + high edge)
   * B = Good (outlier + stats confirm)
   * C = Fair (only one signal)
   */
  calculateConfidence(outlier, ourEdge, ourProbability) {
    let score = 0;

    // Factor 1: Is outlier vs sharp books?
    if (outlier.edgeVsSharp !== null && outlier.edgeVsSharp > 0) {
      score += 2;
    } else if (outlier.edgeVsAverage > 0.03) {
      score += 1;
    }

    // Factor 2: Our stats say it's +EV
    if (ourEdge >= 0.07) {
      score += 3; // Strong edge
    } else if (ourEdge >= 0.05) {
      score += 2; // Good edge
    } else if (ourEdge >= 0.03) {
      score += 1; // Minimum edge
    }

    // Factor 3: Probability is reasonable (not extreme)
    if (ourProbability >= 0.35 && ourProbability <= 0.75) {
      score += 1; // Reasonable probability range
    }

    // Factor 4: Multiple bookmakers available
    if (outlier.allBookmakers?.length >= 4) {
      score += 1;
    }

    // Convert score to grade
    if (score >= 6) return 'A';
    if (score >= 4) return 'B';
    if (score >= 2) return 'C';
    return 'D';
  }

  /**
   * Full scan: Get outliers and validate with stats
   * This is the main method to call from the job scheduler
   */
  async scanAndValidate(fixture, oddsData) {
    // Step 1: Scan for outliers
    const outliers = await this.scanFixtureForOutliers(fixture, oddsData);

    if (outliers.length === 0) {
      return [];
    }

    // Step 2: Get team IDs for probability calculation
    const homeTeam = fixture.participants?.find(p => p.meta?.location === 'home');
    const awayTeam = fixture.participants?.find(p => p.meta?.location === 'away');

    if (!homeTeam?.id || !awayTeam?.id) {
      console.log(`[MarketScanner] Missing team IDs for fixture ${fixture.id}`);
      return outliers.map(o => ({ ...o, statsValidated: false, reason: 'Missing team data' }));
    }

    // Step 3: Calculate fixture probabilities (once for all outliers)
    const fixtureProbabilities = await probabilityCalculator.calculateFixtureProbabilities(
      homeTeam.id,
      awayTeam.id
    );

    // Step 4: Validate each outlier with stats
    const validatedBets = outliers.map(outlier =>
      this.validateOutlierWithStats(outlier, fixtureProbabilities)
    );

    // Step 5: Filter to only VALIDATED value bets (edge >= 3% AND stats validated)
    // Exclude player props and other markets without stats validation
    const valueBets = validatedBets.filter(bet =>
      bet && bet.statsValidated && bet.isValueBet
    );

    return valueBets;
  }

  /**
   * Get summary of scan results
   */
  getScanSummary(valueBets) {
    const gradeCount = { A: 0, B: 0, C: 0, D: 0 };
    const marketCount = {};
    const bookmakerCount = {};

    for (const bet of valueBets) {
      // Count by grade
      if (bet.confidence) {
        gradeCount[bet.confidence] = (gradeCount[bet.confidence] || 0) + 1;
      }

      // Count by market
      const market = bet.marketId || bet.market;
      marketCount[market] = (marketCount[market] || 0) + 1;

      // Count by bookmaker
      const book = bet.playableBook?.sportsbook;
      if (book) {
        bookmakerCount[book] = (bookmakerCount[book] || 0) + 1;
      }
    }

    return {
      totalBets: valueBets.length,
      byGrade: gradeCount,
      byMarket: marketCount,
      byBookmaker: bookmakerCount,
      avgEdge: valueBets.length > 0
        ? (valueBets.reduce((sum, b) => sum + (b.ourEdge || 0), 0) / valueBets.length * 100).toFixed(2) + '%'
        : '0%'
    };
  }
}

// Export singleton instance
export const marketScanner = new MarketScanner();
export default marketScanner;
