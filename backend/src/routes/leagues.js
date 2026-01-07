import express from 'express';
import sportmonks from '../services/sportmonks.js';

const router = express.Router();

// Get all leagues
router.get('/', async (req, res) => {
  try {
    const leagues = await sportmonks.getLeagues();
    res.json({ success: true, data: leagues });
  } catch (error) {
    console.error('Error fetching leagues:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get standings for a season
router.get('/standings/:seasonId', async (req, res) => {
  try {
    const { seasonId } = req.params;
    const standings = await sportmonks.getStandings(seasonId);
    res.json({ success: true, data: standings });
  } catch (error) {
    console.error('Error fetching standings:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get top scorers for a season
router.get('/topscorers/:seasonId', async (req, res) => {
  try {
    const { seasonId } = req.params;
    const topScorers = await sportmonks.getTopScorers(seasonId);
    res.json({ success: true, data: topScorers });
  } catch (error) {
    console.error('Error fetching top scorers:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current season for a league
router.get('/:id/season', async (req, res) => {
  try {
    const { id } = req.params;
    const season = await sportmonks.getCurrentSeason(id);
    res.json({ success: true, data: season });
  } catch (error) {
    console.error('Error fetching current season:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
