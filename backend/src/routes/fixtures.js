import express from 'express';
import sportmonks from '../services/sportmonks.js';

const router = express.Router();

// Get fixtures by date
router.get('/date/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const fixtures = await sportmonks.getFixturesByDate(date);
    res.json({ success: true, data: fixtures });
  } catch (error) {
    console.error('Error fetching fixtures by date:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get live fixtures
router.get('/live', async (req, res) => {
  try {
    const fixtures = await sportmonks.getLiveFixtures();
    res.json({ success: true, data: fixtures });
  } catch (error) {
    console.error('Error fetching live fixtures:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get fixture details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fixture = await sportmonks.getFixtureDetails(id);
    res.json({ success: true, data: fixture });
  } catch (error) {
    console.error('Error fetching fixture details:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get fixture events
router.get('/:id/events', async (req, res) => {
  try {
    const { id } = req.params;
    const events = await sportmonks.getFixtureEvents(id);
    res.json({ success: true, data: events });
  } catch (error) {
    console.error('Error fetching fixture events:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get fixture statistics
router.get('/:id/statistics', async (req, res) => {
  try {
    const { id } = req.params;
    const statistics = await sportmonks.getFixtureStatistics(id);
    res.json({ success: true, data: statistics });
  } catch (error) {
    console.error('Error fetching fixture statistics:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get fixture lineups
router.get('/:id/lineups', async (req, res) => {
  try {
    const { id } = req.params;
    const lineups = await sportmonks.getFixtureLineups(id);
    res.json({ success: true, data: lineups });
  } catch (error) {
    console.error('Error fetching fixture lineups:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get fixture player statistics
router.get('/:id/playerstats', async (req, res) => {
  try {
    const { id } = req.params;
    const playerStats = await sportmonks.getFixturePlayerStats(id);
    res.json({ success: true, data: playerStats });
  } catch (error) {
    console.error('Error fetching player stats:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get head to head
router.get('/h2h/:teamId1/:teamId2', async (req, res) => {
  try {
    const { teamId1, teamId2 } = req.params;
    const h2h = await sportmonks.getHeadToHead(teamId1, teamId2);
    res.json({ success: true, data: h2h });
  } catch (error) {
    console.error('Error fetching head to head:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get squads for both teams in a fixture (pre-match player stats)
router.get('/squads/:homeTeamId/:awayTeamId', async (req, res) => {
  try {
    const { homeTeamId, awayTeamId } = req.params;
    const squads = await sportmonks.getFixtureSquads(homeTeamId, awayTeamId);
    res.json({ success: true, data: squads });
  } catch (error) {
    console.error('Error fetching fixture squads:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
