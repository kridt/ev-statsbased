/**
 * Advanced Statistics Utilities
 *
 * Provides functions for:
 * - Exponential decay weighting for recent form
 * - Opponent strength factors
 * - Home/away adjustments
 * - League average calculations
 */

/**
 * Calculate exponentially weighted average
 * More recent values have higher weight
 *
 * @param {Array<number>} values - Array of values (index 0 = most recent)
 * @param {number} decayFactor - Decay rate per match (0.85-0.95 typical)
 * @returns {number} Weighted average
 */
export function exponentialWeightedAverage(values, decayFactor = 0.9) {
  if (!values || values.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  values.forEach((value, index) => {
    const weight = Math.pow(decayFactor, index);
    weightedSum += value * weight;
    totalWeight += weight;
  });

  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/**
 * Calculate form-weighted statistic from recent matches
 *
 * @param {Array<Object>} recentMatches - Array of recent match data
 * @param {string} statKey - The statistic to extract (e.g., 'corners', 'shots')
 * @param {number} teamId - Team ID to get stats for
 * @param {number} decayFactor - Decay rate (default: 0.9)
 * @returns {Object} Weighted stats with home/away splits
 */
export function calculateFormWeightedStats(recentMatches, statKey, teamId, decayFactor = 0.9) {
  const homeValues = [];
  const awayValues = [];
  const allValues = [];

  recentMatches.forEach(match => {
    const isHome = match.homeTeamId === teamId;
    const teamStats = isHome ? match.homeStats : match.awayStats;
    const value = teamStats?.[statKey] ?? 0;

    allValues.push(value);
    if (isHome) {
      homeValues.push(value);
    } else {
      awayValues.push(value);
    }
  });

  return {
    all: exponentialWeightedAverage(allValues, decayFactor),
    home: exponentialWeightedAverage(homeValues, decayFactor),
    away: exponentialWeightedAverage(awayValues, decayFactor),
    sampleSize: {
      all: allValues.length,
      home: homeValues.length,
      away: awayValues.length,
    },
  };
}

/**
 * Calculate opponent strength factor for a specific statistic
 *
 * Factor > 1.0 = opponent is weak defensively (concedes more than average)
 * Factor < 1.0 = opponent is strong defensively (concedes less than average)
 *
 * @param {number} opponentConceded - Opponent's average conceded stat
 * @param {number} leagueAverage - League average for that stat
 * @param {number} dampening - Dampening factor to reduce extreme adjustments (0.5-1.0)
 * @returns {number} Strength factor
 */
export function calculateOpponentStrengthFactor(opponentConceded, leagueAverage, dampening = 0.7) {
  if (!leagueAverage || leagueAverage === 0) return 1.0;
  if (!opponentConceded) return 1.0;

  // Raw factor
  const rawFactor = opponentConceded / leagueAverage;

  // Apply dampening: factor = 1 + (rawFactor - 1) * dampening
  // This reduces extreme adjustments
  const dampenedFactor = 1 + (rawFactor - 1) * dampening;

  // Clamp to reasonable range (0.7 to 1.4)
  return Math.max(0.7, Math.min(1.4, dampenedFactor));
}

/**
 * Calculate home advantage factor
 *
 * @param {number} homeStat - Team's stat when playing at home
 * @param {number} awayStat - Team's stat when playing away
 * @param {boolean} isHome - Whether team is playing at home
 * @returns {number} Home/away adjustment factor
 */
export function calculateHomeAwayFactor(homeStat, awayStat, isHome) {
  if (!homeStat || !awayStat) return 1.0;

  const averageStat = (homeStat + awayStat) / 2;
  if (averageStat === 0) return 1.0;

  if (isHome) {
    return homeStat / averageStat;
  } else {
    return awayStat / averageStat;
  }
}

/**
 * Calculate adjusted expected value using all factors
 *
 * @param {number} baseExpected - Base expected value (season average)
 * @param {Object} factors - Adjustment factors
 * @returns {number} Adjusted expected value
 */
export function calculateAdjustedExpected(baseExpected, factors = {}) {
  const {
    formFactor = 1.0,      // Recent form adjustment
    opponentFactor = 1.0,  // Opponent strength adjustment
    homeAwayFactor = 1.0,  // Home/away adjustment
    weatherFactor = 1.0,   // Weather adjustment (future)
    importanceFactor = 1.0 // Match importance (future)
  } = factors;

  // Combine factors multiplicatively
  const totalFactor = formFactor * opponentFactor * homeAwayFactor * weatherFactor * importanceFactor;

  // Apply with some regression to mean (don't over-adjust)
  const regressionWeight = 0.3;
  const adjustedFactor = totalFactor * (1 - regressionWeight) + 1.0 * regressionWeight;

  return baseExpected * adjustedFactor;
}

/**
 * League average constants (can be updated dynamically)
 * These are approximate values based on typical football statistics
 */
export const LEAGUE_AVERAGES = {
  // Per team per match
  corners: 5.0,
  cornersConceded: 5.0,
  shots: 12.0,
  shotsConceded: 12.0,
  shotsOnTarget: 4.0,
  shotsOnTargetConceded: 4.0,
  fouls: 11.0,
  foulsConceded: 11.0,
  yellowCards: 1.8,
  redCards: 0.05,
  goals: 1.35,
  goalsConceded: 1.35,
  // Offsides - typically 2-3 per team per match
  offsides: 2.2,
  offsidesConceded: 2.2,
  // Throw-ins - typically 20-25 per team per match
  throwIns: 22.0,
  throwInsConceded: 22.0,

  // Match totals
  totalCorners: 10.0,
  totalShots: 24.0,
  totalCards: 3.6,
  totalGoals: 2.7,
  totalOffsides: 4.4,
  totalThrowIns: 44.0,

  // ===== NEW ADVANCED PARAMETERS =====

  // Expected Goals (xG)
  xG: 1.35,                    // Expected goals per team per match
  xGConceded: 1.35,
  totalXG: 2.7,

  // Possession
  possession: 50.0,            // Average possession % per team

  // Set Pieces
  cornerConversionRate: 0.03,  // 3% of corners result in goals
  freeKickConversionRate: 0.05, // 5% direct free kicks score
  penaltyConversionRate: 0.76, // 76% penalties scored
  setPieceGoalsPerMatch: 0.35, // Goals from set pieces per team

  // Physical & Tactical
  pressureIntensity: 10.0,     // PPDA (Passes Per Defensive Action)
  sprintDistance: 110,         // km sprinted per match (team)
  passAccuracy: 82.0,          // % pass completion

  // Time-based goal distribution (% of goals per 15-min interval)
  goalsBy15Min: {
    '0-15': 0.12,
    '15-30': 0.14,
    '30-45': 0.15,
    '45-60': 0.16,
    '60-75': 0.18,
    '75-90': 0.25,             // Most goals late in match
  },

  // Seasonal factors
  earlySeasonFactor: 0.95,     // First 10 games - less predictable
  midSeasonFactor: 1.0,        // Normal
  lateSeasonFactor: 1.05,      // Last 10 games - more variance

  // European competition fatigue
  europeanFatigueFactor: 0.92, // Teams in Europe -8% performance
  midweekMatchPenalty: 0.95,   // Midweek games -5%

  // Travel
  longDistanceTravelKm: 500,   // Threshold for travel fatigue
  travelFatigueFactor: 0.97,   // -3% for long travel
};

/**
 * Calculate all adjustment factors for a team in a match
 *
 * @param {Object} teamData - Team's statistical data
 * @param {Object} opponentData - Opponent's statistical data
 * @param {boolean} isHome - Whether team is playing at home
 * @param {string} statType - Type of stat ('corners', 'shots', 'cards')
 * @returns {Object} All calculated factors
 */
export function calculateAllFactors(teamData, opponentData, isHome, statType) {
  const leagueAvg = LEAGUE_AVERAGES[statType] || 5.0;
  const leagueAvgConceded = LEAGUE_AVERAGES[`${statType}Conceded`] || leagueAvg;

  // Form factor (if recent form data available)
  let formFactor = 1.0;
  if (teamData.recentForm?.[statType]) {
    const recentAvg = teamData.recentForm[statType].all;
    const seasonAvg = teamData.seasonAverage?.[statType] || leagueAvg;
    if (seasonAvg > 0) {
      formFactor = 1 + (recentAvg / seasonAvg - 1) * 0.5; // Dampened
    }
  }

  // Opponent strength factor
  let opponentFactor = 1.0;
  const opponentConceded = opponentData.seasonAverage?.[`${statType}Conceded`] ||
                           opponentData.seasonAverage?.[statType] || // Fallback
                           leagueAvgConceded;
  opponentFactor = calculateOpponentStrengthFactor(opponentConceded, leagueAvgConceded);

  // Home/away factor
  let homeAwayFactor = 1.0;
  if (teamData.seasonAverage?.home?.[statType] && teamData.seasonAverage?.away?.[statType]) {
    homeAwayFactor = calculateHomeAwayFactor(
      teamData.seasonAverage.home[statType],
      teamData.seasonAverage.away[statType],
      isHome
    );
  } else {
    // Default home advantage
    homeAwayFactor = isHome ? 1.05 : 0.95;
  }

  return {
    formFactor,
    opponentFactor,
    homeAwayFactor,
    combined: formFactor * opponentFactor * homeAwayFactor,
  };
}

/**
 * Process recent matches to extract statistics
 *
 * Handles two data formats:
 * 1. Processed format from getTeamRecentMatchesWithStats: { homeStats, awayStats, isHome, homeScore, awayScore }
 * 2. Raw API format: { participants, statistics, scores }
 *
 * @param {Array<Object>} matches - Recent matches (processed or raw)
 * @param {number} teamId - Team ID
 * @returns {Object} Processed stats for each metric
 */
export function processRecentMatches(matches, teamId) {
  const processed = {
    corners: [],
    shots: [],
    shotsOnTarget: [],
    fouls: [],
    yellowCards: [],
    redCards: [],
    goals: [],
    conceded: {
      corners: [],
      shots: [],
      goals: [],
    }
  };

  matches.forEach(match => {
    let teamStats, opponentStats, teamGoals, opponentGoals, isHome;

    // Check if this is already processed data (from getTeamRecentMatchesWithStats)
    if (match.homeStats !== undefined || match.awayStats !== undefined) {
      // Processed format - stats are already extracted
      isHome = match.isHome !== undefined ? match.isHome : (match.homeTeamId === teamId);
      teamStats = isHome ? (match.homeStats || {}) : (match.awayStats || {});
      opponentStats = isHome ? (match.awayStats || {}) : (match.homeStats || {});
      teamGoals = isHome ? (match.homeScore || 0) : (match.awayScore || 0);
      opponentGoals = isHome ? (match.awayScore || 0) : (match.homeScore || 0);
    } else {
      // Raw API format - need to extract stats
      const participants = match.participants || [];
      const homeTeam = participants.find(p => p.meta?.location === 'home');
      const awayTeam = participants.find(p => p.meta?.location === 'away');
      isHome = homeTeam?.id === teamId;

      const statistics = match.statistics || [];

      // Group stats by location
      const homeStats = {};
      const awayStats = {};

      statistics.forEach(stat => {
        const name = (stat.type?.developer_name || stat.type?.name || '').toLowerCase();
        const value = stat.data?.value ?? 0;

        if (stat.location === 'home') {
          homeStats[name] = value;
        } else {
          awayStats[name] = value;
        }
      });

      teamStats = isHome ? homeStats : awayStats;
      opponentStats = isHome ? awayStats : homeStats;

      // Goals from scores
      const scores = match.scores || [];
      const teamScore = scores.find(s =>
        (isHome && s.score?.participant === 'home') ||
        (!isHome && s.score?.participant === 'away')
      );
      const opponentScore = scores.find(s =>
        (isHome && s.score?.participant === 'away') ||
        (!isHome && s.score?.participant === 'home')
      );

      teamGoals = teamScore?.score?.goals || 0;
      opponentGoals = opponentScore?.score?.goals || 0;
    }

    // Extract relevant stats (field names are lowercase from API processing)
    processed.corners.push(teamStats.corners || 0);
    processed.shots.push(teamStats.shots_total || teamStats.shots || 0);
    processed.shotsOnTarget.push(teamStats.shots_on_target || 0);
    processed.fouls.push(teamStats.fouls || 0);
    processed.yellowCards.push(teamStats.yellowcards || teamStats.yellow_cards || 0);
    processed.redCards.push(teamStats.redcards || teamStats.red_cards || 0);
    processed.goals.push(teamGoals);

    // Conceded stats
    processed.conceded.corners.push(opponentStats.corners || 0);
    processed.conceded.shots.push(opponentStats.shots_total || opponentStats.shots || 0);
    processed.conceded.goals.push(opponentGoals);
  });

  return processed;
}

/**
 * Calculate weighted averages for all processed stats
 *
 * @param {Object} processedStats - Output from processRecentMatches
 * @param {number} decayFactor - Decay factor for weighting
 * @returns {Object} Weighted averages for each stat
 */
export function calculateWeightedAverages(processedStats, decayFactor = 0.9) {
  const result = {};

  for (const [key, values] of Object.entries(processedStats)) {
    if (Array.isArray(values)) {
      result[key] = {
        weighted: exponentialWeightedAverage(values, decayFactor),
        simple: values.reduce((a, b) => a + b, 0) / (values.length || 1),
        count: values.length,
        recent3: values.slice(0, 3).reduce((a, b) => a + b, 0) / Math.min(values.length, 3) || 0,
      };
    } else if (typeof values === 'object') {
      result[key] = calculateWeightedAverages(values, decayFactor);
    }
  }

  return result;
}

export default {
  exponentialWeightedAverage,
  calculateFormWeightedStats,
  calculateOpponentStrengthFactor,
  calculateHomeAwayFactor,
  calculateAdjustedExpected,
  calculateAllFactors,
  processRecentMatches,
  calculateWeightedAverages,
  LEAGUE_AVERAGES,
};
