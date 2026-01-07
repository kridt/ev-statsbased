import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.SPORTMONKS_API_KEY;
const BASE_URL = 'https://api.sportmonks.com/v3/football';

const api = axios.create({
  baseURL: BASE_URL,
  params: { api_token: API_KEY },
});

async function checkAvailableStats() {
  console.log('=== Checking SportMonks Available Statistics ===\n');

  try {
    // 1. Get a FINISHED fixture with detailed statistics (try multiple days back)
    console.log('1. Fetching FINISHED fixture with full statistics...');
    let finishedFixture = null;
    for (let daysBack = 1; daysBack <= 7 && !finishedFixture; daysBack++) {
      const date = new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0];
      console.log(`  Checking ${date}...`);
      const fixturesResponse = await api.get(`/fixtures/date/${date}`, {
        params: {
          include: 'statistics.type;participants;lineups.player;lineups.details.type',
          per_page: 20,
        },
      });
      const fixtures = fixturesResponse.data.data || [];
      finishedFixture = fixtures.find(f => f.state?.state === 'FT' || f.state?.short_name === 'FT');
    }
    if (finishedFixture) {
      console.log(`\nFinished Fixture: ${finishedFixture.name || finishedFixture.id}`);

      // Match-level statistics
      const stats = finishedFixture.statistics || [];
      console.log(`\nMatch Statistics (${stats.length} entries):`);

      const statsByType = {};
      stats.forEach(s => {
        const typeName = s.type?.name || s.type?.developer_name || `Type ${s.type_id}`;
        if (!statsByType[typeName]) {
          statsByType[typeName] = { home: null, away: null, typeId: s.type_id };
        }
        if (s.location === 'home') statsByType[typeName].home = s.data?.value;
        else statsByType[typeName].away = s.data?.value;
      });

      Object.entries(statsByType).forEach(([name, data]) => {
        console.log(`  - ${name} (ID: ${data.typeId}): Home=${data.home}, Away=${data.away}`);
      });

      // Player-level statistics from lineups
      const lineups = finishedFixture.lineups || [];
      console.log(`\n\nPlayer Match Statistics (from lineups, ${lineups.length} players):`);

      if (lineups.length > 0) {
        // Get first player with details
        const playerWithStats = lineups.find(p => p.details && p.details.length > 0);
        if (playerWithStats) {
          console.log(`\nSample Player: ${playerWithStats.player?.display_name || playerWithStats.player_name}`);
          console.log(`Stats available for this player (${playerWithStats.details.length} types):`);
          playerWithStats.details.forEach(d => {
            const typeName = d.type?.name || d.type?.developer_name || `Type ${d.type_id}`;
            console.log(`  - ${typeName} (ID: ${d.type_id}): ${JSON.stringify(d.data?.value ?? d.value)}`);
          });
        }
      }
    } else {
      console.log('No finished fixture found for yesterday');
    }

    // 3. Check player statistics available (Haaland - active striker with many shots)
    console.log('\n3. Checking player statistics structure...');
    const playerResponse = await api.get('/players/159333', { // Haaland
      params: {
        include: 'statistics.details.type',
      },
    });

    const player = playerResponse.data.data;
    if (player) {
      console.log(`\nPlayer: ${player.display_name || player.name}`);
      const playerStats = player.statistics || [];
      console.log(`Seasons with stats: ${playerStats.length}`);

      if (playerStats.length > 0) {
        const latestSeason = playerStats[0];
        const details = latestSeason.details || [];
        console.log(`\nStats available in latest season (${details.length} types):`);
        details.slice(0, 30).forEach(d => {
          const typeName = d.type?.name || d.type?.developer_name || `Type ${d.type_id}`;
          console.log(`  - ${typeName}: ${JSON.stringify(d.value)}`);
        });
      }
    }

    // 4. Check team season statistics (for corners)
    console.log('\n4. Checking team season statistics...');
    const teamResponse = await api.get('/teams/85', { // Man City as example
      params: {
        include: 'statistics.details.type',
      },
    });

    const team = teamResponse.data.data;
    if (team) {
      console.log(`\nTeam: ${team.name}`);
      const teamStats = team.statistics || [];
      console.log(`Seasons with stats: ${teamStats.length}`);

      if (teamStats.length > 0) {
        const latestSeason = teamStats[0];
        const details = latestSeason.details || [];
        console.log(`\nStats available in latest season (${details.length} types):`);
        details.forEach(d => {
          const typeName = d.type?.name || d.type?.developer_name || `Type ${d.type_id}`;
          console.log(`  - ${typeName}: ${JSON.stringify(d.value)}`);
        });
      }
    }

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

checkAvailableStats();
