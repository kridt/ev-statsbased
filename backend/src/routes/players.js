import express from 'express';
import sportmonks from '../services/sportmonks.js';

const router = express.Router();

// Get player details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const player = await sportmonks.getPlayer(id);
    res.json({ success: true, data: player });
  } catch (error) {
    console.error('Error fetching player:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get player season statistics
router.get('/:id/stats/:seasonId', async (req, res) => {
  try {
    const { id, seasonId } = req.params;
    const stats = await sportmonks.getPlayerSeasonStats(id, seasonId);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching player stats:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search players
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const players = await sportmonks.searchPlayers(query);
    res.json({ success: true, data: players });
  } catch (error) {
    console.error('Error searching players:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
