/**
 * Probability Calculator Service
 *
 * Calculates probabilities using Poisson distribution and team statistics.
 * Combines season averages with recent form for more accurate predictions.
 */

import sportmonksService from './sportmonks.js';

/**
 * Poisson probability: P(X = k) = (lambda^k * e^(-lambda)) / k!
 */
function poissonProbability(lambda, k) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

/**
 * Factorial function with memoization
 */
const factorialCache = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800];
function factorial(n) {
  if (n < factorialCache.length) return factorialCache[n];
  let result = factorialCache[factorialCache.length - 1];
  for (let i = factorialCache.length; i <= n; i++) {
    result *= i;
    factorialCache[i] = result;
  }
  return result;
}

/**
 * Calculate cumulative Poisson probability P(X <= k)
 */
function poissonCumulative(lambda, k) {
  let sum = 0;
  for (let i = 0; i <= k; i++) {
    sum += poissonProbability(lambda, i);
  }
  return sum;
}

/**
 * Calculate P(X > k) using Poisson
 */
function poissonOver(lambda, k) {
  return 1 - poissonCumulative(lambda, Math.floor(k));
}

/**
 * Calculate P(X < k) using Poisson
 */
function poissonUnder(lambda, k) {
  return poissonCumulative(lambda, Math.ceil(k) - 1);
}

class ProbabilityCalculator {
  constructor() {
    // Form weighting: 50% season, 50% recent (last 5 matches)
    this.seasonWeight = 0.5;
    this.recentWeight = 0.5;
  }

  /**
   * Get weighted team stats combining season averages and recent form
   */
  async getWeightedTeamStats(teamId, isHome) {
    try {
      const [advancedStats, recentMatches] = await Promise.all([
        sportmonksService.getTeamAdvancedStats(teamId),
        sportmonksService.getTeamRecentMatchesWithStats(teamId, 5)
      ]);

      // Extract season stats
      const seasonStats = {
        goalsFor: isHome ? advancedStats.goals?.home?.average : advancedStats.goals?.away?.average,
        goalsAgainst: isHome ? advancedStats.goalsConceded?.home?.average : advancedStats.goalsConceded?.away?.average,
        corners: isHome ? advancedStats.corners?.home?.average : advancedStats.corners?.away?.average,
        shots: advancedStats.shots?.average || 0,
        shotsOnTarget: advancedStats.shots?.onTargetAvg || 0,
        fouls: advancedStats.fouls?.average || 0,
        yellowCards: advancedStats.yellowCards?.average || 0,
        redCards: advancedStats.redCards?.average || 0,
        offsides: isHome ? advancedStats.offsides?.home?.average : advancedStats.offsides?.away?.average,
        throwIns: isHome ? advancedStats.throwIns?.home?.average : advancedStats.throwIns?.away?.average,
      };

      // Calculate recent form stats (last 5 matches, weighted by recency)
      const recentStats = this.calculateRecentFormStats(recentMatches, teamId, isHome);

      // Combine with weights
      const combinedStats = {};
      for (const key of Object.keys(seasonStats)) {
        const seasonVal = seasonStats[key] || 0;
        const recentVal = recentStats[key] || seasonVal;
        combinedStats[key] = (seasonVal * this.seasonWeight) + (recentVal * this.recentWeight);
      }

      return {
        teamId,
        teamName: advancedStats.teamName,
        isHome,
        season: seasonStats,
        recent: recentStats,
        combined: combinedStats,
        matchesAnalyzed: recentMatches.length
      };
    } catch (error) {
      console.error(`[ProbabilityCalculator] Error getting stats for team ${teamId}:`, error.message);
      return null;
    }
  }

  /**
   * Calculate stats from recent matches with recency weighting
   */
  calculateRecentFormStats(matches, teamId, filterHome = null) {
    if (!matches || matches.length === 0) {
      return {};
    }

    // Filter to home/away matches if specified
    const filteredMatches = filterHome !== null
      ? matches.filter(m => m.isHome === filterHome)
      : matches;

    if (filteredMatches.length === 0) {
      return {};
    }

    // Recency weights: most recent match gets highest weight
    const weights = filteredMatches.map((_, i) => Math.pow(0.85, i));
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    const stats = {
      goalsFor: 0,
      goalsAgainst: 0,
      corners: 0,
      shots: 0,
      shotsOnTarget: 0,
      fouls: 0,
      yellowCards: 0,
      redCards: 0,
      offsides: 0,
      throwIns: 0,
    };

    filteredMatches.forEach((match, i) => {
      const weight = weights[i] / totalWeight;
      const teamStats = match.isHome ? match.homeStats : match.awayStats;
      const oppStats = match.isHome ? match.awayStats : match.homeStats;

      stats.goalsFor += (match.isHome ? match.homeScore : match.awayScore) * weight;
      stats.goalsAgainst += (match.isHome ? match.awayScore : match.homeScore) * weight;
      stats.corners += (teamStats.corners || teamStats.corner_kicks || 0) * weight;
      stats.shots += (teamStats.shots_total || teamStats.shots || 0) * weight;
      stats.shotsOnTarget += (teamStats.shots_on_target || 0) * weight;
      stats.fouls += (teamStats.fouls || 0) * weight;
      stats.yellowCards += (teamStats.yellowcards || teamStats.yellow_cards || 0) * weight;
      stats.redCards += (teamStats.redcards || teamStats.red_cards || 0) * weight;
      stats.offsides += (teamStats.offsides || 0) * weight;
      stats.throwIns += (teamStats.throw_ins || teamStats.throwins || 0) * weight;
    });

    return stats;
  }

  /**
   * Calculate expected goals for a match
   */
  calculateExpectedGoals(homeStats, awayStats) {
    // Home team expected goals = avg of (home attack + away defense weakness)
    const homeExpected = (
      (homeStats.combined.goalsFor || 1.3) +
      (awayStats.combined.goalsAgainst || 1.2)
    ) / 2;

    // Away team expected goals = avg of (away attack + home defense weakness)
    const awayExpected = (
      (awayStats.combined.goalsFor || 1.0) +
      (homeStats.combined.goalsAgainst || 1.1)
    ) / 2;

    return {
      home: Math.max(0.3, homeExpected),
      away: Math.max(0.2, awayExpected),
      total: Math.max(0.5, homeExpected + awayExpected)
    };
  }

  /**
   * Calculate probability for Goals Over/Under markets
   */
  calculateGoalsProbability(expectedGoals, line, isOver) {
    const lambda = expectedGoals.total;

    if (isOver) {
      return poissonOver(lambda, line);
    } else {
      return poissonUnder(lambda, line);
    }
  }

  /**
   * Calculate probability for BTTS (Both Teams To Score)
   */
  calculateBttsProbability(expectedGoals, isYes) {
    const homeScoreProb = 1 - poissonProbability(expectedGoals.home, 0);
    const awayScoreProb = 1 - poissonProbability(expectedGoals.away, 0);

    const bttsYesProb = homeScoreProb * awayScoreProb;

    return isYes ? bttsYesProb : (1 - bttsYesProb);
  }

  /**
   * Calculate expected corners for a match
   *
   * CALIBRATION: Real-world match averages are ~10-11 total corners.
   * Team stats often underreport due to data gaps. We apply calibration
   * to align with typical league averages.
   */
  calculateExpectedCorners(homeStats, awayStats) {
    // League average baselines (typical Premier League / Serie A)
    const LEAGUE_AVG_HOME_CORNERS = 5.5;
    const LEAGUE_AVG_AWAY_CORNERS = 4.5;
    const EXPECTED_TOTAL = 10.0; // Typical match average

    // Get team stats (use league average if missing)
    let homeCorners = homeStats.combined.corners || LEAGUE_AVG_HOME_CORNERS;
    let awayCorners = awayStats.combined.corners || LEAGUE_AVG_AWAY_CORNERS;

    // Calculate raw total
    const rawTotal = homeCorners + awayCorners;

    // Apply calibration: if raw total is too low, scale up towards league average
    // This compensates for underreported stats while preserving relative team differences
    if (rawTotal > 0 && rawTotal < EXPECTED_TOTAL * 0.7) {
      // Stats seem underreported, apply calibration factor
      const calibrationFactor = EXPECTED_TOTAL / rawTotal * 0.85; // 85% correction
      homeCorners = homeCorners * calibrationFactor;
      awayCorners = awayCorners * calibrationFactor;
    }

    return {
      home: Math.max(3.0, homeCorners),
      away: Math.max(2.5, awayCorners),
      total: Math.max(6.0, homeCorners + awayCorners)
    };
  }

  /**
   * Calculate probability for Corners Over/Under markets
   */
  calculateCornersProbability(expectedCorners, line, isOver) {
    const lambda = expectedCorners.total;

    if (isOver) {
      return poissonOver(lambda, line);
    } else {
      return poissonUnder(lambda, line);
    }
  }

  /**
   * Calculate expected cards for a match
   */
  calculateExpectedCards(homeStats, awayStats) {
    // League average baselines (typical Premier League / Serie A)
    const LEAGUE_AVG_HOME_CARDS = 1.8;  // ~1.8 yellows per team at home
    const LEAGUE_AVG_AWAY_CARDS = 2.2;  // ~2.2 yellows per team away
    const EXPECTED_TOTAL = 4.0;         // Typical match total ~4 cards

    // Get team stats (use league average if missing)
    let homeCards = homeStats.combined.yellowCards || LEAGUE_AVG_HOME_CARDS;
    let awayCards = awayStats.combined.yellowCards || LEAGUE_AVG_AWAY_CARDS;
    const homeReds = homeStats.combined.redCards || 0.05;
    const awayReds = awayStats.combined.redCards || 0.05;

    // Calculate raw total
    const rawTotal = homeCards + awayCards;

    // Apply calibration: if raw total is too low, scale up towards league average
    if (rawTotal > 0 && rawTotal < EXPECTED_TOTAL * 0.7) {
      const calibrationFactor = EXPECTED_TOTAL / rawTotal * 0.85; // 85% correction
      homeCards = homeCards * calibrationFactor;
      awayCards = awayCards * calibrationFactor;
    }

    // Total cards = yellow + red (red often counts as 2 in some markets)
    return {
      home: Math.max(1.2, homeCards + homeReds),
      away: Math.max(1.5, awayCards + awayReds),
      total: Math.max(3.0, homeCards + awayCards + homeReds + awayReds),
      yellow: homeCards + awayCards,
      red: homeReds + awayReds
    };
  }

  /**
   * Calculate probability for Cards Over/Under markets
   */
  calculateCardsProbability(expectedCards, line, isOver) {
    const lambda = expectedCards.total;

    if (isOver) {
      return poissonOver(lambda, line);
    } else {
      return poissonUnder(lambda, line);
    }
  }

  /**
   * Calculate expected shots for a match
   */
  calculateExpectedShots(homeStats, awayStats) {
    const homeShots = homeStats.combined.shots || 12;
    const awayShots = awayStats.combined.shots || 10;
    const homeSoT = homeStats.combined.shotsOnTarget || 4;
    const awaySoT = awayStats.combined.shotsOnTarget || 3;

    return {
      home: homeShots,
      away: awayShots,
      total: homeShots + awayShots,
      homeOnTarget: homeSoT,
      awayOnTarget: awaySoT,
      totalOnTarget: homeSoT + awaySoT
    };
  }

  /**
   * Calculate probability for Shots Over/Under markets
   */
  calculateShotsProbability(expectedShots, line, isOver, isOnTarget = false) {
    const lambda = isOnTarget ? expectedShots.totalOnTarget : expectedShots.total;

    if (isOver) {
      return poissonOver(lambda, line);
    } else {
      return poissonUnder(lambda, line);
    }
  }

  /**
   * Calculate expected offsides for a match
   */
  calculateExpectedOffsides(homeStats, awayStats) {
    const homeOffsides = homeStats.combined.offsides || 2.0;
    const awayOffsides = awayStats.combined.offsides || 2.0;

    return {
      home: homeOffsides,
      away: awayOffsides,
      total: homeOffsides + awayOffsides
    };
  }

  /**
   * Calculate probability for Offsides Over/Under markets
   */
  calculateOffsidesProbability(expectedOffsides, line, isOver, teamOnly = null) {
    let lambda;
    if (teamOnly === 'home') {
      lambda = expectedOffsides.home;
    } else if (teamOnly === 'away') {
      lambda = expectedOffsides.away;
    } else {
      lambda = expectedOffsides.total;
    }

    if (isOver) {
      return poissonOver(lambda, line);
    } else {
      return poissonUnder(lambda, line);
    }
  }

  /**
   * Calculate expected throw-ins for a match
   */
  calculateExpectedThrowIns(homeStats, awayStats) {
    const homeThrowIns = homeStats.combined.throwIns || 20;
    const awayThrowIns = awayStats.combined.throwIns || 18;

    return {
      home: homeThrowIns,
      away: awayThrowIns,
      total: homeThrowIns + awayThrowIns
    };
  }

  /**
   * Calculate probability for Throw-Ins Over/Under markets
   */
  calculateThrowInsProbability(expectedThrowIns, line, isOver, teamOnly = null) {
    let lambda;
    if (teamOnly === 'home') {
      lambda = expectedThrowIns.home;
    } else if (teamOnly === 'away') {
      lambda = expectedThrowIns.away;
    } else {
      lambda = expectedThrowIns.total;
    }

    if (isOver) {
      return poissonOver(lambda, line);
    } else {
      return poissonUnder(lambda, line);
    }
  }

  /**
   * Main method: Calculate all probabilities for a fixture
   */
  async calculateFixtureProbabilities(homeTeamId, awayTeamId) {
    try {
      const [homeStats, awayStats] = await Promise.all([
        this.getWeightedTeamStats(homeTeamId, true),
        this.getWeightedTeamStats(awayTeamId, false)
      ]);

      if (!homeStats || !awayStats) {
        console.log('[ProbabilityCalculator] Could not get stats for teams');
        return null;
      }

      // Calculate expected values for each market
      const expectedGoals = this.calculateExpectedGoals(homeStats, awayStats);
      const expectedCorners = this.calculateExpectedCorners(homeStats, awayStats);
      const expectedCards = this.calculateExpectedCards(homeStats, awayStats);
      const expectedShots = this.calculateExpectedShots(homeStats, awayStats);
      const expectedOffsides = this.calculateExpectedOffsides(homeStats, awayStats);
      const expectedThrowIns = this.calculateExpectedThrowIns(homeStats, awayStats);

      return {
        homeTeam: {
          id: homeTeamId,
          name: homeStats.teamName,
          stats: homeStats.combined
        },
        awayTeam: {
          id: awayTeamId,
          name: awayStats.teamName,
          stats: awayStats.combined
        },
        expected: {
          goals: expectedGoals,
          corners: expectedCorners,
          cards: expectedCards,
          shots: expectedShots,
          offsides: expectedOffsides,
          throwIns: expectedThrowIns
        },
        // Methods to calculate specific probabilities
        getProbability: (market, line, isOver, options = {}) => {
          return this.getProbabilityForMarket(
            market, line, isOver,
            { expectedGoals, expectedCorners, expectedCards, expectedShots, expectedOffsides, expectedThrowIns },
            options
          );
        }
      };
    } catch (error) {
      console.error('[ProbabilityCalculator] Error calculating probabilities:', error.message);
      return null;
    }
  }

  /**
   * Get probability for a specific market
   */
  getProbabilityForMarket(market, line, isOver, expected, options = {}) {
    const marketLower = market.toLowerCase();

    // UNSUPPORTED MARKETS - Return null immediately
    // These markets require more complex calculations we don't support yet

    // Player props - require individual player statistics
    if (marketLower.includes('player_') ||
        marketLower.includes('anytime_goal_scorer') ||
        marketLower.includes('first_goal_scorer') ||
        marketLower.includes('last_goal_scorer') ||
        marketLower.includes('scorer')) {
      return null;
    }

    // Compound/combo markets - require joint probability calculations
    if (marketLower.includes('moneyline_3-way_+') ||
        marketLower.includes('double_chance') ||
        marketLower.includes('result_+') ||
        marketLower.includes('_and_') ||
        marketLower.includes('_+_')) {
      return null;
    }

    // Half-specific markets - require half-specific stats we don't have
    if (marketLower.includes('1st_half') ||
        marketLower.includes('2nd_half') ||
        marketLower.includes('first_half') ||
        marketLower.includes('second_half') ||
        marketLower.includes('1h_') ||
        marketLower.includes('2h_')) {
      return null;
    }

    // Team-specific totals - need separate home/away probability calculations
    if (marketLower.includes('team_total')) {
      return null;
    }

    // SUPPORTED MARKETS (full match, both teams combined):

    // Total match goals (over/under X.5 goals)
    if (marketLower === 'total_goals' ||
        marketLower === 'asian_total_goals' ||
        (marketLower.includes('total') && marketLower.includes('goal') && !marketLower.includes('team'))) {
      return this.calculateGoalsProbability(expected.expectedGoals, line, isOver);
    }

    // BTTS (Both Teams To Score)
    if (marketLower.includes('btts') || marketLower.includes('both_teams_to_score')) {
      const isYes = options.selection?.toLowerCase() === 'yes' || isOver;
      return this.calculateBttsProbability(expected.expectedGoals, isYes);
    }

    // Total match corners (both teams combined, full match)
    if ((marketLower === 'total_corners' || marketLower === 'asian_total_corners') &&
        !marketLower.includes('team')) {
      return this.calculateCornersProbability(expected.expectedCorners, line, isOver);
    }

    // Total match cards (both teams combined, full match)
    if ((marketLower === 'total_cards' || marketLower === 'total_card_points') &&
        !marketLower.includes('team')) {
      return this.calculateCardsProbability(expected.expectedCards, line, isOver);
    }

    // Total shots - exclude for now (need better stats)
    // if (marketLower.includes('shot')) {
    //   const isOnTarget = marketLower.includes('on_target') || marketLower.includes('sot');
    //   return this.calculateShotsProbability(expected.expectedShots, line, isOver, isOnTarget);
    // }

    // Total offsides - exclude for now (stats often missing)
    // if (marketLower.includes('offside')) {
    //   const teamOnly = options.teamOnly || null;
    //   return this.calculateOffsidesProbability(expected.expectedOffsides, line, isOver, teamOnly);
    // }

    // Total throw-ins - exclude for now (stats often missing)
    // if (marketLower.includes('throw')) {
    //   const teamOnly = options.teamOnly || null;
    //   return this.calculateThrowInsProbability(expected.expectedThrowIns, line, isOver, teamOnly);
    // }

    // Default: return null if market not supported
    console.log(`[ProbabilityCalculator] Unsupported market: ${market}`);
    return null;
  }

  /**
   * Calculate edge for a bet
   * Edge = (probability * decimalOdds) - 1
   */
  calculateEdge(probability, decimalOdds) {
    if (!probability || !decimalOdds) return null;
    return (probability * decimalOdds) - 1;
  }

  /**
   * Calculate fair odds from probability
   */
  calculateFairOdds(probability) {
    if (!probability || probability <= 0) return null;
    return 1 / probability;
  }

  /**
   * Calculate expected value per unit stake
   */
  calculateExpectedValue(probability, decimalOdds, stake = 10) {
    const edge = this.calculateEdge(probability, decimalOdds);
    if (edge === null) return null;
    return edge * stake;
  }
}

// Export singleton instance
export const probabilityCalculator = new ProbabilityCalculator();
export default probabilityCalculator;
