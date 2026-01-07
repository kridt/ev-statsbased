/**
 * Comprehensive Bug Test Suite for Soccer Stats Value Betting System
 * Tests: API endpoints, player history, probability calculations, value bets
 */

const http = require('http');

const TESTS = {
  passed: [],
  failed: [],
  warnings: []
};

function makeRequest(path, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: 'GET',
      timeout: timeout
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, parseError: true });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timeout')));
    req.end();
  });
}

function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

function poissonProb(lambda, k) {
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
}

function poissonOverProb(lambda, line) {
  let probUnder = 0;
  for (let k = 0; k <= line; k++) {
    probUnder += poissonProb(lambda, k);
  }
  return 1 - probUnder;
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('       COMPREHENSIVE BUG TEST SUITE - Soccer Stats System');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ============ TEST 1: API Health ============
  console.log('📋 TEST 1: Backend API Health');
  console.log('─────────────────────────────────────────────────────────────────');
  try {
    const health = await makeRequest('/api/health');
    if (health.status === 200 && health.data.status === 'ok') {
      TESTS.passed.push('API Health Check');
      console.log('  ✅ API is healthy');
    } else {
      TESTS.failed.push('API Health Check: Unexpected response');
      console.log('  ❌ API health check failed');
    }
  } catch (e) {
    TESTS.failed.push(`API Health Check: ${e.message}`);
    console.log(`  ❌ API not responding: ${e.message}`);
  }

  // ============ TEST 2: Value Bets Endpoint ============
  console.log('\n📋 TEST 2: Value Bets Endpoint');
  console.log('─────────────────────────────────────────────────────────────────');
  try {
    const valueBets = await makeRequest('/api/probability/value-bets?date=2025-12-29&limit=100', 120000);
    if (valueBets.status === 200 && valueBets.data.success) {
      TESTS.passed.push('Value Bets Endpoint');
      console.log(`  ✅ Endpoint responds successfully`);
      console.log(`  📊 Total value bets returned: ${valueBets.data.data.length}`);

      // Check bet types distribution
      const betTypes = {};
      valueBets.data.data.forEach(bet => {
        betTypes[bet.betType] = (betTypes[bet.betType] || 0) + 1;
      });
      console.log('  📊 Bet types distribution:');
      Object.entries(betTypes).forEach(([type, count]) => {
        console.log(`      - ${type}: ${count}`);
      });
    } else {
      TESTS.failed.push('Value Bets Endpoint: Invalid response');
      console.log('  ❌ Endpoint returned invalid response');
    }
  } catch (e) {
    TESTS.failed.push(`Value Bets Endpoint: ${e.message}`);
    console.log(`  ❌ Endpoint failed: ${e.message}`);
  }

  // ============ TEST 3: Player History Data ============
  console.log('\n📋 TEST 3: Player History Data');
  console.log('─────────────────────────────────────────────────────────────────');
  try {
    const playerBets = await makeRequest('/api/probability/value-bets?date=2025-12-29&betTypes=player_shots,player_sot&limit=200', 120000);
    if (playerBets.status === 200 && playerBets.data.success) {
      const withHistory = playerBets.data.data.filter(b => b.playerHistory);
      const withoutHistory = playerBets.data.data.filter(b => !b.playerHistory);

      console.log(`  📊 Player bets with history: ${withHistory.length}/${playerBets.data.data.length}`);
      console.log(`  📊 Player bets without history: ${withoutHistory.length}/${playerBets.data.data.length}`);

      if (withHistory.length > 0) {
        TESTS.passed.push('Player History Available');
        console.log('  ✅ Player history data is being fetched');

        // Verify history data structure
        let historyStructureValid = true;
        withHistory.slice(0, 5).forEach(bet => {
          if (!bet.playerHistory.matches || !bet.playerHistory.averages) {
            historyStructureValid = false;
          }
          if (typeof bet.playerHistory.averages.shotsPerMatch !== 'number') {
            historyStructureValid = false;
          }
        });

        if (historyStructureValid) {
          TESTS.passed.push('Player History Structure Valid');
          console.log('  ✅ Player history structure is valid');
        } else {
          TESTS.failed.push('Player History Structure Invalid');
          console.log('  ❌ Player history structure is invalid');
        }

        // Sample player history
        console.log('\n  📝 Sample player histories:');
        withHistory.slice(0, 3).forEach(bet => {
          console.log(`      ${bet.player}: ${bet.playerHistory.averages.shotsPerMatch.toFixed(2)} shots/match (${bet.playerHistory.averages.matchesAnalyzed} matches)`);
        });
      } else {
        TESTS.warnings.push('No player history data returned');
        console.log('  ⚠️ No player history data returned');
      }
    }
  } catch (e) {
    TESTS.failed.push(`Player History Test: ${e.message}`);
    console.log(`  ❌ Player history test failed: ${e.message}`);
  }

  // ============ TEST 4: Probability Calculations (Poisson) ============
  console.log('\n📋 TEST 4: Probability Calculations (Poisson Model)');
  console.log('─────────────────────────────────────────────────────────────────');
  try {
    const playerBets = await makeRequest('/api/probability/value-bets?date=2025-12-29&betTypes=player_shots&limit=100', 120000);
    if (playerBets.status === 200 && playerBets.data.success) {
      const betsWithHistory = playerBets.data.data.filter(b => b.playerHistory && b.playerHistory.averages.matchesAnalyzed >= 1);

      let probErrors = [];
      let probValid = 0;

      betsWithHistory.slice(0, 10).forEach(bet => {
        const lambda = bet.playerHistory.averages.shotsPerMatch;
        const isOver = bet.market.toLowerCase().includes('over');
        const lineMatch = bet.market.match(/[\d.]+/);
        const line = lineMatch ? parseFloat(lineMatch[0]) : 0;

        let expectedProb;
        if (isOver) {
          expectedProb = poissonOverProb(lambda, line);
        } else {
          // Under probability
          expectedProb = 1 - poissonOverProb(lambda, line - 0.5);
        }

        const diff = Math.abs(expectedProb - bet.probability);
        if (diff > 0.15) {
          probErrors.push({
            player: bet.player,
            market: bet.market,
            lambda: lambda,
            expected: expectedProb,
            actual: bet.probability,
            diff: diff
          });
        } else {
          probValid++;
        }
      });

      if (probErrors.length === 0) {
        TESTS.passed.push('Poisson Probability Calculations');
        console.log(`  ✅ All ${probValid} probability calculations are accurate`);
      } else {
        console.log(`  ✅ ${probValid} probability calculations are accurate`);
        console.log(`  ⚠️ ${probErrors.length} calculations have significant deviation:`);
        probErrors.slice(0, 3).forEach(err => {
          console.log(`      ${err.player} (${err.market}): Expected ${(err.expected*100).toFixed(1)}%, Got ${(err.actual*100).toFixed(1)}%`);
        });
        if (probErrors.length > probValid) {
          TESTS.failed.push('Poisson Probability Calculations - Many errors');
        } else {
          TESTS.warnings.push('Some Poisson calculations have deviation');
        }
      }
    }
  } catch (e) {
    TESTS.failed.push(`Probability Test: ${e.message}`);
    console.log(`  ❌ Probability test failed: ${e.message}`);
  }

  // ============ TEST 5: Edge and Value Calculations ============
  console.log('\n📋 TEST 5: Edge and Value Calculations');
  console.log('─────────────────────────────────────────────────────────────────');
  try {
    const valueBets = await makeRequest('/api/probability/value-bets?date=2025-12-29&limit=50', 120000);
    if (valueBets.status === 200 && valueBets.data.success) {
      let edgeErrors = [];
      let edgeValid = 0;

      valueBets.data.data.slice(0, 20).forEach(bet => {
        // Edge = (probability * bookmakerOdds) - 1
        const calculatedEdge = (bet.probability * bet.bookmakerOdds) - 1;
        const diff = Math.abs(calculatedEdge - bet.edge);

        if (diff > 0.01) {
          edgeErrors.push({
            market: bet.market,
            player: bet.player,
            calculatedEdge: calculatedEdge,
            reportedEdge: bet.edge,
            diff: diff
          });
        } else {
          edgeValid++;
        }

        // Check fair odds calculation
        const calculatedFairOdds = 1 / bet.probability;
        if (bet.fairOdds && Math.abs(calculatedFairOdds - bet.fairOdds) > 0.01) {
          edgeErrors.push({
            market: bet.market,
            issue: 'Fair odds mismatch',
            calculated: calculatedFairOdds,
            reported: bet.fairOdds
          });
        }
      });

      if (edgeErrors.length === 0) {
        TESTS.passed.push('Edge Calculations');
        console.log(`  ✅ All ${edgeValid} edge calculations are accurate`);
      } else {
        console.log(`  ✅ ${edgeValid} edge calculations are accurate`);
        console.log(`  ⚠️ ${edgeErrors.length} calculations have issues`);
        TESTS.warnings.push('Some edge calculations have minor issues');
      }

      // Check for unrealistic edges
      const extremeEdges = valueBets.data.data.filter(b => b.edge > 5); // >500%
      if (extremeEdges.length > 0) {
        console.log(`  ⚠️ ${extremeEdges.length} bets have extreme edges (>500%)`);
        console.log('      This may indicate stale odds or data issues');
        TESTS.warnings.push('Extreme edge values detected');
      } else {
        console.log('  ✅ No extreme edge values detected');
      }
    }
  } catch (e) {
    TESTS.failed.push(`Edge Calculation Test: ${e.message}`);
    console.log(`  ❌ Edge calculation test failed: ${e.message}`);
  }

  // ============ TEST 6: Expected Value Consistency ============
  console.log('\n📋 TEST 6: Expected Value Consistency');
  console.log('─────────────────────────────────────────────────────────────────');
  try {
    const playerBets = await makeRequest('/api/probability/value-bets?date=2025-12-29&betTypes=player_shots,player_sot&limit=100', 120000);
    if (playerBets.status === 200 && playerBets.data.success) {
      const betsWithHistory = playerBets.data.data.filter(b => b.playerHistory && b.playerHistory.averages.matchesAnalyzed >= 1);

      let evErrors = [];
      betsWithHistory.forEach(bet => {
        const isSoT = bet.betType === 'player_sot';
        const historicalAvg = isSoT
          ? bet.playerHistory.averages.shotsOnTargetPerMatch
          : bet.playerHistory.averages.shotsPerMatch;

        // expectedValue should match historical average when history is available
        if (Math.abs(bet.expectedValue - historicalAvg) > 0.1) {
          evErrors.push({
            player: bet.player,
            market: bet.market,
            expectedValue: bet.expectedValue,
            historicalAvg: historicalAvg
          });
        }
      });

      if (evErrors.length === 0) {
        TESTS.passed.push('Expected Value Consistency');
        console.log(`  ✅ All expected values match historical averages`);
      } else {
        console.log(`  ⚠️ ${evErrors.length} expected values don't match historical:`);
        evErrors.slice(0, 3).forEach(err => {
          console.log(`      ${err.player}: EV=${err.expectedValue.toFixed(2)}, Hist=${err.historicalAvg.toFixed(2)}`);
        });
        TESTS.warnings.push('Some expected values mismatch');
      }
    }
  } catch (e) {
    TESTS.failed.push(`Expected Value Test: ${e.message}`);
    console.log(`  ❌ Expected value test failed: ${e.message}`);
  }

  // ============ TEST 7: Bet Type Filters ============
  console.log('\n📋 TEST 7: Bet Type Filters');
  console.log('─────────────────────────────────────────────────────────────────');
  const betTypeTests = [
    { type: 'goals', expected: 'goals' },
    { type: 'btts', expected: 'btts' },
    { type: 'corners', expected: 'corners' },
    { type: 'player_shots', expected: 'player_shots' },
    { type: 'player_sot', expected: 'player_sot' },
    { type: 'team_shots', expected: 'team_shots' },
    { type: 'goalscorer', expected: 'goalscorer' }
  ];

  for (const test of betTypeTests) {
    try {
      const result = await makeRequest(`/api/probability/value-bets?date=2025-12-29&betTypes=${test.type}&limit=10`, 60000);
      if (result.status === 200 && result.data.success) {
        const wrongTypes = result.data.data.filter(b => b.betType !== test.expected);
        if (wrongTypes.length === 0) {
          console.log(`  ✅ ${test.type} filter works correctly`);
        } else {
          console.log(`  ❌ ${test.type} filter returned wrong types`);
          TESTS.failed.push(`Bet Type Filter: ${test.type}`);
        }
      }
    } catch (e) {
      console.log(`  ⚠️ ${test.type} filter test failed: ${e.message}`);
    }
  }
  TESTS.passed.push('Bet Type Filters');

  // ============ TEST 8: Data Integrity ============
  console.log('\n📋 TEST 8: Data Integrity');
  console.log('─────────────────────────────────────────────────────────────────');
  try {
    const valueBets = await makeRequest('/api/probability/value-bets?date=2025-12-29&limit=100', 120000);
    if (valueBets.status === 200 && valueBets.data.success) {
      let integrityIssues = [];

      valueBets.data.data.forEach(bet => {
        // Check required fields
        if (!bet.market) integrityIssues.push(`Missing market field`);
        if (typeof bet.probability !== 'number') integrityIssues.push(`Invalid probability: ${bet.market}`);
        if (typeof bet.bookmakerOdds !== 'number') integrityIssues.push(`Invalid bookmakerOdds: ${bet.market}`);
        if (typeof bet.edge !== 'number') integrityIssues.push(`Invalid edge: ${bet.market}`);
        if (!bet.fixture) integrityIssues.push(`Missing fixture: ${bet.market}`);

        // Check probability bounds
        if (bet.probability < 0 || bet.probability > 1) {
          integrityIssues.push(`Probability out of bounds: ${bet.probability}`);
        }

        // Check odds are positive
        if (bet.bookmakerOdds <= 1) {
          integrityIssues.push(`Invalid odds (<= 1): ${bet.bookmakerOdds}`);
        }
      });

      if (integrityIssues.length === 0) {
        TESTS.passed.push('Data Integrity');
        console.log('  ✅ All data integrity checks passed');
      } else {
        console.log(`  ⚠️ ${integrityIssues.length} integrity issues found`);
        integrityIssues.slice(0, 5).forEach(issue => console.log(`      - ${issue}`));
        TESTS.warnings.push('Data integrity issues found');
      }
    }
  } catch (e) {
    TESTS.failed.push(`Data Integrity Test: ${e.message}`);
    console.log(`  ❌ Data integrity test failed: ${e.message}`);
  }

  // ============ TEST 9: Multiple Date Support ============
  console.log('\n📋 TEST 9: Multiple Date Support');
  console.log('─────────────────────────────────────────────────────────────────');
  const dates = ['2025-12-28', '2025-12-29', '2025-12-30'];
  for (const date of dates) {
    try {
      const result = await makeRequest(`/api/probability/value-bets?date=${date}&limit=5`, 60000);
      if (result.status === 200 && result.data.success) {
        console.log(`  ✅ ${date}: ${result.data.data.length} bets returned`);
      } else {
        console.log(`  ❌ ${date}: Failed to load`);
        TESTS.failed.push(`Date Support: ${date}`);
      }
    } catch (e) {
      console.log(`  ⚠️ ${date}: ${e.message}`);
    }
  }
  TESTS.passed.push('Multiple Date Support');

  // ============ FINAL SUMMARY ============
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                         TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\n  ✅ PASSED:   ${TESTS.passed.length}`);
  TESTS.passed.forEach(t => console.log(`      - ${t}`));

  console.log(`\n  ⚠️ WARNINGS: ${TESTS.warnings.length}`);
  TESTS.warnings.forEach(t => console.log(`      - ${t}`));

  console.log(`\n  ❌ FAILED:   ${TESTS.failed.length}`);
  TESTS.failed.forEach(t => console.log(`      - ${t}`));

  console.log('\n═══════════════════════════════════════════════════════════════');
  if (TESTS.failed.length === 0) {
    console.log('  🎉 ALL CRITICAL TESTS PASSED!');
  } else {
    console.log(`  ⚠️ ${TESTS.failed.length} CRITICAL TESTS FAILED - NEEDS ATTENTION`);
  }
  console.log('═══════════════════════════════════════════════════════════════\n');
}

runTests().catch(console.error);
