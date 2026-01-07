/**
 * OpticOdds API Routes
 *
 * Endpoints for fetching bookmaker odds from OpticOdds
 * Migrated from Odds API to OpticOdds for better coverage
 */

import express from 'express';
import { opticOddsService as oddsApiService } from '../services/opticOdds.js';
import sportmonksService from '../services/sportmonks.js';

const router = express.Router();

/**
 * GET /api/odds/sports
 * Get available sports from Odds API
 */
router.get('/sports', async (req, res) => {
  try {
    const sports = await oddsApiService.getSports();
    res.json({ success: true, data: sports });
  } catch (error) {
    console.error('[Odds Route] Error fetching sports:', error.message);
    res.status(500).json({ error: 'Failed to fetch sports' });
  }
});

/**
 * GET /api/odds/leagues
 * Get available football leagues from Odds API
 */
router.get('/leagues', async (req, res) => {
  try {
    const leagues = await oddsApiService.getLeagues();
    res.json({ success: true, data: leagues });
  } catch (error) {
    console.error('[Odds Route] Error fetching leagues:', error.message);
    res.status(500).json({ error: 'Failed to fetch leagues' });
  }
});

/**
 * GET /api/odds/bookmakers
 * Get selected bookmakers
 */
router.get('/bookmakers', async (req, res) => {
  try {
    const bookmakers = await oddsApiService.getSelectedBookmakers();
    res.json({ success: true, data: bookmakers });
  } catch (error) {
    console.error('[Odds Route] Error fetching bookmakers:', error.message);
    res.status(500).json({ error: 'Failed to fetch bookmakers' });
  }
});

/**
 * GET /api/odds/fixture/:fixtureId
 * Get odds for a SportMonks fixture
 */
router.get('/fixture/:fixtureId', async (req, res) => {
  try {
    const { fixtureId } = req.params;

    // Get fixture details from SportMonks
    const fixture = await sportmonksService.getFixtureDetails(fixtureId);

    if (!fixture) {
      return res.status(404).json({ error: 'Fixture not found' });
    }

    // Get odds from Odds API
    const oddsData = await oddsApiService.getOddsForFixture(fixture);

    if (!oddsData) {
      return res.json({
        success: true,
        data: null,
        message: 'No matching event found in Odds API',
        fixture: {
          id: fixture.id,
          name: fixture.name,
          homeTeam: fixture.participants?.find((p) => p.meta?.location === 'home')?.name,
          awayTeam: fixture.participants?.find((p) => p.meta?.location === 'away')?.name,
        },
      });
    }

    res.json({
      success: true,
      data: oddsData,
    });
  } catch (error) {
    console.error('[Odds Route] Error fetching fixture odds:', error.message);
    res.status(500).json({ error: 'Failed to fetch odds' });
  }
});

/**
 * GET /api/odds/date/:date
 * Get odds for all fixtures on a specific date
 */
router.get('/date/:date', async (req, res) => {
  try {
    const { date } = req.params;

    // Get fixtures from SportMonks
    const fixtures = await sportmonksService.getFixturesByDate(date);

    if (!fixtures || fixtures.length === 0) {
      return res.json({
        success: true,
        data: [],
        message: 'No fixtures found for this date',
      });
    }

    // Get odds for all fixtures
    const oddsMap = await oddsApiService.getOddsForFixtures(fixtures);

    // Combine fixture data with odds
    const results = fixtures.map((fixture) => {
      const homeTeam = fixture.participants?.find((p) => p.meta?.location === 'home');
      const awayTeam = fixture.participants?.find((p) => p.meta?.location === 'away');

      return {
        fixture: {
          id: fixture.id,
          name: fixture.name,
          homeTeam: homeTeam?.name,
          awayTeam: awayTeam?.name,
          league: fixture.league?.name,
          startingAt: fixture.starting_at,
        },
        odds: oddsMap[fixture.id] || null,
        hasOdds: !!oddsMap[fixture.id],
      };
    });

    const matchedCount = results.filter((r) => r.hasOdds).length;

    res.json({
      success: true,
      data: results,
      stats: {
        totalFixtures: fixtures.length,
        matchedWithOdds: matchedCount,
        matchRate: ((matchedCount / fixtures.length) * 100).toFixed(1) + '%',
      },
    });
  } catch (error) {
    console.error('[Odds Route] Error fetching date odds:', error.message);
    res.status(500).json({ error: 'Failed to fetch odds' });
  }
});

/**
 * GET /api/odds/events/:league
 * Get events from OpticOdds for a specific league
 */
router.get('/events/:league', async (req, res) => {
  try {
    const { league } = req.params;

    const events = await oddsApiService.getActiveFixtures(league);

    res.json({
      success: true,
      data: events,
      count: events.length,
    });
  } catch (error) {
    console.error('[Odds Route] Error fetching events:', error.message);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

/**
 * GET /api/odds/mapping/stats
 * Get team mapping statistics
 */
router.get('/mapping/stats', async (req, res) => {
  try {
    const stats = oddsApiService.getMappingStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get mapping stats' });
  }
});

/**
 * GET /api/odds/compare/:fixtureId
 * Get odds comparison - our calculated probabilities vs bookmaker odds
 */
router.get('/compare/:fixtureId', async (req, res) => {
  try {
    const { fixtureId } = req.params;

    // Get fixture details
    const fixture = await sportmonksService.getFixtureDetails(fixtureId);
    if (!fixture) {
      return res.status(404).json({ error: 'Fixture not found' });
    }

    // Get bookmaker odds
    const oddsData = await oddsApiService.getOddsForFixture(fixture);

    // Return comparison data
    res.json({
      success: true,
      data: {
        fixture: {
          id: fixture.id,
          name: fixture.name,
          startingAt: fixture.starting_at,
        },
        bookmakerOdds: oddsData,
        // Our probability endpoints can be called separately
        // and compared in the frontend
      },
    });
  } catch (error) {
    console.error('[Odds Route] Error comparing odds:', error.message);
    res.status(500).json({ error: 'Failed to compare odds' });
  }
});

export default router;
