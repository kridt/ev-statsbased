/**
 * CLV (Closing Line Value) API Routes
 *
 * Endpoints for tracking and analyzing CLV performance.
 */

import { Router } from 'express';
import { clvTracker } from '../models/probability/clvTracker.js';

const router = Router();

/**
 * GET /api/clv/stats
 * Get aggregate CLV statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await clvTracker.getStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[CLV API] Error getting stats:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/clv/report
 * Get full CLV report with recent bets
 */
router.get('/report', async (req, res) => {
  try {
    const report = await clvTracker.generateReport();

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('[CLV API] Error generating report:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/clv/pending
 * Get pending bets (not yet settled)
 */
router.get('/pending', async (req, res) => {
  try {
    const pending = await clvTracker.getPendingBets();

    res.json({
      success: true,
      data: pending,
      count: pending.length,
    });
  } catch (error) {
    console.error('[CLV API] Error getting pending bets:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/clv/history
 * Get completed bets history
 */
router.get('/history', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const completed = await clvTracker.getCompletedBets(parseInt(limit));

    res.json({
      success: true,
      data: completed,
      count: completed.length,
    });
  } catch (error) {
    console.error('[CLV API] Error getting history:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/clv/record
 * Manually record a bet for CLV tracking
 */
router.post('/record', async (req, res) => {
  try {
    const bet = req.body;

    if (!bet.fixtureId || !bet.market || !bet.bookmakerOdds) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: fixtureId, market, bookmakerOdds',
      });
    }

    const record = await clvTracker.recordBet(bet);

    res.json({
      success: true,
      data: record,
    });
  } catch (error) {
    console.error('[CLV API] Error recording bet:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/clv/closing/:fixtureId
 * Record closing odds for a fixture
 */
router.post('/closing/:fixtureId', async (req, res) => {
  try {
    const { fixtureId } = req.params;
    const closingOddsData = req.body;

    const updatedCount = await clvTracker.recordClosingOdds(
      parseInt(fixtureId),
      closingOddsData
    );

    res.json({
      success: true,
      updatedCount,
      message: `Updated closing odds for ${updatedCount} bets`,
    });
  } catch (error) {
    console.error('[CLV API] Error recording closing odds:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/clv/settle/:fixtureId
 * Settle bets for a finished fixture
 */
router.post('/settle/:fixtureId', async (req, res) => {
  try {
    const { fixtureId } = req.params;
    const fixtureStats = req.body;

    const results = await clvTracker.settleFixtureBets(
      parseInt(fixtureId),
      fixtureStats
    );

    res.json({
      success: true,
      settledCount: results.length,
      results,
    });
  } catch (error) {
    console.error('[CLV API] Error settling bets:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/clv/outcome/:betId
 * Manually record outcome for a specific bet
 */
router.post('/outcome/:betId', async (req, res) => {
  try {
    const { betId } = req.params;
    const { outcome, actualResult } = req.body;

    if (!outcome || !['win', 'loss', 'push', 'void'].includes(outcome)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid outcome. Must be: win, loss, push, or void',
      });
    }

    const result = await clvTracker.recordOutcome(betId, outcome, actualResult);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Bet not found',
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[CLV API] Error recording outcome:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
