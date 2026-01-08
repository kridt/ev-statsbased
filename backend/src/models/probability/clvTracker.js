/**
 * Closing Line Value (CLV) Tracker
 *
 * Tracks whether our value bet recommendations beat the closing line.
 *
 * CLV = (Our Odds - Closing Odds) / Closing Odds * 100
 *
 * Positive CLV means we got better odds than the market settled at,
 * which is a strong indicator of long-term profitability.
 *
 * Key metrics:
 * - CLV%: Average closing line value across all bets
 * - CLV Hit Rate: % of bets that beat the closing line
 * - Expected CLV: Based on edge at time of bet
 */

import { cache } from '../../config/redis.js';

// Cache keys
const PENDING_BETS_KEY = 'clv:pending';
const COMPLETED_BETS_KEY = 'clv:completed';
const CLV_STATS_KEY = 'clv:stats';

/**
 * Bet record structure for CLV tracking
 */
const createBetRecord = (bet) => ({
  // Identification
  id: `${bet.fixtureId}-${bet.market}-${bet.selection}-${Date.now()}`,
  fixtureId: bet.fixtureId,
  fixtureName: bet.fixtureName,

  // Market details
  market: bet.market,
  marketId: bet.marketId,
  selection: bet.selection,
  selectionName: bet.selectionName,
  line: bet.points,
  betType: bet.betType,

  // Odds at time of recommendation
  openingOdds: bet.bookmakerOdds,
  openingBookmaker: bet.bookmaker,
  openingSharpOdds: bet.sharpOdds,
  openingSharpBook: bet.sharpBook,

  // Our model's assessment at opening
  modelProbability: bet.probability,
  modelFairOdds: bet.fairOdds,
  modelEdge: bet.edge,
  confidence: bet.grade || bet.confidence,

  // Timestamps
  recordedAt: new Date().toISOString(),
  matchStartTime: bet.startingAt,

  // To be filled at closing
  closingOdds: null,
  closingSharpOdds: null,
  closedAt: null,

  // Results (to be filled after match)
  outcome: null, // 'win', 'loss', 'push', 'void'
  actualResult: null, // e.g., 11 corners
  settledAt: null,

  // CLV metrics (calculated at closing)
  clv: null,
  clvPercent: null,
  beatClosingLine: null,
});

class CLVTracker {
  constructor() {
    this.pendingBets = new Map();
    this.initialized = false;
  }

  /**
   * Initialize tracker - load pending bets from cache
   */
  async initialize() {
    if (this.initialized) return;

    try {
      const cached = await cache.get(PENDING_BETS_KEY);
      if (cached && Array.isArray(cached)) {
        cached.forEach(bet => {
          this.pendingBets.set(bet.id, bet);
        });
        console.log(`[CLV] Loaded ${this.pendingBets.size} pending bets from cache`);
      }
      this.initialized = true;
    } catch (err) {
      console.error('[CLV] Failed to load from cache:', err.message);
      this.initialized = true;
    }
  }

  /**
   * Record a new value bet for CLV tracking
   * Called when a value bet is identified/recommended
   */
  async recordBet(bet) {
    await this.initialize();

    const record = createBetRecord(bet);
    this.pendingBets.set(record.id, record);

    // Persist to cache
    await this.savePendingBets();

    console.log(`[CLV] Recorded bet: ${record.selectionName} @${record.openingOdds} (Edge: ${(record.modelEdge * 100).toFixed(1)}%)`);

    return record;
  }

  /**
   * Record multiple bets at once
   */
  async recordBets(bets) {
    const records = [];
    for (const bet of bets) {
      const record = await this.recordBet(bet);
      records.push(record);
    }
    return records;
  }

  /**
   * Update closing odds for a fixture
   * Called just before match starts (or at match start)
   */
  async recordClosingOdds(fixtureId, closingOddsData) {
    await this.initialize();

    let updatedCount = 0;

    for (const [id, bet] of this.pendingBets) {
      if (bet.fixtureId === fixtureId && !bet.closingOdds) {
        // Find matching closing odds
        const closingOdd = this.findMatchingOdds(bet, closingOddsData);

        if (closingOdd) {
          bet.closingOdds = closingOdd.playableOdds;
          bet.closingSharpOdds = closingOdd.sharpOdds;
          bet.closedAt = new Date().toISOString();

          // Calculate CLV
          const clvResult = this.calculateCLV(bet.openingOdds, bet.closingOdds);
          bet.clv = clvResult.clv;
          bet.clvPercent = clvResult.clvPercent;
          bet.beatClosingLine = clvResult.beatClosingLine;

          updatedCount++;

          console.log(`[CLV] Closing odds recorded: ${bet.selectionName} - Opening @${bet.openingOdds} -> Closing @${bet.closingOdds} (CLV: ${bet.clvPercent > 0 ? '+' : ''}${bet.clvPercent.toFixed(2)}%)`);
        }
      }
    }

    if (updatedCount > 0) {
      await this.savePendingBets();
    }

    return updatedCount;
  }

  /**
   * Find matching odds from closing odds data
   */
  findMatchingOdds(bet, closingOddsData) {
    if (!closingOddsData?.bookmakers) return null;

    // Look for the same market/selection/line
    for (const [bookmaker, odds] of Object.entries(closingOddsData.bookmakers)) {
      for (const odd of odds) {
        const matchesMarket = odd.marketId === bet.marketId ||
          odd.market?.toLowerCase().includes(bet.market?.toLowerCase());
        const matchesSelection = odd.selection === bet.selection ||
          odd.selectionLine === bet.selection;
        const matchesLine = Math.abs((odd.points || 0) - (bet.line || 0)) < 0.01;

        if (matchesMarket && matchesSelection && matchesLine) {
          return {
            playableOdds: odd.decimalOdds,
            sharpOdds: odd.isSharp ? odd.decimalOdds : null,
            bookmaker: bookmaker,
          };
        }
      }
    }

    return null;
  }

  /**
   * Calculate CLV between opening and closing odds
   *
   * CLV = (Opening Odds - Closing Odds) / Closing Odds
   *
   * Positive = Got better odds than closing (good)
   * Negative = Worse odds than closing (bad)
   */
  calculateCLV(openingOdds, closingOdds) {
    if (!openingOdds || !closingOdds || closingOdds <= 1) {
      return { clv: 0, clvPercent: 0, beatClosingLine: false };
    }

    // CLV in decimal form
    const clv = (openingOdds - closingOdds) / closingOdds;

    // CLV as percentage
    const clvPercent = clv * 100;

    // Did we beat the closing line?
    const beatClosingLine = openingOdds > closingOdds;

    return {
      clv: parseFloat(clv.toFixed(4)),
      clvPercent: parseFloat(clvPercent.toFixed(2)),
      beatClosingLine,
    };
  }

  /**
   * Record bet outcome after match finishes
   */
  async recordOutcome(betId, outcome, actualResult = null) {
    await this.initialize();

    const bet = this.pendingBets.get(betId);
    if (!bet) {
      console.warn(`[CLV] Bet not found: ${betId}`);
      return null;
    }

    bet.outcome = outcome; // 'win', 'loss', 'push', 'void'
    bet.actualResult = actualResult;
    bet.settledAt = new Date().toISOString();

    // Move to completed bets
    this.pendingBets.delete(betId);
    await this.saveCompletedBet(bet);
    await this.savePendingBets();

    // Update aggregate stats
    await this.updateStats();

    console.log(`[CLV] Bet settled: ${bet.selectionName} - ${outcome.toUpperCase()} (CLV: ${bet.clvPercent?.toFixed(2) || 'N/A'}%)`);

    return bet;
  }

  /**
   * Auto-settle bets based on fixture results
   */
  async settleFixtureBets(fixtureId, fixtureStats) {
    await this.initialize();

    const betsToSettle = [];

    for (const [id, bet] of this.pendingBets) {
      if (bet.fixtureId === fixtureId) {
        betsToSettle.push({ id, bet });
      }
    }

    const results = [];

    for (const { id, bet } of betsToSettle) {
      const outcome = this.determineOutcome(bet, fixtureStats);
      if (outcome) {
        const result = await this.recordOutcome(id, outcome.result, outcome.actualValue);
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Determine outcome based on bet type and fixture stats
   */
  determineOutcome(bet, stats) {
    if (!stats) return null;

    let actualValue = null;
    let result = null;

    switch (bet.betType) {
      case 'corners':
        actualValue = stats.corners?.total || stats.totalCorners;
        break;
      case 'cards':
        actualValue = stats.cards?.total || stats.totalCards;
        break;
      case 'goals':
        actualValue = stats.goals?.total || (stats.homeGoals + stats.awayGoals);
        break;
      case 'btts':
        const homeScored = (stats.homeGoals || 0) > 0;
        const awayScored = (stats.awayGoals || 0) > 0;
        actualValue = homeScored && awayScored ? 'Yes' : 'No';
        break;
      default:
        return null;
    }

    if (actualValue === null || actualValue === undefined) return null;

    // Determine win/loss based on selection and line
    const selection = (bet.selection || '').toLowerCase();
    const line = bet.line;

    if (selection.includes('over')) {
      result = actualValue > line ? 'win' : actualValue < line ? 'loss' : 'push';
    } else if (selection.includes('under')) {
      result = actualValue < line ? 'win' : actualValue > line ? 'loss' : 'push';
    } else if (bet.betType === 'btts') {
      result = actualValue === bet.selection ? 'win' : 'loss';
    }

    return { result, actualValue };
  }

  /**
   * Get aggregate CLV statistics
   */
  async getStats() {
    await this.initialize();

    try {
      const stats = await cache.get(CLV_STATS_KEY);
      return stats || this.getEmptyStats();
    } catch {
      return this.getEmptyStats();
    }
  }

  /**
   * Empty stats structure
   */
  getEmptyStats() {
    return {
      totalBets: 0,
      settledBets: 0,
      pendingBets: 0,

      // CLV metrics
      avgCLV: 0,
      clvHitRate: 0, // % of bets beating closing line
      totalCLV: 0,

      // Performance
      wins: 0,
      losses: 0,
      pushes: 0,
      winRate: 0,

      // ROI (if tracking stakes)
      totalStaked: 0,
      totalReturn: 0,
      roi: 0,

      // By confidence grade
      byGrade: {
        A: { bets: 0, avgCLV: 0, winRate: 0 },
        B: { bets: 0, avgCLV: 0, winRate: 0 },
        C: { bets: 0, avgCLV: 0, winRate: 0 },
      },

      // By bet type
      byMarket: {},

      // Time series (last 30 days)
      dailyStats: [],

      lastUpdated: null,
    };
  }

  /**
   * Update aggregate statistics
   */
  async updateStats() {
    try {
      const completed = await this.getCompletedBets();

      if (!completed || completed.length === 0) {
        return this.getEmptyStats();
      }

      const stats = this.getEmptyStats();
      stats.totalBets = completed.length + this.pendingBets.size;
      stats.settledBets = completed.length;
      stats.pendingBets = this.pendingBets.size;

      let totalCLV = 0;
      let clvBeats = 0;

      const gradeStats = { A: [], B: [], C: [] };
      const marketStats = {};

      for (const bet of completed) {
        // CLV tracking
        if (bet.clvPercent !== null) {
          totalCLV += bet.clvPercent;
          if (bet.beatClosingLine) clvBeats++;
        }

        // Win/loss tracking
        if (bet.outcome === 'win') stats.wins++;
        else if (bet.outcome === 'loss') stats.losses++;
        else if (bet.outcome === 'push') stats.pushes++;

        // By grade
        const grade = bet.confidence || 'C';
        if (gradeStats[grade]) {
          gradeStats[grade].push(bet);
        }

        // By market
        const market = bet.betType || 'other';
        if (!marketStats[market]) {
          marketStats[market] = { bets: [], wins: 0, clvTotal: 0 };
        }
        marketStats[market].bets.push(bet);
        if (bet.outcome === 'win') marketStats[market].wins++;
        if (bet.clvPercent) marketStats[market].clvTotal += bet.clvPercent;
      }

      // Calculate averages
      stats.avgCLV = completed.length > 0 ? totalCLV / completed.length : 0;
      stats.clvHitRate = completed.length > 0 ? (clvBeats / completed.length) * 100 : 0;
      stats.totalCLV = totalCLV;
      stats.winRate = stats.settledBets > 0 ?
        (stats.wins / (stats.wins + stats.losses)) * 100 : 0;

      // Grade breakdown
      for (const [grade, bets] of Object.entries(gradeStats)) {
        if (bets.length > 0) {
          const wins = bets.filter(b => b.outcome === 'win').length;
          const clvSum = bets.reduce((sum, b) => sum + (b.clvPercent || 0), 0);
          stats.byGrade[grade] = {
            bets: bets.length,
            avgCLV: parseFloat((clvSum / bets.length).toFixed(2)),
            winRate: parseFloat(((wins / bets.length) * 100).toFixed(1)),
          };
        }
      }

      // Market breakdown
      for (const [market, data] of Object.entries(marketStats)) {
        stats.byMarket[market] = {
          bets: data.bets.length,
          avgCLV: parseFloat((data.clvTotal / data.bets.length).toFixed(2)),
          winRate: parseFloat(((data.wins / data.bets.length) * 100).toFixed(1)),
        };
      }

      stats.lastUpdated = new Date().toISOString();

      // Save stats
      await cache.set(CLV_STATS_KEY, stats, 86400); // 24 hour cache

      return stats;
    } catch (err) {
      console.error('[CLV] Error updating stats:', err.message);
      return this.getEmptyStats();
    }
  }

  /**
   * Get pending bets (not yet settled)
   */
  async getPendingBets() {
    await this.initialize();
    return Array.from(this.pendingBets.values());
  }

  /**
   * Get completed bets from cache
   */
  async getCompletedBets(limit = 1000) {
    try {
      const completed = await cache.get(COMPLETED_BETS_KEY);
      if (!completed) return [];
      return completed.slice(-limit);
    } catch {
      return [];
    }
  }

  /**
   * Save pending bets to cache
   */
  async savePendingBets() {
    try {
      const bets = Array.from(this.pendingBets.values());
      await cache.set(PENDING_BETS_KEY, bets, 86400 * 7); // 7 days
    } catch (err) {
      console.error('[CLV] Failed to save pending bets:', err.message);
    }
  }

  /**
   * Save a completed bet
   */
  async saveCompletedBet(bet) {
    try {
      const completed = await this.getCompletedBets();
      completed.push(bet);

      // Keep last 1000 bets
      const trimmed = completed.slice(-1000);
      await cache.set(COMPLETED_BETS_KEY, trimmed, 86400 * 90); // 90 days
    } catch (err) {
      console.error('[CLV] Failed to save completed bet:', err.message);
    }
  }

  /**
   * Generate CLV report
   */
  async generateReport() {
    const stats = await this.getStats();
    const pending = await this.getPendingBets();
    const completed = await this.getCompletedBets(100);

    return {
      summary: {
        totalBets: stats.totalBets,
        settledBets: stats.settledBets,
        pendingBets: stats.pendingBets,

        clv: {
          average: `${stats.avgCLV > 0 ? '+' : ''}${stats.avgCLV.toFixed(2)}%`,
          hitRate: `${stats.clvHitRate.toFixed(1)}%`,
          interpretation: this.interpretCLV(stats.avgCLV),
        },

        performance: {
          wins: stats.wins,
          losses: stats.losses,
          winRate: `${stats.winRate.toFixed(1)}%`,
        },
      },

      byGrade: stats.byGrade,
      byMarket: stats.byMarket,

      recentBets: completed.slice(-20).reverse(),
      pendingBets: pending,

      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Interpret CLV value
   */
  interpretCLV(avgCLV) {
    if (avgCLV >= 3) return 'Excellent - Strong long-term edge';
    if (avgCLV >= 1.5) return 'Good - Consistent value found';
    if (avgCLV >= 0.5) return 'Decent - Slight edge over market';
    if (avgCLV >= 0) return 'Break-even - No clear edge';
    if (avgCLV >= -1) return 'Slight negative - Review selection criteria';
    return 'Concerning - Model may need recalibration';
  }
}

// Export singleton instance
export const clvTracker = new CLVTracker();
export default clvTracker;
