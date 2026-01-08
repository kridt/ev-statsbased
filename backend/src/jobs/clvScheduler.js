/**
 * CLV Scheduler
 *
 * Automated jobs for CLV tracking:
 * 1. Capture closing odds 2 minutes before match starts
 * 2. Settle bets after matches finish
 * 3. Clean up old pending bets
 *
 * Runs every minute to check for:
 * - Matches starting in ~2 minutes (capture closing odds)
 * - Finished matches (settle bets)
 */

import { clvTracker } from '../models/probability/clvTracker.js';
import { opticOddsService } from '../services/opticOdds.js';
import sportmonks from '../services/sportmonks.js';
import { cache } from '../config/redis.js';

// Configuration
const CONFIG = {
  CLOSING_WINDOW_MINUTES: 2,      // Capture closing odds 2 minutes before match
  CHECK_INTERVAL_MS: 60000,        // Check every 1 minute
  SETTLE_DELAY_MINUTES: 120,       // Wait 2 hours after match start before settling (match duration)
  MAX_PENDING_AGE_HOURS: 48,       // Remove pending bets older than 48 hours
};

class CLVScheduler {
  constructor() {
    this.isRunning = false;
    this.lastRun = null;
    this.intervalId = null;
    this.stats = {
      closingOddsCaptured: 0,
      betsSettled: 0,
      errors: 0,
    };
  }

  /**
   * Start the CLV scheduler
   */
  start() {
    if (this.isRunning) {
      console.log('[CLV Scheduler] Already running');
      return;
    }

    console.log('[CLV Scheduler] Starting...');
    this.isRunning = true;

    // Run immediately, then every minute
    this.run();
    this.intervalId = setInterval(() => this.run(), CONFIG.CHECK_INTERVAL_MS);

    console.log(`[CLV Scheduler] ✓ Started - checking every ${CONFIG.CHECK_INTERVAL_MS / 1000}s`);
    console.log(`[CLV Scheduler] ✓ Closing odds captured ${CONFIG.CLOSING_WINDOW_MINUTES} min before kickoff`);
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[CLV Scheduler] Stopped');
  }

  /**
   * Main run loop
   */
  async run() {
    try {
      this.lastRun = new Date();

      // Get all pending bets
      const pendingBets = await clvTracker.getPendingBets();

      if (pendingBets.length === 0) {
        return;
      }

      const now = new Date();
      const closingWindowMs = CONFIG.CLOSING_WINDOW_MINUTES * 60 * 1000;
      const settleDelayMs = CONFIG.SETTLE_DELAY_MINUTES * 60 * 1000;

      // Group bets by fixture
      const fixtureGroups = this.groupBetsByFixture(pendingBets);

      for (const [fixtureId, bets] of Object.entries(fixtureGroups)) {
        try {
          const matchTime = new Date(bets[0].matchStartTime);
          const timeUntilMatch = matchTime - now;
          const timeSinceMatch = now - matchTime;

          // Case 1: Match starting soon - capture closing odds
          if (timeUntilMatch > 0 && timeUntilMatch <= closingWindowMs) {
            const needsClosing = bets.some(b => !b.closingOdds);
            if (needsClosing) {
              await this.captureClosingOdds(parseInt(fixtureId), bets);
            }
          }

          // Case 2: Match finished (2+ hours after start) - settle bets
          if (timeSinceMatch > settleDelayMs) {
            const needsSettling = bets.some(b => !b.outcome);
            if (needsSettling) {
              await this.settleBets(parseInt(fixtureId), bets);
            }
          }

        } catch (err) {
          console.error(`[CLV Scheduler] Error processing fixture ${fixtureId}:`, err.message);
          this.stats.errors++;
        }
      }

      // Cleanup old pending bets (older than 48 hours and no closing odds)
      await this.cleanupOldBets(pendingBets);

    } catch (err) {
      console.error('[CLV Scheduler] Run error:', err.message);
      this.stats.errors++;
    }
  }

  /**
   * Group bets by fixture ID
   */
  groupBetsByFixture(bets) {
    const groups = {};
    for (const bet of bets) {
      const id = bet.fixtureId;
      if (!groups[id]) groups[id] = [];
      groups[id].push(bet);
    }
    return groups;
  }

  /**
   * Capture closing odds for a fixture
   */
  async captureClosingOdds(fixtureId, bets) {
    console.log(`[CLV Scheduler] Capturing closing odds for fixture ${fixtureId} (${bets[0].fixtureName})`);

    try {
      // Get fixture details for OpticOdds lookup
      const fixture = await sportmonks.getFixtureById(fixtureId);
      if (!fixture) {
        console.warn(`[CLV Scheduler] Fixture ${fixtureId} not found`);
        return;
      }

      // Fetch current odds from OpticOdds
      const oddsData = await opticOddsService.getOddsForFixture(fixture);
      if (!oddsData?.odds) {
        console.warn(`[CLV Scheduler] No odds data for fixture ${fixtureId}`);
        return;
      }

      // Record closing odds
      const updatedCount = await clvTracker.recordClosingOdds(fixtureId, oddsData.odds);

      if (updatedCount > 0) {
        console.log(`[CLV Scheduler] ✓ Captured closing odds for ${updatedCount} bets on ${bets[0].fixtureName}`);
        this.stats.closingOddsCaptured += updatedCount;
      }

    } catch (err) {
      console.error(`[CLV Scheduler] Error capturing closing odds for ${fixtureId}:`, err.message);
      this.stats.errors++;
    }
  }

  /**
   * Settle bets for a finished fixture
   */
  async settleBets(fixtureId, bets) {
    console.log(`[CLV Scheduler] Settling bets for fixture ${fixtureId} (${bets[0].fixtureName})`);

    try {
      // Get fixture with stats
      const fixture = await sportmonks.getFixtureById(fixtureId);
      if (!fixture) {
        console.warn(`[CLV Scheduler] Fixture ${fixtureId} not found for settlement`);
        return;
      }

      // Check if match is finished
      const state = fixture.state?.state || fixture.state?.short_name || 'NS';
      const finishedStates = ['FT', 'FT_PEN', 'AET', 'ABD', 'AWD', 'WO'];

      if (!finishedStates.includes(state)) {
        // Match not finished yet
        return;
      }

      // Extract match stats
      const stats = this.extractFixtureStats(fixture);

      if (!stats) {
        console.warn(`[CLV Scheduler] No stats available for fixture ${fixtureId}`);
        return;
      }

      // Settle bets
      const results = await clvTracker.settleFixtureBets(fixtureId, stats);

      if (results.length > 0) {
        const wins = results.filter(r => r.outcome === 'win').length;
        const losses = results.filter(r => r.outcome === 'loss').length;
        console.log(`[CLV Scheduler] ✓ Settled ${results.length} bets for ${bets[0].fixtureName} (${wins}W/${losses}L)`);
        this.stats.betsSettled += results.length;
      }

    } catch (err) {
      console.error(`[CLV Scheduler] Error settling bets for ${fixtureId}:`, err.message);
      this.stats.errors++;
    }
  }

  /**
   * Extract stats from fixture for settlement
   */
  extractFixtureStats(fixture) {
    const stats = {
      homeGoals: 0,
      awayGoals: 0,
      totalCorners: 0,
      homeCorners: 0,
      awayCorners: 0,
      totalCards: 0,
      homeCards: 0,
      awayCards: 0,
    };

    // Extract scores
    if (fixture.scores) {
      for (const score of fixture.scores) {
        const desc = score.description?.toLowerCase() || '';
        if (desc === 'current' || desc === '2nd half' || desc.includes('final')) {
          if (score.score?.participant === 'home') {
            stats.homeGoals = score.score?.goals || 0;
          } else if (score.score?.participant === 'away') {
            stats.awayGoals = score.score?.goals || 0;
          }
        }
      }
    }

    // Extract statistics
    if (fixture.statistics) {
      for (const stat of fixture.statistics) {
        const typeName = stat.type?.developer_name || stat.type?.name || '';
        const location = stat.location || stat.participant?.meta?.location;
        const value = stat.data?.value || stat.value || 0;

        if (typeName.includes('CORNER')) {
          if (location === 'home') stats.homeCorners = value;
          else if (location === 'away') stats.awayCorners = value;
        }

        if (typeName.includes('YELLOW') || typeName.includes('RED') || typeName.includes('CARD')) {
          if (location === 'home') stats.homeCards += value;
          else if (location === 'away') stats.awayCards += value;
        }
      }
    }

    // Calculate totals
    stats.totalCorners = stats.homeCorners + stats.awayCorners;
    stats.totalCards = stats.homeCards + stats.awayCards;
    stats.goals = { total: stats.homeGoals + stats.awayGoals };
    stats.corners = { total: stats.totalCorners };
    stats.cards = { total: stats.totalCards };

    return stats;
  }

  /**
   * Clean up old pending bets that were never settled
   */
  async cleanupOldBets(pendingBets) {
    const now = new Date();
    const maxAge = CONFIG.MAX_PENDING_AGE_HOURS * 60 * 60 * 1000;

    for (const bet of pendingBets) {
      const recordedAt = new Date(bet.recordedAt);
      const age = now - recordedAt;

      if (age > maxAge && !bet.closingOdds) {
        // Very old bet with no closing odds - mark as void
        try {
          await clvTracker.recordOutcome(bet.id, 'void', 'Expired - no closing odds captured');
          console.log(`[CLV Scheduler] Voided expired bet: ${bet.selectionName}`);
        } catch (err) {
          // Ignore cleanup errors
        }
      }
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun?.toISOString() || null,
      config: {
        closingWindowMinutes: CONFIG.CLOSING_WINDOW_MINUTES,
        checkIntervalSeconds: CONFIG.CHECK_INTERVAL_MS / 1000,
        settleDelayMinutes: CONFIG.SETTLE_DELAY_MINUTES,
      },
      stats: this.stats,
    };
  }
}

// Export singleton
export const clvScheduler = new CLVScheduler();
export default clvScheduler;
