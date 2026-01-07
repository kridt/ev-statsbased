/**
 * Dixon-Coles Model for Football Goal Prediction
 *
 * The Dixon-Coles model improves on simple Poisson by:
 * 1. Using attack/defense strength parameters for each team
 * 2. Applying a correction factor (rho) for low-scoring outcomes (0-0, 1-0, 0-1, 1-1)
 * 3. Incorporating home advantage directly into the model
 * 4. Handling correlated home/away goals
 *
 * Reference: Dixon & Coles (1997) "Modelling Association Football Scores and Inefficiencies in the Football Betting Market"
 */

import { poissonProbability, poissonOver, poissonUnder, probabilityToOdds, calculateEV } from './poisson.js';

/**
 * League-wide average parameters (can be updated with real data)
 * These serve as baseline for attack/defense strength calculations
 */
const LEAGUE_DEFAULTS = {
  avgGoalsPerMatch: 2.7,           // Total goals per match
  avgHomeGoals: 1.52,              // Home team average
  avgAwayGoals: 1.18,              // Away team average
  homeAdvantage: 1.29,             // Home goals / away goals ratio
  rhoParameter: -0.13,             // Dixon-Coles correlation parameter
};

/**
 * Calculate team attack and defense strength ratings
 *
 * Attack strength = Team's goals scored / League average goals
 * Defense strength = Team's goals conceded / League average conceded
 *
 * @param {Object} teamStats - Team's statistical data
 * @param {boolean} isHome - Whether calculating for home or away
 * @returns {Object} Attack and defense strength ratings
 */
export function calculateTeamStrength(teamStats, isHome) {
  const leagueAvgScored = isHome ? LEAGUE_DEFAULTS.avgHomeGoals : LEAGUE_DEFAULTS.avgAwayGoals;
  const leagueAvgConceded = isHome ? LEAGUE_DEFAULTS.avgAwayGoals : LEAGUE_DEFAULTS.avgHomeGoals;

  // Get team's goals scored and conceded (use home/away specific if available)
  const teamScored = isHome
    ? (teamStats?.home?.goalsScored || teamStats?.goalsScored || leagueAvgScored)
    : (teamStats?.away?.goalsScored || teamStats?.goalsScored || leagueAvgScored);

  const teamConceded = isHome
    ? (teamStats?.home?.goalsConceded || teamStats?.goalsConceded || leagueAvgConceded)
    : (teamStats?.away?.goalsConceded || teamStats?.goalsConceded || leagueAvgConceded);

  // Calculate attack and defense strength relative to league average
  const attackStrength = teamScored / leagueAvgScored;
  const defenseStrength = teamConceded / leagueAvgConceded;

  return {
    attack: Math.max(0.5, Math.min(2.0, attackStrength)),   // Clamp to reasonable range
    defense: Math.max(0.5, Math.min(2.0, defenseStrength)), // Clamp to reasonable range
    goalsScored: teamScored,
    goalsConceded: teamConceded,
  };
}

/**
 * Dixon-Coles tau (τ) correction factor
 * Adjusts probabilities for low-scoring outcomes where goals are correlated
 *
 * τ(x,y,λ,μ,ρ) adjusts P(Home=x, Away=y) for:
 * - (0,0): 1 - λμρ
 * - (0,1): 1 + λρ
 * - (1,0): 1 + μρ
 * - (1,1): 1 - ρ
 * - Otherwise: 1 (no adjustment)
 *
 * @param {number} homeGoals - Home team goals
 * @param {number} awayGoals - Away team goals
 * @param {number} lambdaHome - Expected home goals (λ)
 * @param {number} lambdaAway - Expected away goals (μ)
 * @param {number} rho - Correlation parameter (typically -0.1 to -0.2)
 * @returns {number} Tau adjustment factor
 */
export function dixonColesTau(homeGoals, awayGoals, lambdaHome, lambdaAway, rho = LEAGUE_DEFAULTS.rhoParameter) {
  if (homeGoals === 0 && awayGoals === 0) {
    return 1 - lambdaHome * lambdaAway * rho;
  } else if (homeGoals === 0 && awayGoals === 1) {
    return 1 + lambdaHome * rho;
  } else if (homeGoals === 1 && awayGoals === 0) {
    return 1 + lambdaAway * rho;
  } else if (homeGoals === 1 && awayGoals === 1) {
    return 1 - rho;
  }
  return 1; // No adjustment for other scorelines
}

/**
 * Calculate Dixon-Coles probability for a specific scoreline
 *
 * P(Home=x, Away=y) = τ(x,y,λ,μ,ρ) × P_poisson(x;λ) × P_poisson(y;μ)
 *
 * @param {number} homeGoals - Home team goals
 * @param {number} awayGoals - Away team goals
 * @param {number} lambdaHome - Expected home goals
 * @param {number} lambdaAway - Expected away goals
 * @param {number} rho - Correlation parameter
 * @returns {number} Probability of this exact scoreline
 */
export function dixonColesScorelineProbability(homeGoals, awayGoals, lambdaHome, lambdaAway, rho = LEAGUE_DEFAULTS.rhoParameter) {
  const tau = dixonColesTau(homeGoals, awayGoals, lambdaHome, lambdaAway, rho);
  const homeProb = poissonProbability(lambdaHome, homeGoals);
  const awayProb = poissonProbability(lambdaAway, awayGoals);

  return tau * homeProb * awayProb;
}

/**
 * Calculate expected goals using Dixon-Coles methodology
 *
 * λ_home = home_attack × away_defense × league_home_avg × home_advantage_factor
 * μ_away = away_attack × home_defense × league_away_avg
 *
 * @param {Object} homeTeamStats - Home team statistics
 * @param {Object} awayTeamStats - Away team statistics
 * @param {Object} factors - Additional adjustment factors
 * @returns {Object} Expected goals for home and away teams
 */
export function calculateExpectedGoals(homeTeamStats, awayTeamStats, factors = {}) {
  // Calculate team strengths
  const homeStrength = calculateTeamStrength(homeTeamStats, true);
  const awayStrength = calculateTeamStrength(awayTeamStats, false);

  // Base expected goals calculation
  let lambdaHome = homeStrength.attack * awayStrength.defense * LEAGUE_DEFAULTS.avgHomeGoals;
  let lambdaAway = awayStrength.attack * homeStrength.defense * LEAGUE_DEFAULTS.avgAwayGoals;

  // Apply additional factors (weather, form, injuries, etc.)
  const {
    homeFormFactor = 1.0,
    awayFormFactor = 1.0,
    homeInjuryFactor = 1.0,
    awayInjuryFactor = 1.0,
    weatherFactor = 1.0,
    importanceFactor = 1.0,
    xgAdjustment = 1.0,
  } = factors;

  lambdaHome *= homeFormFactor * awayInjuryFactor * weatherFactor * importanceFactor * xgAdjustment;
  lambdaAway *= awayFormFactor * homeInjuryFactor * weatherFactor * importanceFactor * xgAdjustment;

  // Clamp to reasonable ranges
  lambdaHome = Math.max(0.3, Math.min(4.0, lambdaHome));
  lambdaAway = Math.max(0.2, Math.min(3.5, lambdaAway));

  return {
    home: parseFloat(lambdaHome.toFixed(3)),
    away: parseFloat(lambdaAway.toFixed(3)),
    total: parseFloat((lambdaHome + lambdaAway).toFixed(3)),
    homeStrength,
    awayStrength,
  };
}

/**
 * Generate full scoreline probability matrix using Dixon-Coles
 *
 * @param {number} lambdaHome - Expected home goals
 * @param {number} lambdaAway - Expected away goals
 * @param {number} maxGoals - Maximum goals to consider (default: 10)
 * @returns {Object} Scoreline matrix and derived probabilities
 */
export function generateScorelineMatrix(lambdaHome, lambdaAway, maxGoals = 10) {
  const matrix = [];
  let homeWinProb = 0;
  let drawProb = 0;
  let awayWinProb = 0;
  let bttsYesProb = 0;

  // Build scoreline probability matrix
  for (let home = 0; home <= maxGoals; home++) {
    matrix[home] = [];
    for (let away = 0; away <= maxGoals; away++) {
      const prob = dixonColesScorelineProbability(home, away, lambdaHome, lambdaAway);
      matrix[home][away] = prob;

      // Accumulate outcome probabilities
      if (home > away) homeWinProb += prob;
      else if (home === away) drawProb += prob;
      else awayWinProb += prob;

      // BTTS (both teams to score)
      if (home > 0 && away > 0) bttsYesProb += prob;
    }
  }

  // Calculate over/under probabilities for various lines
  const overUnderProbs = {};
  const totalGoalsLines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5];

  totalGoalsLines.forEach(line => {
    let overProb = 0;
    for (let home = 0; home <= maxGoals; home++) {
      for (let away = 0; away <= maxGoals; away++) {
        if (home + away > line) {
          overProb += matrix[home][away];
        }
      }
    }
    overUnderProbs[`over${line}`] = parseFloat(overProb.toFixed(4));
    overUnderProbs[`under${line}`] = parseFloat((1 - overProb).toFixed(4));
  });

  // Most likely scorelines
  const scorelines = [];
  for (let home = 0; home <= 5; home++) {
    for (let away = 0; away <= 5; away++) {
      scorelines.push({
        home,
        away,
        score: `${home}-${away}`,
        probability: matrix[home][away],
      });
    }
  }
  scorelines.sort((a, b) => b.probability - a.probability);

  return {
    matrix,
    outcomes: {
      homeWin: parseFloat(homeWinProb.toFixed(4)),
      draw: parseFloat(drawProb.toFixed(4)),
      awayWin: parseFloat(awayWinProb.toFixed(4)),
      bttsYes: parseFloat(bttsYesProb.toFixed(4)),
      bttsNo: parseFloat((1 - bttsYesProb).toFixed(4)),
    },
    overUnder: overUnderProbs,
    mostLikelyScorelines: scorelines.slice(0, 10),
  };
}

/**
 * Calculate goal-related market probabilities using Dixon-Coles
 *
 * @param {Object} homeTeamStats - Home team statistics
 * @param {Object} awayTeamStats - Away team statistics
 * @param {Object} factors - Adjustment factors
 * @returns {Object} Complete goal market probabilities
 */
export function calculateGoalMarketProbabilities(homeTeamStats, awayTeamStats, factors = {}) {
  // Calculate expected goals using Dixon-Coles methodology
  const xG = calculateExpectedGoals(homeTeamStats, awayTeamStats, factors);

  // Generate scoreline matrix and all derived probabilities
  const scorelineData = generateScorelineMatrix(xG.home, xG.away);

  // Calculate team-specific over/under
  const homeGoalProbs = {};
  const awayGoalProbs = {};
  const teamLines = [0.5, 1.5, 2.5, 3.5];

  teamLines.forEach(line => {
    homeGoalProbs[`over${line}`] = parseFloat(poissonOver(xG.home, Math.ceil(line)).toFixed(4));
    homeGoalProbs[`under${line}`] = parseFloat(poissonUnder(xG.home, Math.floor(line)).toFixed(4));
    awayGoalProbs[`over${line}`] = parseFloat(poissonOver(xG.away, Math.ceil(line)).toFixed(4));
    awayGoalProbs[`under${line}`] = parseFloat(poissonUnder(xG.away, Math.floor(line)).toFixed(4));
  });

  return {
    expectedGoals: xG,
    matchOutcomes: scorelineData.outcomes,
    totalGoals: scorelineData.overUnder,
    homeTeamGoals: homeGoalProbs,
    awayTeamGoals: awayGoalProbs,
    mostLikelyScorelines: scorelineData.mostLikelyScorelines,
    model: 'Dixon-Coles',
    parameters: {
      rho: LEAGUE_DEFAULTS.rhoParameter,
      homeAdvantage: LEAGUE_DEFAULTS.homeAdvantage,
    },
  };
}

/**
 * Compare bookmaker odds with Dixon-Coles fair odds
 *
 * @param {Object} probabilities - Calculated probabilities
 * @param {Object} bookmakerOdds - Bookmaker odds for various markets
 * @returns {Object} Edge analysis for each market
 */
export function analyzeGoalMarketEdge(probabilities, bookmakerOdds) {
  const edges = {};

  // Match outcomes (1X2)
  if (bookmakerOdds.homeWin) {
    const fairOdds = probabilityToOdds(probabilities.matchOutcomes.homeWin);
    edges.homeWin = {
      probability: probabilities.matchOutcomes.homeWin,
      fairOdds: parseFloat(fairOdds.toFixed(2)),
      bookmakerOdds: bookmakerOdds.homeWin,
      edge: parseFloat(calculateEV(probabilities.matchOutcomes.homeWin, bookmakerOdds.homeWin).toFixed(4)),
    };
  }

  if (bookmakerOdds.draw) {
    const fairOdds = probabilityToOdds(probabilities.matchOutcomes.draw);
    edges.draw = {
      probability: probabilities.matchOutcomes.draw,
      fairOdds: parseFloat(fairOdds.toFixed(2)),
      bookmakerOdds: bookmakerOdds.draw,
      edge: parseFloat(calculateEV(probabilities.matchOutcomes.draw, bookmakerOdds.draw).toFixed(4)),
    };
  }

  if (bookmakerOdds.awayWin) {
    const fairOdds = probabilityToOdds(probabilities.matchOutcomes.awayWin);
    edges.awayWin = {
      probability: probabilities.matchOutcomes.awayWin,
      fairOdds: parseFloat(fairOdds.toFixed(2)),
      bookmakerOdds: bookmakerOdds.awayWin,
      edge: parseFloat(calculateEV(probabilities.matchOutcomes.awayWin, bookmakerOdds.awayWin).toFixed(4)),
    };
  }

  // BTTS
  if (bookmakerOdds.bttsYes) {
    edges.bttsYes = {
      probability: probabilities.matchOutcomes.bttsYes,
      fairOdds: parseFloat(probabilityToOdds(probabilities.matchOutcomes.bttsYes).toFixed(2)),
      bookmakerOdds: bookmakerOdds.bttsYes,
      edge: parseFloat(calculateEV(probabilities.matchOutcomes.bttsYes, bookmakerOdds.bttsYes).toFixed(4)),
    };
  }

  // Over/Under markets
  Object.entries(bookmakerOdds).forEach(([market, odds]) => {
    if (market.startsWith('over') || market.startsWith('under')) {
      const prob = probabilities.totalGoals[market];
      if (prob) {
        edges[market] = {
          probability: prob,
          fairOdds: parseFloat(probabilityToOdds(prob).toFixed(2)),
          bookmakerOdds: odds,
          edge: parseFloat(calculateEV(prob, odds).toFixed(4)),
        };
      }
    }
  });

  return edges;
}

/**
 * Update league defaults based on actual league data
 * Call this at the start of each session with fresh league stats
 *
 * @param {Object} leagueStats - League-wide statistics
 */
export function updateLeagueDefaults(leagueStats) {
  if (leagueStats.avgGoalsPerMatch) {
    LEAGUE_DEFAULTS.avgGoalsPerMatch = leagueStats.avgGoalsPerMatch;
  }
  if (leagueStats.avgHomeGoals) {
    LEAGUE_DEFAULTS.avgHomeGoals = leagueStats.avgHomeGoals;
  }
  if (leagueStats.avgAwayGoals) {
    LEAGUE_DEFAULTS.avgAwayGoals = leagueStats.avgAwayGoals;
  }
  if (leagueStats.homeAdvantage) {
    LEAGUE_DEFAULTS.homeAdvantage = leagueStats.homeAdvantage;
  }
}

export default {
  calculateTeamStrength,
  dixonColesTau,
  dixonColesScorelineProbability,
  calculateExpectedGoals,
  generateScorelineMatrix,
  calculateGoalMarketProbabilities,
  analyzeGoalMarketEdge,
  updateLeagueDefaults,
  LEAGUE_DEFAULTS,
};
