const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/probability/value-bets?date=2025-12-29&betTypes=player_shots&limit=50',
  method: 'GET'
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const result = JSON.parse(data);
    const withHistory = result.data.filter(d => d.playerHistory !== null);
    const withoutHistory = result.data.filter(d => d.playerHistory === null);

    console.log('Total players:', result.data.length);
    console.log('Players WITH history:', withHistory.length);
    console.log('Players WITHOUT history:', withoutHistory.length);

    if (withHistory.length > 0) {
      console.log('\nSample WITH history:');
      withHistory.slice(0, 3).forEach(p => {
        console.log(`  ${p.player} (${p.fixture.name}): ${p.playerHistory.averages.shotsPerMatch.toFixed(2)} shots/match`);
      });
    }

    console.log('\nSample WITHOUT history:');
    withoutHistory.slice(0, 5).forEach(p => {
      console.log(`  ${p.player} (${p.fixture.name})`);
    });
  });
});

req.on('error', (e) => console.error(`Error: ${e.message}`));
req.end();
