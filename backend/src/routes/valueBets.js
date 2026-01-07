/**
 * Value Bets API Routes
 *
 * New API for market-scanned value bets with stats-based probability validation.
 *
 * Approach:
 * 1. Scan market odds for outliers (playable books > sharp books)
 * 2. Validate with Poisson probability from team stats
 * 3. Return only confirmed value bets
 */

import { Router } from 'express';
import { valueBetsService } from '../services/valueBetsService.js';
import { marketScanner } from '../services/marketScanner.js';
import { OPTIC_ODDS_CONFIG } from '../config/opticOddsConfig.js';

const router = Router();

/**
 * GET /api/value-bets/scan
 * Get all scanned value bets
 *
 * Query params:
 * - date: Filter by date (YYYY-MM-DD)
 * - minEdge: Minimum edge % (default: 3)
 * - betTypes: Comma-separated bet types (goals,btts,corners,cards,etc.)
 * - grades: Comma-separated grades (A,B,C)
 * - bookmakers: Comma-separated bookmakers (betano,betsson,etc.)
 * - leagues: Comma-separated league IDs
 */
router.get('/scan', async (req, res) => {
  try {
    const result = await valueBetsService.getValueBets(req.query);

    res.json({
      success: true,
      data: result.valueBets,
      meta: result.meta
    });
  } catch (error) {
    console.error('[ValueBets API] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/value-bets/scan/trigger
 * Trigger a new market scan manually
 */
router.post('/scan/trigger', async (req, res) => {
  try {
    // Check if already scanning
    const status = valueBetsService.getStatus();
    if (status.isScanning) {
      return res.json({
        success: true,
        message: 'Scan already in progress',
        status
      });
    }

    // Trigger async scan (don't await to return immediately)
    valueBetsService.runScan().catch(err => {
      console.error('[ValueBets API] Scan error:', err.message);
    });

    res.json({
      success: true,
      message: 'Scan triggered',
      status: valueBetsService.getStatus()
    });
  } catch (error) {
    console.error('[ValueBets API] Error triggering scan:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/value-bets/scan/status
 * Get scan status
 */
router.get('/scan/status', (req, res) => {
  const status = valueBetsService.getStatus();
  res.json({
    success: true,
    status
  });
});

/**
 * GET /api/value-bets/scan/summary
 * Get summary of current value bets
 */
router.get('/scan/summary', async (req, res) => {
  try {
    const result = await valueBetsService.getValueBets({});
    const summary = marketScanner.getScanSummary(result.valueBets);

    res.json({
      success: true,
      summary,
      meta: result.meta
    });
  } catch (error) {
    console.error('[ValueBets API] Error getting summary:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/value-bets/scan/grades/:grade
 * Get value bets by grade (A, B, C)
 */
router.get('/scan/grades/:grade', async (req, res) => {
  try {
    const { grade } = req.params;
    const validGrades = ['A', 'B', 'C', 'D'];

    if (!validGrades.includes(grade.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: `Invalid grade. Must be one of: ${validGrades.join(', ')}`
      });
    }

    const result = await valueBetsService.getValueBets({
      grades: grade.toUpperCase()
    });

    res.json({
      success: true,
      data: result.valueBets,
      meta: result.meta
    });
  } catch (error) {
    console.error('[ValueBets API] Error getting by grade:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/value-bets/scan/bookmaker/:bookmaker
 * Get value bets by bookmaker
 */
router.get('/scan/bookmaker/:bookmaker', async (req, res) => {
  try {
    const { bookmaker } = req.params;

    const result = await valueBetsService.getValueBets({
      bookmakers: bookmaker.toLowerCase()
    });

    res.json({
      success: true,
      data: result.valueBets,
      meta: result.meta
    });
  } catch (error) {
    console.error('[ValueBets API] Error getting by bookmaker:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/value-bets/scan/market/:marketType
 * Get value bets by market type
 */
router.get('/scan/market/:marketType', async (req, res) => {
  try {
    const { marketType } = req.params;

    const result = await valueBetsService.getValueBets({
      betTypes: marketType.toLowerCase()
    });

    res.json({
      success: true,
      data: result.valueBets,
      meta: result.meta
    });
  } catch (error) {
    console.error('[ValueBets API] Error getting by market:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/value-bets/bookmakers
 * Get bookmaker configuration for filtering
 */
router.get('/bookmakers', (req, res) => {
  const { playableBooks, bookmakerNetworks, bookmakerDisplayNames } = OPTIC_ODDS_CONFIG;

  res.json({
    success: true,
    data: {
      playable: playableBooks,
      networks: bookmakerNetworks,
      displayNames: bookmakerDisplayNames,
      // Group for UI
      groups: [
        {
          name: 'Independent',
          description: 'Unique odds - both recommended',
          bookmakers: bookmakerNetworks.independent.map(id => ({
            id,
            name: bookmakerDisplayNames[id] || id
          }))
        },
        {
          name: 'Kambi Network',
          description: 'Shared odds - pick your preferred',
          bookmakers: bookmakerNetworks.kambi.map(id => ({
            id,
            name: bookmakerDisplayNames[id] || id
          }))
        },
        {
          name: 'Other',
          description: 'Smaller bookmakers',
          bookmakers: bookmakerNetworks.other.map(id => ({
            id,
            name: bookmakerDisplayNames[id] || id
          }))
        }
      ]
    }
  });
});

export default router;
