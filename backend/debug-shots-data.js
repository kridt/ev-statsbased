// Debug script to examine actual shot data from SportMonks API
import dotenv from 'dotenv';
dotenv.config();

const SPORTMONKS_API = process.env.SPORTMONKS_API_KEY;

async function debugTeamStats(teamId, teamName) {
  console.log('\n' + '='.repeat(60));
  console.log('Debugging stats for ' + teamName + ' (ID: ' + teamId + ')');
  console.log('='.repeat(60));

  try {
    const url = 'https://api.sportmonks.com/v3/football/teams/' + teamId + '?api_token=' + SPORTMONKS_API + '&include=statistics.details.type';
    const response = await fetch(url);
    const data = await response.json();

    const team = data.data;
    const statistics = team?.statistics || [];

    console.log('\nFound ' + statistics.length + ' season(s) of statistics');

    // Check current season
    const currentSeasonStats = statistics[0]?.details || [];
    console.log('\nCurrent season (ID: ' + statistics[0]?.season_id + ') has ' + currentSeasonStats.length + ' stat types');

    // Find all shot-related stats
    console.log('\n--- SHOT-RELATED STATS ---');
    for (const stat of currentSeasonStats) {
      const typeName = stat.type?.developer_name || stat.type?.name || 'unknown';
      if (typeName.toLowerCase().includes('shot')) {
        console.log('\nStat Type: ' + typeName);
        console.log('Type ID: ' + stat.type_id);
        console.log('Value structure:', JSON.stringify(stat.value, null, 2));
      }
    }

    // Also show corners for comparison
    console.log('\n--- CORNER STATS ---');
    for (const stat of currentSeasonStats) {
      const typeName = stat.type?.developer_name || stat.type?.name || 'unknown';
      if (typeName.toLowerCase().includes('corner')) {
        console.log('\nStat Type: ' + typeName);
        console.log('Value:', JSON.stringify(stat.value, null, 2));
      }
    }

    // Show all stat types available
    console.log('\n--- ALL AVAILABLE STAT TYPES ---');
    for (const stat of currentSeasonStats) {
      const typeName = stat.type?.developer_name || stat.type?.name || 'unknown';
      const valueStr = typeof stat.value === 'object' ? JSON.stringify(stat.value) : stat.value;
      console.log('- ' + typeName + ': ' + valueStr);
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Test with Brighton and Burnley (Premier League teams)
async function main() {
  // Brighton: 78, Burnley: 44
  await debugTeamStats(78, 'Brighton');
  await debugTeamStats(44, 'Burnley');
}

main();
