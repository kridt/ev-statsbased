import express from 'express';
import sportmonks from '../services/sportmonks.js';

const router = express.Router();

// Get team details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const team = await sportmonks.getTeam(id);
    res.json({ success: true, data: team });
  } catch (error) {
    console.error('Error fetching team:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get team season statistics
router.get('/:id/stats/:seasonId', async (req, res) => {
  try {
    const { id, seasonId } = req.params;
    const stats = await sportmonks.getTeamSeasonStats(id, seasonId);
    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('Error fetching team stats:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get team form (last N matches)
router.get('/:id/form', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const form = await sportmonks.getTeamForm(id, limit);
    res.json({ success: true, data: form });
  } catch (error) {
    console.error('Error fetching team form:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search teams
router.get('/search/:query', async (req, res) => {
  try {
    const { query } = req.params;
    const teams = await sportmonks.searchTeams(query);
    res.json({ success: true, data: teams });
  } catch (error) {
    console.error('Error searching teams:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
