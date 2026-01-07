/**
 * Probability Models Index
 *
 * Central export for all probability calculation modules.
 * Enhanced system v2.0 with:
 * - Dixon-Coles model for correlated goal predictions
 * - Negative Binomial for overdispersed markets
 * - Comprehensive backtesting and calibration
 * - Player/manager impact factors
 * - Line movement and sharp money indicators
 */

// Core probability distributions
export { default as poisson } from './poisson.js';
export {
  poissonProbability,
  poissonOver,
  poissonUnder,
  poissonExact,
  poissonDistribution,
  probabilityToOdds,
  oddsToProbability,
  calculateEV,
  kellyStake,
} from './poisson.js';

// Dixon-Coles model for goals (handles correlation)
export { default as dixonColes } from './dixonColes.js';
export {
  calculateTeamStrength,
  dixonColesTau,
  dixonColesScorelineProbability,
  calculateExpectedGoals,
  generateScorelineMatrix,
  calculateGoalMarketProbabilities,
  analyzeGoalMarketEdge,
  updateLeagueDefaults,
} from './dixonColes.js';

// Negative Binomial for overdispersed markets
export { default as negativeBinomial } from './negativeBinomial.js';
export {
  negativeBinomialProbability,
  negativeBinomialOver,
  negativeBinomialUnder,
  parametersFromMeanVariance,
  selectOptimalDistribution,
  calculateMarketProbabilities,
  compareDistributions,
} from './negativeBinomial.js';

// Advanced statistics and factors
export { default as advancedStats } from './advancedStats.js';
export {
  exponentialWeightedAverage,
  calculateFormWeightedStats,
  calculateOpponentStrengthFactor,
  calculateHomeAwayFactor,
  calculateAdjustedExpected,
  calculateAllFactors,
  processRecentMatches,
  calculateWeightedAverages,
  LEAGUE_AVERAGES,
} from './advancedStats.js';

// Enhanced contextual factors
export { default as enhancedFactors } from './enhancedFactors.js';
export {
  processRefereeStats,
  processWeatherConditions,
  processHeadToHead,
  calculateMatchImportance,
  calculateRestDays,
  detectDerby,
  calculateTimeOfDay,
  generateMatchFactors,
  calculateXGFactor,
  calculatePossessionFactor,
  calculateSetPieceFactor,
  calculateInjuryFactor,
  calculateEuropeanFatigue,
  calculateTravelFactor,
  calculateSeasonalFactor,
  calculateTimePatternFactor,
} from './enhancedFactors.js';

// Player and Manager factors
export { default as playerManagerFactors } from './playerManagerFactors.js';
export {
  calculatePlayerImportance,
  calculateMissingPlayerImpact,
  identifyManagerStyle,
  calculateNewManagerEffect,
  calculatePlayerManagerFactors,
} from './playerManagerFactors.js';

// Line movement and sharp money
export { default as lineMovement } from './lineMovement.js';
export {
  processOddsHistory,
  detectSteamMove,
  detectReverseLine,
  calculateCLV,
  analyzeMarketConsensus,
  analyzeLineMovement,
  estimateSharpSquareSplit,
} from './lineMovement.js';

// Backtesting and calibration
export { default as backtesting } from './backtesting.js';
export {
  calculateBrierScore,
  calculateCalibration,
  calculateROI,
  calculateROIByMarket,
  analyzePerformanceTrend,
  PredictionStore,
  generateBacktestReport,
} from './backtesting.js';

// Market-specific models
export { default as cornersModel } from './cornersModel.js';
export { default as cardsModel } from './cardsModel.js';
export { default as offsidesModel } from './offsidesModel.js';
export { default as throwInsModel } from './throwInsModel.js';

/**
 * Quick reference - Recommended model by market type:
 *
 * GOALS:          Dixon-Coles (handles home/away correlation)
 * CORNERS:        Negative Binomial (overdispersed, clustered)
 * CARDS:          Negative Binomial (highly variable)
 * SHOTS:          Negative Binomial (moderate overdispersion)
 * FOULS:          Negative Binomial (variable by referee)
 * OFFSIDES:       Poisson (close to theoretical)
 * THROW-INS:      Poisson (close to theoretical)
 *
 * Always apply enhanced factors for contextual adjustment.
 */

export const MODEL_RECOMMENDATIONS = {
  goals: { model: 'Dixon-Coles', overdispersion: 1.1, note: 'Handles home/away correlation' },
  corners: { model: 'Negative Binomial', overdispersion: 1.35, note: 'Corners cluster in phases' },
  cards: { model: 'Negative Binomial', overdispersion: 1.6, note: 'Highly referee-dependent' },
  shots: { model: 'Negative Binomial', overdispersion: 1.25, note: 'Moderate variation' },
  fouls: { model: 'Negative Binomial', overdispersion: 1.4, note: 'Referee-dependent' },
  offsides: { model: 'Poisson', overdispersion: 1.0, note: 'Near theoretical distribution' },
  throwIns: { model: 'Poisson', overdispersion: 1.0, note: 'Near theoretical distribution' },
};
