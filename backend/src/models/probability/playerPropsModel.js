/**
 * Player Props Probability Model
 *
 * Calculates probabilities for player prop bets like:
 * - Shots (Total shots)
 * - Shots on Target (SoT)
 * - Goals
 *
 * Uses Poisson distribution for modeling discrete events.
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

/**
 * Calculate expected shots for a player in a match
 *
 * Factors:
 * - Player's average shots per 90 minutes
 * - Expected minutes in this match
 * - Team's total shots average (for context)
 * - Opponent's shots conceded average
 *
 * @param {Object} playerStats - Player's shooting statistics
 * @param {number} expectedMinutes - Expected minutes player will play (default: 70)
 * @param {Object} teamStats - Team's shooting stats for context
 * @param {Object} opponentStats - Opponent's defensive stats
 * @returns {Object} Expected shots and shots on target
 */
export function calculateExpectedPlayerShots(playerStats, expectedMinutes = 70, teamStats = null, opponentStats = null) {
  const shotsPer90 = playerStats?.shotsPer90 || playerStats?.shots_per_match || 0;
  const sotPer90 = playerStats?.sotPer90 || playerStats?.shots_on_target_per_match || 0;

  // Calculate based on expected minutes
  const minutesFactor = expectedMinutes / 90;

  let expectedShots = shotsPer90 * minutesFactor;
  let expectedSoT = sotPer90 * minutesFactor;

  // Adjust for opponent if available
  if (teamStats && opponentStats) {
    // Team's shooting vs opponent's defensive strength
    const teamShotsAvg = teamStats.average || 10;
    const opponentShotsConceded = opponentStats.shotsConceded || 10;
    const leagueAvg = 10; // Approximate league average shots

    // Adjustment factor based on opponent
    const opponentFactor = opponentShotsConceded / leagueAvg;

    expectedShots *= Math.sqrt(opponentFactor); // Dampened effect
    expectedSoT *= Math.sqrt(opponentFactor);
  }

  // Floor at reasonable minimums
  return {
    shots: Math.max(0.1, expectedShots),
    shotsOnTarget: Math.max(0.05, expectedSoT),
    // SoT rate for reference
    sotRate: shotsPer90 > 0 ? sotPer90 / shotsPer90 : 0.35,
  };
}

/**
 * Calculate shot markets for a player
 *
 * @param {number} expectedShots - Expected shots for player
 * @param {Array<number>} lines - Betting lines (e.g., [0.5, 1.5, 2.5, 3.5])
 * @returns {Array<Object>} Probabilities for each line
 */
export function calculateShotMarkets(expectedShots, lines = [0.5, 1.5, 2.5, 3.5, 4.5]) {
  return lines.map((line) => {
    const threshold = Math.floor(line);
    const overProb = poissonOver(expectedShots, threshold + 1);
    const underProb = poissonUnder(expectedShots, threshold);

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
 * Calculate shots on target markets for a player
 *
 * @param {number} expectedSoT - Expected shots on target
 * @param {Array<number>} lines - Betting lines (e.g., [0.5, 1.5, 2.5])
 * @returns {Array<Object>} Probabilities for each line
 */
export function calculateSoTMarkets(expectedSoT, lines = [0.5, 1.5, 2.5, 3.5]) {
  return lines.map((line) => {
    const threshold = Math.floor(line);
    const overProb = poissonOver(expectedSoT, threshold + 1);
    const underProb = poissonUnder(expectedSoT, threshold);

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
 * Calculate probability that player will have 1+ shots on target
 * Common market: "Player to have 1+ SoT"
 *
 * @param {number} expectedSoT - Expected shots on target
 * @returns {Object} Probability and fair odds
 */
export function calculate1PlusSoT(expectedSoT) {
  const prob = poissonOver(expectedSoT, 1);
  return {
    probability: prob,
    fairOdds: probabilityToOdds(prob),
  };
}

/**
 * Calculate probability that player will have 2+ shots on target
 *
 * @param {number} expectedSoT - Expected shots on target
 * @returns {Object} Probability and fair odds
 */
export function calculate2PlusSoT(expectedSoT) {
  const prob = poissonOver(expectedSoT, 2);
  return {
    probability: prob,
    fairOdds: probabilityToOdds(prob),
  };
}

/**
 * Calculate exact shot distribution
 *
 * @param {number} expectedShots - Expected shots
 * @param {number} max - Maximum shots to calculate
 * @returns {Array<Object>} Distribution
 */
export function calculateExactShotsDistribution(expectedShots, max = 10) {
  return poissonDistribution(expectedShots, max).map(({ value, probability }) => ({
    shots: value,
    probability,
    fairOdds: probabilityToOdds(probability),
  }));
}

/**
 * Find value bets for player shot props
 *
 * @param {Object} shotMarkets - Calculated shot markets
 * @param {Object} bookmakerOdds - Bookmaker odds for each market
 * @param {number} minEdge - Minimum edge to consider (default: 0.03 = 3%)
 * @returns {Array<Object>} Value bets found
 */
export function findPlayerShotValueBets(shotMarkets, bookmakerOdds, minEdge = 0.03) {
  const valueBets = [];

  // Check shot markets
  if (shotMarkets.shots) {
    for (const market of shotMarkets.shots) {
      const overKey = `shots_over_${market.line}`;
      const underKey = `shots_under_${market.line}`;

      if (bookmakerOdds[overKey]) {
        const ev = calculateEV(market.over.probability, bookmakerOdds[overKey]);
        if (ev >= minEdge) {
          valueBets.push({
            type: 'player_shots',
            market: `Shots Over ${market.line}`,
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
            type: 'player_shots',
            market: `Shots Under ${market.line}`,
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
  }

  // Check SoT markets
  if (shotMarkets.shotsOnTarget) {
    for (const market of shotMarkets.shotsOnTarget) {
      const overKey = `sot_over_${market.line}`;
      const underKey = `sot_under_${market.line}`;

      if (bookmakerOdds[overKey]) {
        const ev = calculateEV(market.over.probability, bookmakerOdds[overKey]);
        if (ev >= minEdge) {
          valueBets.push({
            type: 'player_sot',
            market: `SoT Over ${market.line}`,
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
            type: 'player_sot',
            market: `SoT Under ${market.line}`,
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
  }

  return valueBets.sort((a, b) => b.ev - a.ev);
}

/**
 * Analyze player shot props for a match
 *
 * @param {Object} playerStats - Player's historical stats
 * @param {number} expectedMinutes - Expected minutes to play
 * @param {Object} options - Additional options
 * @returns {Object} Complete player shot analysis
 */
export function analyzePlayerShots(playerStats, expectedMinutes = 70, options = {}) {
  const expected = calculateExpectedPlayerShots(
    playerStats,
    expectedMinutes,
    options.teamStats,
    options.opponentStats
  );

  return {
    player: playerStats.name || playerStats.display_name || 'Unknown',
    expectedMinutes,
    expected: {
      shots: expected.shots,
      shotsOnTarget: expected.shotsOnTarget,
      sotRate: expected.sotRate,
    },
    markets: {
      shots: calculateShotMarkets(expected.shots),
      shotsOnTarget: calculateSoTMarkets(expected.shotsOnTarget),
    },
    quickMarkets: {
      '1+_sot': calculate1PlusSoT(expected.shotsOnTarget),
      '2+_sot': calculate2PlusSoT(expected.shotsOnTarget),
    },
    distribution: {
      shots: calculateExactShotsDistribution(expected.shots, 8),
      shotsOnTarget: calculateExactShotsDistribution(expected.shotsOnTarget, 5),
    },
  };
}

/**
 * Batch analyze multiple players for a match
 *
 * @param {Array<Object>} players - Array of player stats
 * @param {Object} matchContext - Match context (team stats, opponent, etc.)
 * @returns {Array<Object>} Analysis for each player
 */
export function analyzeMatchPlayerProps(players, matchContext = {}) {
  return players
    .filter(p => {
      // Filter to players likely to have shot markets (attackers, midfielders with shots)
      const shots = p.shots_per_match || p.shotsPer90 || 0;
      return shots > 0.5; // At least 0.5 shots per match
    })
    .map(player => analyzePlayerShots(player, matchContext.expectedMinutes || 70, {
      teamStats: matchContext.teamStats,
      opponentStats: matchContext.opponentStats,
    }))
    .sort((a, b) => b.expected.shots - a.expected.shots);
}

export default {
  calculateExpectedPlayerShots,
  calculateShotMarkets,
  calculateSoTMarkets,
  calculate1PlusSoT,
  calculate2PlusSoT,
  calculateExactShotsDistribution,
  findPlayerShotValueBets,
  analyzePlayerShots,
  analyzeMatchPlayerProps,
};
