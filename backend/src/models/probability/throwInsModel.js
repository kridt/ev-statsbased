/**
 * Throw-Ins Market Probability Model
 *
 * Uses team throw-in statistics with advanced adjustments:
 * - Exponential decay weighting for recent form
 * - Playing style factors (wide play = more throw-ins)
 * - Home/away specific averages
 *
 * Applies Poisson distribution for probability calculations.
 */

import {
  poissonOver,
  poissonUnder,
  poissonExact,
  poissonDistribution,
  probabilityToOdds,
  calculateEV,
  kellyStake,
} from './poisson.js';

import {
  exponentialWeightedAverage,
  calculateOpponentStrengthFactor,
  calculateHomeAwayFactor,
  calculateAdjustedExpected,
  LEAGUE_AVERAGES,
} from './advancedStats.js';

/**
 * Calculate expected throw-ins for a team with advanced adjustments
 *
 * @param {Object} teamStats - Team's throw-in statistics
 * @param {Object} opponentStats - Opponent's statistics
 * @param {boolean} isHome - Whether team is playing at home
 * @param {Object} options - Additional options including recent form
 * @returns {Object} Expected throw-ins with breakdown of factors
 */
export function calculateExpectedTeamThrowIns(teamStats, opponentStats, isHome = true, options = {}) {
  const { recentForm = null, decayFactor = 0.85 } = options;
  const leagueAvg = LEAGUE_AVERAGES.throwIns;

  // 1. Get base expected from season average
  let baseExpected = teamStats?.throwIns?.average || teamStats?.average || leagueAvg;

  // 2. Apply home/away specific average if available
  // Home teams typically have slightly more throw-ins due to attacking pressure
  let homeAwayFactor = 1.0;
  if (isHome && teamStats?.throwIns?.home?.average) {
    homeAwayFactor = calculateHomeAwayFactor(
      teamStats.throwIns.home.average,
      teamStats.throwIns.away?.average || teamStats.throwIns.average,
      true
    );
  } else if (!isHome && teamStats?.throwIns?.away?.average) {
    homeAwayFactor = calculateHomeAwayFactor(
      teamStats.throwIns.home?.average || teamStats.throwIns.average,
      teamStats.throwIns.away.average,
      false
    );
  } else {
    // Default home/away adjustment
    homeAwayFactor = isHome ? 1.03 : 0.97;
  }

  // 3. Calculate form factor from recent matches
  let formFactor = 1.0;
  if (recentForm?.throwIns) {
    const recentThrowInAvg = exponentialWeightedAverage(recentForm.throwIns, decayFactor);
    if (baseExpected > 0) {
      const rawFormFactor = recentThrowInAvg / baseExpected;
      formFactor = 1 + (rawFormFactor - 1) * 0.5;
      formFactor = Math.max(0.8, Math.min(1.2, formFactor));
    }
  }

  // 4. Calculate opponent factor
  // Teams that play wider football tend to cause more throw-ins
  const opponentWidthFactor = opponentStats?.playingWidth || 1.0;
  const opponentFactor = calculateOpponentStrengthFactor(
    opponentWidthFactor,
    1.0,
    0.4 // Less dampening for throw-ins
  );

  // 5. Calculate final adjusted expected
  const adjustedExpected = calculateAdjustedExpected(baseExpected, {
    formFactor,
    opponentFactor,
    homeAwayFactor,
  });

  return {
    expected: Math.max(10, adjustedExpected), // Minimum 10 throw-ins expected
    base: baseExpected,
    factors: {
      formFactor: parseFloat(formFactor.toFixed(3)),
      opponentFactor: parseFloat(opponentFactor.toFixed(3)),
      homeAwayFactor: parseFloat(homeAwayFactor.toFixed(3)),
      combined: parseFloat((formFactor * opponentFactor * homeAwayFactor).toFixed(3)),
    },
    recentFormAvg: recentForm?.throwIns ?
      exponentialWeightedAverage(recentForm.throwIns, decayFactor).toFixed(1) : null,
  };
}

/**
 * Calculate expected total throw-ins in a match
 *
 * @param {Object} homeTeamStats - Home team statistics
 * @param {Object} awayTeamStats - Away team statistics
 * @param {Object} options - Options including recent form data
 * @returns {Object} Expected throw-ins with detailed breakdown
 */
export function calculateExpectedMatchThrowIns(homeTeamStats, awayTeamStats, options = {}) {
  const { homeRecentForm = null, awayRecentForm = null, enhancedFactor = 1.0 } = options;

  const homeCalc = calculateExpectedTeamThrowIns(homeTeamStats, awayTeamStats, true, {
    recentForm: homeRecentForm,
    decayFactor: options.decayFactor || 0.85,
  });

  const awayCalc = calculateExpectedTeamThrowIns(awayTeamStats, homeTeamStats, false, {
    recentForm: awayRecentForm,
    decayFactor: options.decayFactor || 0.85,
  });

  // Apply enhanced factor
  const adjustedHome = homeCalc.expected * enhancedFactor;
  const adjustedAway = awayCalc.expected * enhancedFactor;

  return {
    home: adjustedHome,
    away: adjustedAway,
    total: adjustedHome + adjustedAway,
    details: {
      home: { ...homeCalc, expected: adjustedHome },
      away: { ...awayCalc, expected: adjustedAway },
    },
    enhancedFactorApplied: enhancedFactor,
  };
}

/**
 * Calculate probabilities for total throw-ins markets
 *
 * @param {number} expectedTotal - Expected total throw-ins
 * @param {Array<number>} lines - Betting lines to calculate
 * @returns {Array<Object>} Probabilities for each line
 */
export function calculateTotalThrowInsMarkets(expectedTotal, lines = [35.5, 39.5, 43.5, 47.5, 51.5]) {
  return lines.map((line) => {
    const threshold = Math.floor(line);
    const overProb = poissonOver(expectedTotal, threshold + 1);
    const underProb = poissonUnder(expectedTotal, threshold);

    return {
      line,
      over: {
        probability: overProb,
        fairOdds: probabilityToOdds(overProb),
      },
      under: {
        probability: underProb,
        fairOdds: probabilityToOdds(underProb),
      },
    };
  });
}

/**
 * Calculate probabilities for team throw-ins markets
 *
 * @param {number} expectedTeamThrowIns - Expected throw-ins for one team
 * @param {Array<number>} lines - Betting lines to calculate
 * @returns {Array<Object>} Probabilities for each line
 */
export function calculateTeamThrowInsMarkets(expectedTeamThrowIns, lines = [17.5, 19.5, 21.5, 23.5, 25.5]) {
  return lines.map((line) => {
    const threshold = Math.floor(line);
    const overProb = poissonOver(expectedTeamThrowIns, threshold + 1);
    const underProb = poissonUnder(expectedTeamThrowIns, threshold);

    return {
      line,
      over: {
        probability: overProb,
        fairOdds: probabilityToOdds(overProb),
      },
      under: {
        probability: underProb,
        fairOdds: probabilityToOdds(underProb),
      },
    };
  });
}

/**
 * Find value bets by comparing our probabilities to bookmaker odds
 *
 * @param {Array<Object>} markets - Our calculated markets with probabilities
 * @param {Object} bookmakerOdds - Bookmaker odds for each market
 * @param {number} minEdge - Minimum edge to consider as value
 * @returns {Array<Object>} Value bets found
 */
export function findThrowInsValueBets(markets, bookmakerOdds, minEdge = 0.02) {
  const valueBets = [];

  for (const market of markets) {
    const overOddsData = bookmakerOdds[`over_${market.line}`];
    const underOddsData = bookmakerOdds[`under_${market.line}`];

    if (overOddsData) {
      // Extract decimal odds from the object
      const decimalOdds = overOddsData.decimalOdds || overOddsData;
      const ev = calculateEV(market.over.probability, decimalOdds);
      if (ev >= minEdge) {
        valueBets.push({
          type: 'total_throw_ins',
          market: `Over ${market.line}`,
          ourProbability: market.over.probability,
          probability: market.over.probability,
          fairOdds: market.over.fairOdds,
          bookmakerOdds: decimalOdds,
          americanOdds: overOddsData.americanOdds,
          sportsbook: overOddsData.sportsbook,
          edge: ev,
          edgePercent: (ev * 100).toFixed(2) + '%',
          kelly: kellyStake(market.over.probability, decimalOdds),
        });
      }
    }

    if (underOddsData) {
      // Extract decimal odds from the object
      const decimalOdds = underOddsData.decimalOdds || underOddsData;
      const ev = calculateEV(market.under.probability, decimalOdds);
      if (ev >= minEdge) {
        valueBets.push({
          type: 'total_throw_ins',
          market: `Under ${market.line}`,
          ourProbability: market.under.probability,
          probability: market.under.probability,
          fairOdds: market.under.fairOdds,
          bookmakerOdds: decimalOdds,
          americanOdds: underOddsData.americanOdds,
          sportsbook: underOddsData.sportsbook,
          edge: ev,
          edgePercent: (ev * 100).toFixed(2) + '%',
          kelly: kellyStake(market.under.probability, decimalOdds),
        });
      }
    }
  }

  return valueBets.sort((a, b) => b.edge - a.edge);
}

/**
 * Generate full throw-ins analysis for a match
 *
 * @param {Object} homeTeamStats - Home team statistics
 * @param {Object} awayTeamStats - Away team statistics
 * @param {Object} options - Options including recent form
 * @returns {Object} Complete throw-ins analysis
 */
export function analyzeMatchThrowIns(homeTeamStats, awayTeamStats, options = {}) {
  const expected = calculateExpectedMatchThrowIns(homeTeamStats, awayTeamStats, options);

  return {
    expected,
    totalMarkets: calculateTotalThrowInsMarkets(expected.total),
    homeTeamMarkets: calculateTeamThrowInsMarkets(expected.home),
    awayTeamMarkets: calculateTeamThrowInsMarkets(expected.away),
    modelInfo: {
      type: 'advanced',
      factors: ['recentForm', 'opponentStrength', 'homeAway'],
      decayFactor: options.decayFactor || 0.85,
    },
  };
}

export default {
  calculateExpectedTeamThrowIns,
  calculateExpectedMatchThrowIns,
  calculateTotalThrowInsMarkets,
  calculateTeamThrowInsMarkets,
  findThrowInsValueBets,
  analyzeMatchThrowIns,
};
