const https = require('http');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/probability/value-bets?date=2025-12-28&betTypes=player_shots,player_sot&limit=15',
  method: 'GET'
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const result = JSON.parse(data);
    console.log('=== BUG TEST: Player Props Value Bets ===\n');

    let bugs = [];
    let warnings = [];

    result.data.slice(0, 15).forEach((bet, i) => {
      console.log(`[${i+1}] ${bet.player}: ${bet.market}`);
      console.log(`    Probability: ${(bet.probability*100).toFixed(1)}%`);
      console.log(`    Bookmaker Odds: ${bet.bookmakerOdds} | Fair Odds: ${bet.fairOdds?.toFixed(2)}`);
      console.log(`    Edge: ${(bet.edge*100).toFixed(1)}%`);
      console.log(`    Expected Value (model): ${bet.expectedValue}`);

      if (bet.playerHistory) {
        const avg = bet.playerHistory.averages;
        const isSoT = bet.market.toLowerCase().includes('target');
        const historicalAvg = isSoT ? avg.shotsOnTargetPerMatch : avg.shotsPerMatch;
        const avgLabel = isSoT ? 'SoT' : 'Shots';

        console.log(`    Historical Avg ${avgLabel}: ${historicalAvg.toFixed(2)}`);
        console.log(`    Matches Analyzed: ${avg.matchesAnalyzed}`);

        // BUG CHECK 1: expectedValue should match historical average when >= 1 match
        if (avg.matchesAnalyzed >= 1 && Math.abs(bet.expectedValue - historicalAvg) > 0.1) {
          bugs.push(`BUG: ${bet.player} - expectedValue (${bet.expectedValue.toFixed(2)}) != historical ${avgLabel} avg (${historicalAvg.toFixed(2)})`);
          console.log(`    ** BUG: expectedValue doesn't match historical!`);
        } else if (avg.matchesAnalyzed >= 1) {
          console.log(`    OK: expectedValue matches historical`);
        }

        // BUG CHECK 2: Edge > 100% is suspicious
        if (bet.edge > 1) {
          warnings.push(`WARNING: ${bet.player} - Edge ${(bet.edge*100).toFixed(0)}% is very high`);
          console.log(`    ** WARNING: Edge is very high - verify odds!`);
        }

        // Show matches with minutes
        const withMinutes = bet.playerHistory.matches.filter(m => m.minutes > 0);
        console.log(`    Matches with playing time: ${withMinutes.length}/${bet.playerHistory.matches.length}`);

        // BUG CHECK 3: If player has 0 avg shots but we're betting on shots
        if (avg.shotsPerMatch === 0 && avg.matchesAnalyzed >= 3) {
          bugs.push(`BUG: ${bet.player} has 0 avg shots from ${avg.matchesAnalyzed} matches but we're offering bets`);
        }
      } else {
        console.log(`    No player history available`);
      }
      console.log();
    });

    console.log('\n=== ANALYSIS SUMMARY ===');
    console.log(`Total bets analyzed: ${result.data.length}`);

    // Reasoning checks
    console.log('\n=== REASONING CHECKS ===');

    // Check: Does probability make sense with Poisson distribution?
    result.data.slice(0, 5).forEach(bet => {
      if (bet.playerHistory && bet.playerHistory.averages.matchesAnalyzed >= 1) {
        const isSoT = bet.market.toLowerCase().includes('target');
        const lambda = isSoT
          ? bet.playerHistory.averages.shotsOnTargetPerMatch
          : bet.playerHistory.averages.shotsPerMatch;
        const lambdaLabel = isSoT ? 'SoT' : 'shots';
        const line = parseFloat(bet.market.match(/[\d.]+/)?.[0] || 0);

        // Calculate Poisson probability for Over line
        let probUnder = 0;
        for (let k = 0; k <= line; k++) {
          probUnder += Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
        }
        const expectedProbOver = 1 - probUnder;

        console.log(`${bet.player} - ${bet.market}:`);
        console.log(`  Lambda (avg ${lambdaLabel}): ${lambda.toFixed(2)}`);
        console.log(`  Line: ${line}`);
        console.log(`  Expected Prob (Poisson): ${(expectedProbOver*100).toFixed(1)}%`);
        console.log(`  Actual Prob in system: ${(bet.probability*100).toFixed(1)}%`);

        if (Math.abs(expectedProbOver - bet.probability) > 0.1) {
          bugs.push(`BUG: ${bet.player} - Probability mismatch: expected ${(expectedProbOver*100).toFixed(1)}% but got ${(bet.probability*100).toFixed(1)}%`);
          console.log(`  ** BUG: Probability doesn't match Poisson calculation!`);
        } else {
          console.log(`  OK: Probability matches Poisson calculation`);
        }
      }
    });

    console.log('\n=== BUGS FOUND ===');
    if (bugs.length === 0) {
      console.log('No critical bugs found!');
    } else {
      bugs.forEach(b => console.log(`- ${b}`));
    }

    console.log('\n=== WARNINGS ===');
    if (warnings.length === 0) {
      console.log('No warnings!');
    } else {
      warnings.forEach(w => console.log(`- ${w}`));
    }
  });
});

req.on('error', (e) => console.error(`Error: ${e.message}`));
req.end();

function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
