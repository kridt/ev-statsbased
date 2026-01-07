/**
 * Cards Market Probability Model
 *
 * Calculates probabilities for card betting markets:
 * - Total match cards (Over/Under)
 * - Team cards
 * - Player to be carded
 *
 * Uses Poisson distribution with adjustments for:
 * - Team fouling tendencies
 * - Opponent foul-drawing ability
 * - Referee card tendency (future enhancement)
 * - Match importance/rivalry (future enhancement)
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
  calculateAdjustedExpected,
  LEAGUE_AVERAGES,
} from './advancedStats.js';

/**
 * Calculate expected cards for a team
 *
 * @param {Object} teamStats - Team's card/foul statistics
 * @param {Object} opponentStats - Opponent's statistics
 * @param {boolean} isHome - Whether team is playing at home
 * @param {Object} options - Additional options
 * @returns {Object} Expected yellow and red cards
 */
export function calculateExpectedTeamCards(teamStats, opponentStats, isHome = true, options = {}) {
  const { recentForm = null, leagueAvg = LEAGUE_AVERAGES } = options;

  // Base expected from season average
  let baseYellowCards = teamStats?.yellowCards?.average || leagueAvg.yellowCards;
  let baseRedCards = teamStats?.redCards?.average || leagueAvg.redCards;
  let baseFouls = teamStats?.fouls?.average || leagueAvg.fouls;

  // Apply recent form weighting if available
  if (recentForm?.yellowCards?.length > 0) {
    const recentYellowAvg = exponentialWeightedAverage(recentForm.yellowCards, 0.85);
    // Blend recent form with season average (60% recent, 40% season)
    baseYellowCards = recentYellowAvg * 0.6 + baseYellowCards * 0.4;
  }

  // Opponent strength factor (teams that draw more fouls cause more cards)
  const opponentFoulsDrawn = opponentStats?.fouls?.average || leagueAvg.fouls;
  const opponentFactor = calculateOpponentStrengthFactor(
    opponentFoulsDrawn,
    leagueAvg.fouls,
    0.5 // Dampening factor for cards
  );

  // Home/away adjustment (away teams typically get more cards)
  const homeAwayFactor = isHome ? 0.9 : 1.1;

  // Calculate adjusted expected
  const expectedYellow = calculateAdjustedExpected(baseYellowCards, {
    opponentFactor,
    homeAwayFactor,
  });

  const expectedRed = calculateAdjustedExpected(baseRedCards, {
    opponentFactor,
    homeAwayFactor: isHome ? 0.85 : 1.15, // Stronger home/away effect for reds
  });

  return {
    yellow: Math.max(0.1, expectedYellow),
    red: Math.max(0.01, expectedRed),
    total: Math.max(0.1, expectedYellow + expectedRed),
    fouls: baseFouls,
    factors: {
      opponentFactor,
      homeAwayFactor,
    },
  };
}

/**
 * Calculate expected total cards for a match
 *
 * @param {Object} homeTeamStats - Home team statistics
 * @param {Object} awayTeamStats - Away team statistics
 * @param {Object} options - Additional options (including enhancedFactor for referee/weather/derby adjustments)
 * @returns {Object} Expected cards breakdown
 */
export function calculateExpectedMatchCards(homeTeamStats, awayTeamStats, options = {}) {
  const { enhancedFactor = 1.0 } = options;

  const homeExpected = calculateExpectedTeamCards(homeTeamStats, awayTeamStats, true, {
    ...options,
    recentForm: options.homeRecentForm,
  });

  const awayExpected = calculateExpectedTeamCards(awayTeamStats, homeTeamStats, false, {
    ...options,
    recentForm: options.awayRecentForm,
  });

  // Apply enhanced factor (referee, weather, derby, importance adjustments)
  const adjustedHomeYellow = homeExpected.yellow * enhancedFactor;
  const adjustedAwayYellow = awayExpected.yellow * enhancedFactor;
  const adjustedHomeRed = homeExpected.red * enhancedFactor;
  const adjustedAwayRed = awayExpected.red * enhancedFactor;

  return {
    home: {
      ...homeExpected,
      yellow: adjustedHomeYellow,
      red: adjustedHomeRed,
      total: adjustedHomeYellow + adjustedHomeRed,
    },
    away: {
      ...awayExpected,
      yellow: adjustedAwayYellow,
      red: adjustedAwayRed,
      total: adjustedAwayYellow + adjustedAwayRed,
    },
    total: {
      yellow: adjustedHomeYellow + adjustedAwayYellow,
      red: adjustedHomeRed + adjustedAwayRed,
      all: (adjustedHomeYellow + adjustedHomeRed) + (adjustedAwayYellow + adjustedAwayRed),
    },
    enhancedFactorApplied: enhancedFactor,
  };
}

/**
 * Calculate probabilities for total cards markets
 *
 * @param {number} expectedTotal - Expected total cards
 * @param {Array<number>} lines - Betting lines
 * @returns {Array<Object>} Probabilities for each line
 */
export function calculateTotalCardsMarkets(expectedTotal, lines = [2.5, 3.5, 4.5, 5.5, 6.5]) {
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
 * Calculate probabilities for team cards markets
 *
 * @param {number} expectedTeamCards - Expected cards for one team
 * @param {Array<number>} lines - Betting lines
 * @returns {Array<Object>} Probabilities for each line
 */
export function calculateTeamCardsMarkets(expectedTeamCards, lines = [0.5, 1.5, 2.5, 3.5]) {
  return lines.map((line) => {
    const threshold = Math.floor(line);
    const overProb = poissonOver(expectedTeamCards, threshold + 1);
    const underProb = poissonUnder(expectedTeamCards, threshold);

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
 * Calculate probability of a player receiving a card
 *
 * Uses player's historical card rate with adjustments
 *
 * @param {Object} playerStats - Player's card statistics
 * @param {Object} matchContext - Match context (opponent, referee, etc.)
 * @returns {Object} Card probabilities for the player
 */
export function calculatePlayerCardProbability(playerStats, matchContext = {}) {
  const { appearances = 1, yellowCards = 0, redCards = 0, foulsPerMatch = 0 } = playerStats;

  // Base probability from historical rate
  let baseYellowProb = yellowCards / appearances;
  let baseRedProb = redCards / appearances;

  // If player has high foul rate but low cards, they might be "due"
  // (This is a simplification - in reality, this doesn't work statistically)
  const foulsToCardRatio = foulsPerMatch / (baseYellowProb + 0.01);

  // Opponent adjustment (tough opponents = more cards)
  const opponentFactor = matchContext.opponentAggressiveness || 1.0;

  // Apply adjustments
  const adjustedYellowProb = Math.min(0.95, baseYellowProb * opponentFactor);
  const adjustedRedProb = Math.min(0.3, baseRedProb * opponentFactor);

  // Any card probability (1 - probability of no cards)
  const anyCardProb = 1 - (1 - adjustedYellowProb) * (1 - adjustedRedProb);

  return {
    yellow: {
      probability: adjustedYellowProb,
      fairOdds: probabilityToOdds(adjustedYellowProb),
    },
    red: {
      probability: adjustedRedProb,
      fairOdds: probabilityToOdds(adjustedRedProb),
    },
    any: {
      probability: anyCardProb,
      fairOdds: probabilityToOdds(anyCardProb),
    },
    stats: {
      appearances,
      yellowCards,
      redCards,
      foulsPerMatch,
      historicalCardRate: baseYellowProb + baseRedProb,
    },
  };
}

/**
 * Calculate exact total cards distribution
 *
 * @param {number} expectedTotal - Expected total cards
 * @param {number} maxCards - Maximum cards to calculate
 * @returns {Array<Object>} Distribution
 */
export function calculateExactCardsDistribution(expectedTotal, maxCards = 12) {
  return poissonDistribution(expectedTotal, maxCards).map(({ value, probability }) => ({
    cards: value,
    probability,
    fairOdds: probabilityToOdds(probability),
  }));
}

/**
 * Find value bets for card markets
 *
 * @param {Array<Object>} markets - Calculated markets
 * @param {Object} bookmakerOdds - Bookmaker odds
 * @param {number} minEdge - Minimum edge to consider
 * @returns {Array<Object>} Value bets found
 */
export function findCardValueBets(markets, bookmakerOdds, minEdge = 0.02) {
  const valueBets = [];

  for (const market of markets) {
    const overKey = `cards_over_${market.line}`;
    const underKey = `cards_under_${market.line}`;

    if (bookmakerOdds[overKey]) {
      const ev = calculateEV(market.over.probability, bookmakerOdds[overKey]);
      if (ev >= minEdge) {
        valueBets.push({
          type: 'total_cards',
          market: `Over ${market.line} Cards`,
          ourProbability: market.over.probability,
          fairOdds: market.over.fairOdds,
          bookmakerOdds: bookmakerOdds[overKey],
          ev,
          evPercent: (ev * 100).toFixed(2) + '%',
          kelly: kellyStake(market.over.probability, bookmakerOdds[overKey]),
        });
      }
    }

    if (bookmakerOdds[underKey]) {
      const ev = calculateEV(market.under.probability, bookmakerOdds[underKey]);
      if (ev >= minEdge) {
        valueBets.push({
          type: 'total_cards',
          market: `Under ${market.line} Cards`,
          ourProbability: market.under.probability,
          fairOdds: market.under.fairOdds,
          bookmakerOdds: bookmakerOdds[underKey],
          ev,
          evPercent: (ev * 100).toFixed(2) + '%',
          kelly: kellyStake(market.under.probability, bookmakerOdds[underKey]),
        });
      }
    }
  }

  return valueBets.sort((a, b) => b.ev - a.ev);
}

/**
 * Generate full card analysis for a match
 *
 * @param {Object} homeTeamStats - Home team statistics
 * @param {Object} awayTeamStats - Away team statistics
 * @param {Object} options - Additional options
 * @returns {Object} Complete card analysis
 */
export function analyzeMatchCards(homeTeamStats, awayTeamStats, options = {}) {
  const expected = calculateExpectedMatchCards(homeTeamStats, awayTeamStats, options);

  return {
    expected,
    totalMarkets: calculateTotalCardsMarkets(expected.total.all),
    homeTeamMarkets: calculateTeamCardsMarkets(expected.home.total),
    awayTeamMarkets: calculateTeamCardsMarkets(expected.away.total),
    distribution: calculateExactCardsDistribution(expected.total.all, 10),
    insights: generateCardInsights(expected, homeTeamStats, awayTeamStats),
  };
}

/**
 * Generate insights about card expectations
 */
function generateCardInsights(expected, homeStats, awayStats) {
  const insights = [];

  const totalExpected = expected.total.all;

  if (totalExpected > 5) {
    insights.push({
      type: 'high_cards',
      message: 'High card expectation - both teams have aggressive tendencies',
      severity: 'warning',
    });
  }

  if (expected.away.total > expected.home.total * 1.3) {
    insights.push({
      type: 'away_cards',
      message: 'Away team significantly more likely to receive cards',
      severity: 'info',
    });
  }

  if (homeStats?.fouls?.average > 13 || awayStats?.fouls?.average > 13) {
    insights.push({
      type: 'high_fouls',
      message: 'High fouling team(s) - increased card probability',
      severity: 'info',
    });
  }

  return insights;
}

/**
 * Analyze players likely to receive cards in a match
 *
 * @param {Array<Object>} players - Array of player card stats
 * @param {Object} matchContext - Match context
 * @returns {Array<Object>} Players sorted by card probability
 */
export function analyzePlayersForCards(players, matchContext = {}) {
  return players
    .map(player => ({
      ...player,
      probabilities: calculatePlayerCardProbability(player, matchContext),
    }))
    .filter(p => p.probabilities.any.probability > 0.1) // Only show players with >10% card chance
    .sort((a, b) => b.probabilities.any.probability - a.probabilities.any.probability);
}

export default {
  calculateExpectedTeamCards,
  calculateExpectedMatchCards,
  calculateTotalCardsMarkets,
  calculateTeamCardsMarkets,
  calculatePlayerCardProbability,
  calculateExactCardsDistribution,
  findCardValueBets,
  analyzeMatchCards,
  analyzePlayersForCards,
};
