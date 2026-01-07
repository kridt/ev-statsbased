const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/probability/value-bets?date=2025-12-29&betTypes=player_shots&limit=500',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const result = JSON.parse(data);
    const roma = result.data.filter(d => d.fixture.name.includes('Roma'));
    const romaWithHistory = roma.filter(d => d.playerHistory);
    console.log('Roma vs Genoa total:', roma.length, '- WITH history:', romaWithHistory.length);
    if (romaWithHistory.length > 0) {
      romaWithHistory.slice(0, 3).forEach(p => console.log('  ' + p.player + ': ' + p.playerHistory.averages.shotsPerMatch.toFixed(2) + ' shots/match'));
    }
    const champ = result.data.filter(d => d.fixture.league.name === 'Championship');
    const champWithHistory = champ.filter(d => d.playerHistory);
    console.log('Championship total:', champ.length, '- WITH history:', champWithHistory.length);
    if (champWithHistory.length > 0) {
      champWithHistory.slice(0, 3).forEach(p => console.log('  ' + p.player + ': ' + p.playerHistory.averages.shotsPerMatch.toFixed(2) + ' shots/match'));
    }
  });
});
req.on('error', (e) => console.error('Error: ' + e.message));
req.end();
