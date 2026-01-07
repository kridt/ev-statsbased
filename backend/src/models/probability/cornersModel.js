/**
 * Corners Market Probability Model (Enhanced)
 *
 * Uses team corner statistics with advanced adjustments:
 * - Exponential decay weighting for recent form
 * - Opponent strength factors
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
  processRecentMatches,
  calculateWeightedAverages,
  LEAGUE_AVERAGES,
} from './advancedStats.js';

/**
 * Calculate expected corners for a team with advanced adjustments
 *
 * @param {Object} teamStats - Team's corner statistics (with home/away splits)
 * @param {Object} opponentStats - Opponent's corner statistics
 * @param {boolean} isHome - Whether team is playing at home
 * @param {Object} options - Additional options including recent form
 * @returns {Object} Expected corners with breakdown of factors
 */
export function calculateExpectedTeamCorners(teamStats, opponentStats, isHome = true, options = {}) {
  const { recentForm = null, decayFactor = 0.85 } = options;
  const leagueAvg = LEAGUE_AVERAGES.corners;

  // 1. Get base expected from season average
  let baseExpected = teamStats?.average || leagueAvg;

  // 2. Apply home/away specific average if available
  let homeAwayFactor = 1.0;
  if (isHome && teamStats?.home?.average) {
    homeAwayFactor = calculateHomeAwayFactor(
      teamStats.home.average,
      teamStats.away?.average || teamStats.average,
      true
    );
  } else if (!isHome && teamStats?.away?.average) {
    homeAwayFactor = calculateHomeAwayFactor(
      teamStats.home?.average || teamStats.average,
      teamStats.away.average,
      false
    );
  } else {
    // Default home/away adjustment
    homeAwayFactor = isHome ? 1.08 : 0.92;
  }

  // 3. Calculate form factor from recent matches
  let formFactor = 1.0;
  if (recentForm?.corners) {
    const recentCornerAvg = exponentialWeightedAverage(recentForm.corners, decayFactor);
    if (baseExpected > 0) {
      // Compare recent form to season average
      const rawFormFactor = recentCornerAvg / baseExpected;
      // Dampen the effect (regression to mean)
      formFactor = 1 + (rawFormFactor - 1) * 0.5;
      // Clamp to reasonable range
      formFactor = Math.max(0.7, Math.min(1.3, formFactor));
    }
  }

  // 4. Calculate opponent strength factor
  // Teams with higher possession tend to concede more corners
  const opponentCorners = opponentStats?.average || leagueAvg;
  const opponentFactor = calculateOpponentStrengthFactor(
    leagueAvg / opponentCorners, // Inverse - teams with fewer corners concede more
    1.0,
    0.6 // Dampening
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
    recentFormAvg: recentForm?.corners ?
      exponentialWeightedAverage(recentForm.corners, decayFactor).toFixed(1) : null,
  };
}

/**
 * Calculate expected total corners in a match with advanced model
 *
 * @param {Object} homeTeamStats - Home team corner statistics
 * @param {Object} awayTeamStats - Away team corner statistics
 * @param {Object} options - Options including recent form data and enhancedFactor for weather/H2H adjustments
 * @returns {Object} Expected corners with detailed breakdown
 */
export function calculateExpectedMatchCorners(homeTeamStats, awayTeamStats, options = {}) {
  const { homeRecentForm = null, awayRecentForm = null, enhancedFactor = 1.0 } = options;

  const homeCalc = calculateExpectedTeamCorners(homeTeamStats, awayTeamStats, true, {
    recentForm: homeRecentForm,
    decayFactor: options.decayFactor || 0.85,
  });

  const awayCalc = calculateExpectedTeamCorners(awayTeamStats, homeTeamStats, false, {
    recentForm: awayRecentForm,
    decayFactor: options.decayFactor || 0.85,
  });

  // Apply enhanced factor (weather, H2H, importance adjustments)
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
 * Calculate probabilities for total corners markets
 *
 * @param {number} expectedTotal - Expected total corners
 * @param {Array<number>} lines - Betting lines to calculate (e.g., [8.5, 9.5, 10.5, 11.5])
 * @returns {Array<Object>} Probabilities for each line
 */
export function calculateTotalCornersMarkets(expectedTotal, lines = [7.5, 8.5, 9.5, 10.5, 11.5, 12.5]) {
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
 * Calculate probabilities for team corners markets
 *
 * @param {number} expectedTeamCorners - Expected corners for one team
 * @param {Array<number>} lines - Betting lines to calculate
 * @returns {Array<Object>} Probabilities for each line
 */
export function calculateTeamCornersMarkets(expectedTeamCorners, lines = [3.5, 4.5, 5.5, 6.5, 7.5]) {
  return lines.map((line) => {
    const threshold = Math.floor(line);
    const overProb = poissonOver(expectedTeamCorners, threshold + 1);
    const underProb = poissonUnder(expectedTeamCorners, threshold);

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
 * Calculate corner handicap probabilities
 *
 * @param {number} homeExpected - Expected home corners
 * @param {number} awayExpected - Expected away corners
 * @param {Array<number>} handicaps - Handicap lines
 * @returns {Array<Object>} Probabilities for each handicap
 */
export function calculateCornerHandicap(homeExpected, awayExpected, handicaps = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]) {
  const maxCorners = 20;
  const homeDist = poissonDistribution(homeExpected, maxCorners);
  const awayDist = poissonDistribution(awayExpected, maxCorners);

  // Build difference distribution
  const diffProbs = {};
  for (const h of homeDist) {
    for (const a of awayDist) {
      const diff = h.value - a.value;
      diffProbs[diff] = (diffProbs[diff] || 0) + h.probability * a.probability;
    }
  }

  return handicaps.map((handicap) => {
    let homeWinProb = 0;
    let awayWinProb = 0;

    for (const [diffStr, prob] of Object.entries(diffProbs)) {
      const diff = parseInt(diffStr);
      const adjustedDiff = diff + handicap;

      if (adjustedDiff > 0) {
        homeWinProb += prob;
      } else if (adjustedDiff < 0) {
        awayWinProb += prob;
      }
    }

    return {
      handicap,
      home: {
        probability: homeWinProb,
        fairOdds: probabilityToOdds(homeWinProb),
      },
      away: {
        probability: awayWinProb,
        fairOdds: probabilityToOdds(awayWinProb),
      },
    };
  });
}

/**
 * Calculate exact total corners probabilities
 *
 * @param {number} expectedTotal - Expected total corners
 * @param {number} maxCorners - Maximum corners to calculate
 * @returns {Array<Object>} Probability for each exact total
 */
export function calculateExactTotalCorners(expectedTotal, maxCorners = 20) {
  return poissonDistribution(expectedTotal, maxCorners).map(({ value, probability }) => ({
    total: value,
    probability,
    fairOdds: probabilityToOdds(probability),
  }));
}

/**
 * Find value bets by comparing our probabilities to bookmaker odds
 *
 * @param {Array<Object>} markets - Our calculated markets with probabilities
 * @param {Object} bookmakerOdds - Bookmaker odds for each market
 * @param {number} minEdge - Minimum edge to consider as value
 * @returns {Array<Object>} Value bets found
 */
export function findCornerValueBets(markets, bookmakerOdds, minEdge = 0.02) {
  const valueBets = [];

  for (const market of markets) {
    const overOdds = bookmakerOdds[`over_${market.line}`];
    const underOdds = bookmakerOdds[`under_${market.line}`];

    if (overOdds) {
      const ev = calculateEV(market.over.probability, overOdds);
      if (ev >= minEdge) {
        valueBets.push({
          type: 'total_corners',
          market: `Over ${market.line}`,
          ourProbability: market.over.probability,
          fairOdds: market.over.fairOdds,
          bookmakerOdds: overOdds,
          ev: ev,
          evPercent: (ev * 100).toFixed(2) + '%',
          kelly: kellyStake(market.over.probability, overOdds),
        });
      }
    }

    if (underOdds) {
      const ev = calculateEV(market.under.probability, underOdds);
      if (ev >= minEdge) {
        valueBets.push({
          type: 'total_corners',
          market: `Under ${market.line}`,
          ourProbability: market.under.probability,
          fairOdds: market.under.fairOdds,
          bookmakerOdds: underOdds,
          ev: ev,
          evPercent: (ev * 100).toFixed(2) + '%',
          kelly: kellyStake(market.under.probability, underOdds),
        });
      }
    }
  }

  return valueBets.sort((a, b) => b.ev - a.ev);
}

/**
 * Generate full corner analysis for a match with advanced model
 *
 * @param {Object} homeTeamStats - Home team statistics
 * @param {Object} awayTeamStats - Away team statistics
 * @param {Object} options - Options including recent form
 * @returns {Object} Complete corner analysis
 */
export function analyzeMatchCorners(homeTeamStats, awayTeamStats, options = {}) {
  const expected = calculateExpectedMatchCorners(homeTeamStats, awayTeamStats, options);

  return {
    expected,
    totalMarkets: calculateTotalCornersMarkets(expected.total),
    homeTeamMarkets: calculateTeamCornersMarkets(expected.home),
    awayTeamMarkets: calculateTeamCornersMarkets(expected.away),
    handicapMarkets: calculateCornerHandicap(expected.home, expected.away),
    exactTotals: calculateExactTotalCorners(expected.total, 15),
    modelInfo: {
      type: 'advanced',
      factors: ['recentForm', 'opponentStrength', 'homeAway'],
      decayFactor: options.decayFactor || 0.85,
    },
  };
}

/**
 * Generate insights about the corner prediction
 *
 * @param {Object} analysis - Result from analyzeMatchCorners
 * @param {Object} homeTeamStats - Home team stats
 * @param {Object} awayTeamStats - Away team stats
 * @returns {Array<Object>} Insights
 */
export function generateCornerInsights(analysis, homeTeamStats, awayTeamStats) {
  const insights = [];
  const { expected, details } = analysis.expected;

  // Check for strong form factors
  if (details?.home?.factors?.formFactor > 1.15) {
    insights.push({
      type: 'form',
      team: 'home',
      message: 'Home team in strong corner-winning form recently',
      impact: 'positive',
    });
  }

  if (details?.away?.factors?.formFactor > 1.15) {
    insights.push({
      type: 'form',
      team: 'away',
      message: 'Away team in strong corner-winning form recently',
      impact: 'positive',
    });
  }

  // Check for opponent mismatch
  if (details?.home?.factors?.opponentFactor > 1.1) {
    insights.push({
      type: 'matchup',
      message: 'Favorable matchup for home team corners',
      impact: 'positive',
    });
  }

  // High/low total expected
  if (analysis.expected.total > 11) {
    insights.push({
      type: 'total',
      message: 'High corner expectation - consider Over markets',
      impact: 'info',
    });
  } else if (analysis.expected.total < 8) {
    insights.push({
      type: 'total',
      message: 'Low corner expectation - consider Under markets',
      impact: 'info',
    });
  }

  return insights;
}

export default {
  calculateExpectedTeamCorners,
  calculateExpectedMatchCorners,
  calculateTotalCornersMarkets,
  calculateTeamCornersMarkets,
  calculateCornerHandicap,
  calculateExactTotalCorners,
  findCornerValueBets,
  analyzeMatchCorners,
  generateCornerInsights,
};
