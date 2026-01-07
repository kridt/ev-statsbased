/**
 * Offsides Market Probability Model
 *
 * Uses team offside statistics with advanced adjustments:
 * - Exponential decay weighting for recent form
 * - Opponent strength factors (pressing teams cause more offsides)
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
 * Calculate expected offsides for a team with advanced adjustments
 *
 * @param {Object} teamStats - Team's offside statistics
 * @param {Object} opponentStats - Opponent's defensive statistics (pressing intensity)
 * @param {boolean} isHome - Whether team is playing at home
 * @param {Object} options - Additional options including recent form
 * @returns {Object} Expected offsides with breakdown of factors
 */
export function calculateExpectedTeamOffsides(teamStats, opponentStats, isHome = true, options = {}) {
  const { recentForm = null, decayFactor = 0.85 } = options;
  const leagueAvg = LEAGUE_AVERAGES.offsides;

  // 1. Get base expected from season average
  let baseExpected = teamStats?.offsides?.average || teamStats?.average || leagueAvg;

  // 2. Apply home/away specific average if available
  // Home teams typically have slightly more attacking play = more offsides
  let homeAwayFactor = 1.0;
  if (isHome && teamStats?.offsides?.home?.average) {
    homeAwayFactor = calculateHomeAwayFactor(
      teamStats.offsides.home.average,
      teamStats.offsides.away?.average || teamStats.offsides.average,
      true
    );
  } else if (!isHome && teamStats?.offsides?.away?.average) {
    homeAwayFactor = calculateHomeAwayFactor(
      teamStats.offsides.home?.average || teamStats.offsides.average,
      teamStats.offsides.away.average,
      false
    );
  } else {
    // Default home/away adjustment - home teams attack more
    homeAwayFactor = isHome ? 1.05 : 0.95;
  }

  // 3. Calculate form factor from recent matches
  let formFactor = 1.0;
  if (recentForm?.offsides) {
    const recentOffsideAvg = exponentialWeightedAverage(recentForm.offsides, decayFactor);
    if (baseExpected > 0) {
      const rawFormFactor = recentOffsideAvg / baseExpected;
      formFactor = 1 + (rawFormFactor - 1) * 0.5;
      formFactor = Math.max(0.7, Math.min(1.3, formFactor));
    }
  }

  // 4. Calculate opponent strength factor
  // Teams that press high cause more offsides - use opponent's pressing intensity
  const opponentPressingFactor = opponentStats?.pressingIntensity || 1.0;
  const opponentFactor = calculateOpponentStrengthFactor(
    opponentPressingFactor,
    1.0,
    0.5 // Dampening
  );

  // 5. Calculate final adjusted expected
  const adjustedExpected = calculateAdjustedExpected(baseExpected, {
    formFactor,
    opponentFactor,
    homeAwayFactor,
  });

  return {
    expected: Math.max(0.5, adjustedExpected),
    base: baseExpected,
    factors: {
      formFactor: parseFloat(formFactor.toFixed(3)),
      opponentFactor: parseFloat(opponentFactor.toFixed(3)),
      homeAwayFactor: parseFloat(homeAwayFactor.toFixed(3)),
      combined: parseFloat((formFactor * opponentFactor * homeAwayFactor).toFixed(3)),
    },
    recentFormAvg: recentForm?.offsides ?
      exponentialWeightedAverage(recentForm.offsides, decayFactor).toFixed(1) : null,
  };
}

/**
 * Calculate expected total offsides in a match
 *
 * @param {Object} homeTeamStats - Home team statistics
 * @param {Object} awayTeamStats - Away team statistics
 * @param {Object} options - Options including recent form data
 * @returns {Object} Expected offsides with detailed breakdown
 */
export function calculateExpectedMatchOffsides(homeTeamStats, awayTeamStats, options = {}) {
  const { homeRecentForm = null, awayRecentForm = null, enhancedFactor = 1.0 } = options;

  const homeCalc = calculateExpectedTeamOffsides(homeTeamStats, awayTeamStats, true, {
    recentForm: homeRecentForm,
    decayFactor: options.decayFactor || 0.85,
  });

  const awayCalc = calculateExpectedTeamOffsides(awayTeamStats, homeTeamStats, false, {
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
 * Calculate probabilities for total offsides markets
 *
 * @param {number} expectedTotal - Expected total offsides
 * @param {Array<number>} lines - Betting lines to calculate
 * @returns {Array<Object>} Probabilities for each line
 */
export function calculateTotalOffsidesMarkets(expectedTotal, lines = [2.5, 3.5, 4.5, 5.5, 6.5]) {
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
 * Calculate probabilities for team offsides markets
 *
 * @param {number} expectedTeamOffsides - Expected offsides for one team
 * @param {Array<number>} lines - Betting lines to calculate
 * @returns {Array<Object>} Probabilities for each line
 */
export function calculateTeamOffsidesMarkets(expectedTeamOffsides, lines = [0.5, 1.5, 2.5, 3.5, 4.5]) {
  return lines.map((line) => {
    const threshold = Math.floor(line);
    const overProb = poissonOver(expectedTeamOffsides, threshold + 1);
    const underProb = poissonUnder(expectedTeamOffsides, threshold);

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
export function findOffsidesValueBets(markets, bookmakerOdds, minEdge = 0.02) {
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
          type: 'total_offsides',
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
          type: 'total_offsides',
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
 * Generate full offsides analysis for a match
 *
 * @param {Object} homeTeamStats - Home team statistics
 * @param {Object} awayTeamStats - Away team statistics
 * @param {Object} options - Options including recent form
 * @returns {Object} Complete offsides analysis
 */
export function analyzeMatchOffsides(homeTeamStats, awayTeamStats, options = {}) {
  const expected = calculateExpectedMatchOffsides(homeTeamStats, awayTeamStats, options);

  return {
    expected,
    totalMarkets: calculateTotalOffsidesMarkets(expected.total),
    homeTeamMarkets: calculateTeamOffsidesMarkets(expected.home),
    awayTeamMarkets: calculateTeamOffsidesMarkets(expected.away),
    modelInfo: {
      type: 'advanced',
      factors: ['recentForm', 'opponentStrength', 'homeAway'],
      decayFactor: options.decayFactor || 0.85,
    },
  };
}

export default {
  calculateExpectedTeamOffsides,
  calculateExpectedMatchOffsides,
  calculateTotalOffsidesMarkets,
  calculateTeamOffsidesMarkets,
  findOffsidesValueBets,
  analyzeMatchOffsides,
};
