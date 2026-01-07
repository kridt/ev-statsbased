// Debug script to examine match-level statistics from SportMonks API
import dotenv from 'dotenv';
dotenv.config();

const SPORTMONKS_API = process.env.SPORTMONKS_API_KEY;

async function debugMatchStats(fixtureId) {
  console.log('\n' + '='.repeat(60));
  console.log('Debugging match stats for fixture ID: ' + fixtureId);
  console.log('='.repeat(60));

  try {
    const url = 'https://api.sportmonks.com/v3/football/fixtures/' + fixtureId + '?api_token=' + SPORTMONKS_API + '&include=participants;statistics.type';
    const response = await fetch(url);
    const data = await response.json();

    const fixture = data.data;
    const participants = fixture?.participants || [];
    const statistics = fixture?.statistics || [];

    const homeTeam = participants.find(p => p.meta?.location === 'home');
    const awayTeam = participants.find(p => p.meta?.location === 'away');

    console.log('\nMatch: ' + (homeTeam?.name || 'Unknown') + ' vs ' + (awayTeam?.name || 'Unknown'));
    console.log('Statistics count: ' + statistics.length);

    // Group by location
    const homeStats = {};
    const awayStats = {};

    for (const stat of statistics) {
      const typeName = stat.type?.developer_name || stat.type?.name || 'type_' + stat.type_id;
      const value = stat.data?.value;

      if (stat.location === 'home') {
        homeStats[typeName] = value;
      } else if (stat.location === 'away') {
        awayStats[typeName] = value;
      }
    }

    console.log('\n--- HOME TEAM STATS (' + (homeTeam?.name || 'Unknown') + ') ---');
    for (const [key, value] of Object.entries(homeStats)) {
      console.log('  ' + key + ': ' + value);
    }

    console.log('\n--- AWAY TEAM STATS (' + (awayTeam?.name || 'Unknown') + ') ---');
    for (const [key, value] of Object.entries(awayStats)) {
      console.log('  ' + key + ': ' + value);
    }

    // Calculate totals for key stats
    console.log('\n--- MATCH TOTALS ---');
    const totalShots = (homeStats['shots-total'] || 0) + (awayStats['shots-total'] || 0);
    const totalCorners = (homeStats['corners'] || 0) + (awayStats['corners'] || 0);
    const totalOffsides = (homeStats['offsides'] || 0) + (awayStats['offsides'] || 0);

    console.log('Total Shots: ' + totalShots);
    console.log('Total Corners: ' + totalCorners);
    console.log('Total Offsides: ' + totalOffsides);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Get a recent completed fixture
async function getRecentFixtures() {
  console.log('Fetching recent completed Premier League fixtures...');

  // Premier League ID is 8
  const url = 'https://api.sportmonks.com/v3/football/fixtures?api_token=' + SPORTMONKS_API + '&filters=fixtureLeagues:8;fixtureStatuses:FT&per_page=5&order=desc';

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.data && data.data.length > 0) {
      console.log('Found ' + data.data.length + ' recent fixtures');

      // Debug the most recent match
      await debugMatchStats(data.data[0].id);

      // Also check another one
      if (data.data.length > 1) {
        await debugMatchStats(data.data[1].id);
      }
    }
  } catch (error) {
    console.error('Error fetching fixtures:', error.message);
  }
}

getRecentFixtures();
