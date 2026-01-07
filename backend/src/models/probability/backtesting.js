/**
 * Backtesting Framework for Probability Model Validation
 *
 * This module provides:
 * - Prediction storage and tracking
 * - Brier score calculation (measures probability accuracy)
 * - Calibration analysis (are 60% predictions winning 60%?)
 * - ROI tracking by market type
 * - Performance analytics over time
 */

import fs from 'fs/promises';
import path from 'path';

// Default storage path for prediction logs
const DEFAULT_STORAGE_PATH = path.join(process.cwd(), 'data', 'predictions');

/**
 * Prediction record structure
 */
const createPredictionRecord = (prediction) => ({
  id: prediction.id || `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  timestamp: prediction.timestamp || new Date().toISOString(),
  matchId: prediction.matchId,
  matchDate: prediction.matchDate,
  homeTeam: prediction.homeTeam,
  awayTeam: prediction.awayTeam,
  league: prediction.league,
  marketType: prediction.marketType,           // 'goals', 'corners', 'cards', etc.
  betType: prediction.betType,                 // 'over2.5', 'under10.5', etc.
  line: prediction.line,                       // The betting line (e.g., 2.5, 10.5)
  predictedProbability: prediction.predictedProbability,
  bookmakerOdds: prediction.bookmakerOdds,
  bookmakerImpliedProb: prediction.bookmakerOdds ? 1 / prediction.bookmakerOdds : null,
  edge: prediction.edge,                       // Our edge over bookmaker
  recommendedStake: prediction.recommendedStake,
  modelVersion: prediction.modelVersion || '2.0',
  factors: prediction.factors || {},           // Contributing factors
  // To be filled after match completion
  outcome: null,                               // true = won, false = lost, null = pending
  actualValue: null,                           // Actual stat value (goals, corners, etc.)
  settled: false,
  settledAt: null,
  profit: null,                                // Profit/loss if bet was placed
});

/**
 * Calculate Brier Score for a set of predictions
 * Brier Score = (1/n) × Σ(probability - outcome)²
 *
 * Lower is better:
 * - 0.00 = Perfect predictions
 * - 0.25 = Random guessing (50% predictions)
 * - >0.25 = Worse than random
 *
 * @param {Array} predictions - Array of settled predictions with outcomes
 * @returns {Object} Brier score analysis
 */
export function calculateBrierScore(predictions) {
  const settled = predictions.filter(p => p.settled && p.outcome !== null);

  if (settled.length === 0) {
    return {
      score: null,
      sampleSize: 0,
      interpretation: 'No settled predictions',
    };
  }

  let sumSquaredError = 0;
  settled.forEach(pred => {
    const outcome = pred.outcome ? 1 : 0;
    const error = pred.predictedProbability - outcome;
    sumSquaredError += error * error;
  });

  const brierScore = sumSquaredError / settled.length;

  // Interpretation
  let interpretation;
  if (brierScore < 0.15) interpretation = 'Excellent - significantly better than baseline';
  else if (brierScore < 0.20) interpretation = 'Good - better than random';
  else if (brierScore < 0.25) interpretation = 'Fair - slightly better than random';
  else if (brierScore < 0.30) interpretation = 'Poor - close to or worse than random';
  else interpretation = 'Very Poor - worse than random guessing';

  return {
    score: parseFloat(brierScore.toFixed(4)),
    sampleSize: settled.length,
    interpretation,
    // Brier Skill Score (BSS) relative to climatology (baseline probability)
    skillScore: null, // Would need baseline probability to calculate
  };
}

/**
 * Calculate calibration metrics
 * Groups predictions by probability buckets and compares to actual win rate
 *
 * @param {Array} predictions - Settled predictions
 * @param {number} buckets - Number of probability buckets (default: 10)
 * @returns {Object} Calibration analysis
 */
export function calculateCalibration(predictions, buckets = 10) {
  const settled = predictions.filter(p => p.settled && p.outcome !== null);

  if (settled.length < 20) {
    return {
      buckets: [],
      calibrationError: null,
      sampleSize: settled.length,
      interpretation: 'Insufficient data for calibration (need 20+ predictions)',
    };
  }

  // Create buckets
  const bucketSize = 1 / buckets;
  const bucketData = Array(buckets).fill(null).map((_, i) => ({
    rangeMin: i * bucketSize,
    rangeMax: (i + 1) * bucketSize,
    rangeMid: (i + 0.5) * bucketSize,
    predictions: [],
    wins: 0,
    total: 0,
    actualWinRate: 0,
  }));

  // Assign predictions to buckets
  settled.forEach(pred => {
    const bucketIndex = Math.min(
      Math.floor(pred.predictedProbability * buckets),
      buckets - 1
    );
    bucketData[bucketIndex].predictions.push(pred);
    bucketData[bucketIndex].total++;
    if (pred.outcome) bucketData[bucketIndex].wins++;
  });

  // Calculate actual win rates
  let totalCalibrationError = 0;
  let calibrationSampleSize = 0;

  bucketData.forEach(bucket => {
    if (bucket.total > 0) {
      bucket.actualWinRate = bucket.wins / bucket.total;
      // Expected Calibration Error (ECE) contribution
      const expectedProb = bucket.rangeMid;
      const error = Math.abs(bucket.actualWinRate - expectedProb);
      totalCalibrationError += error * bucket.total;
      calibrationSampleSize += bucket.total;
    }
  });

  const expectedCalibrationError = calibrationSampleSize > 0
    ? totalCalibrationError / calibrationSampleSize
    : null;

  // Interpretation
  let interpretation;
  if (expectedCalibrationError === null) interpretation = 'Insufficient data';
  else if (expectedCalibrationError < 0.03) interpretation = 'Excellent calibration';
  else if (expectedCalibrationError < 0.06) interpretation = 'Good calibration';
  else if (expectedCalibrationError < 0.10) interpretation = 'Moderate calibration';
  else interpretation = 'Poor calibration - model may be overconfident or underconfident';

  return {
    buckets: bucketData.map(b => ({
      range: `${(b.rangeMin * 100).toFixed(0)}-${(b.rangeMax * 100).toFixed(0)}%`,
      expectedWinRate: parseFloat((b.rangeMid * 100).toFixed(1)),
      actualWinRate: parseFloat((b.actualWinRate * 100).toFixed(1)),
      count: b.total,
      wins: b.wins,
      deviation: parseFloat(((b.actualWinRate - b.rangeMid) * 100).toFixed(1)),
    })),
    expectedCalibrationError: expectedCalibrationError ? parseFloat(expectedCalibrationError.toFixed(4)) : null,
    sampleSize: calibrationSampleSize,
    interpretation,
  };
}

/**
 * Calculate ROI (Return on Investment) by market type
 *
 * @param {Array} predictions - Settled predictions with profit data
 * @param {Object} options - Filter options
 * @returns {Object} ROI analysis
 */
export function calculateROI(predictions, options = {}) {
  const {
    marketType = null,      // Filter by specific market
    minEdge = 0,            // Minimum edge to include
    dateFrom = null,        // Start date filter
    dateTo = null,          // End date filter
    stakingModel = 'flat',  // 'flat', 'kelly', 'proportional'
    unitStake = 1,          // Base stake unit
  } = options;

  let filtered = predictions.filter(p => p.settled && p.outcome !== null);

  // Apply filters
  if (marketType) filtered = filtered.filter(p => p.marketType === marketType);
  if (minEdge > 0) filtered = filtered.filter(p => p.edge >= minEdge);
  if (dateFrom) filtered = filtered.filter(p => new Date(p.matchDate) >= new Date(dateFrom));
  if (dateTo) filtered = filtered.filter(p => new Date(p.matchDate) <= new Date(dateTo));

  if (filtered.length === 0) {
    return {
      roi: null,
      profit: 0,
      totalStaked: 0,
      betsPlaced: 0,
      winRate: null,
      interpretation: 'No qualifying predictions',
    };
  }

  let totalProfit = 0;
  let totalStaked = 0;
  let wins = 0;

  filtered.forEach(pred => {
    // Calculate stake based on staking model
    let stake = unitStake;
    if (stakingModel === 'kelly' && pred.recommendedStake) {
      stake = unitStake * pred.recommendedStake * 100; // Kelly as percentage of bankroll
    } else if (stakingModel === 'proportional' && pred.edge) {
      stake = unitStake * (1 + pred.edge); // Scale stake by edge
    }

    totalStaked += stake;

    if (pred.outcome) {
      // Win: profit = stake × (odds - 1)
      totalProfit += stake * (pred.bookmakerOdds - 1);
      wins++;
    } else {
      // Loss: lose the stake
      totalProfit -= stake;
    }
  });

  const roi = totalStaked > 0 ? (totalProfit / totalStaked) * 100 : 0;
  const winRate = (wins / filtered.length) * 100;

  // Interpretation
  let interpretation;
  if (roi > 10) interpretation = 'Excellent - strong profitable edge';
  else if (roi > 5) interpretation = 'Good - sustainable profit';
  else if (roi > 0) interpretation = 'Positive - marginal profit';
  else if (roi > -5) interpretation = 'Break-even - small loss';
  else interpretation = 'Negative - losing money';

  return {
    roi: parseFloat(roi.toFixed(2)),
    profit: parseFloat(totalProfit.toFixed(2)),
    totalStaked: parseFloat(totalStaked.toFixed(2)),
    betsPlaced: filtered.length,
    wins,
    losses: filtered.length - wins,
    winRate: parseFloat(winRate.toFixed(1)),
    avgOdds: parseFloat((filtered.reduce((sum, p) => sum + p.bookmakerOdds, 0) / filtered.length).toFixed(2)),
    avgEdge: parseFloat((filtered.reduce((sum, p) => sum + (p.edge || 0), 0) / filtered.length * 100).toFixed(2)),
    stakingModel,
    interpretation,
  };
}

/**
 * Calculate ROI breakdown by market type
 *
 * @param {Array} predictions - All settled predictions
 * @returns {Object} ROI by market
 */
export function calculateROIByMarket(predictions) {
  const marketTypes = [...new Set(predictions.map(p => p.marketType))];
  const results = {};

  marketTypes.forEach(market => {
    results[market] = calculateROI(predictions, { marketType: market });
  });

  // Sort by ROI
  const sorted = Object.entries(results)
    .sort((a, b) => (b[1].roi || 0) - (a[1].roi || 0));

  return {
    byMarket: Object.fromEntries(sorted),
    bestMarket: sorted[0]?.[0] || null,
    worstMarket: sorted[sorted.length - 1]?.[0] || null,
    totalSummary: calculateROI(predictions),
  };
}

/**
 * Analyze performance over time (trend analysis)
 *
 * @param {Array} predictions - Settled predictions
 * @param {string} groupBy - 'day', 'week', 'month'
 * @returns {Object} Performance trend
 */
export function analyzePerformanceTrend(predictions, groupBy = 'week') {
  const settled = predictions.filter(p => p.settled && p.matchDate);

  if (settled.length === 0) {
    return { periods: [], trend: 'insufficient data' };
  }

  // Sort by date
  settled.sort((a, b) => new Date(a.matchDate) - new Date(b.matchDate));

  // Group by period
  const groups = {};
  settled.forEach(pred => {
    const date = new Date(pred.matchDate);
    let key;

    if (groupBy === 'day') {
      key = date.toISOString().split('T')[0];
    } else if (groupBy === 'week') {
      const week = Math.floor(date.getTime() / (7 * 24 * 60 * 60 * 1000));
      key = `Week ${week}`;
    } else {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    if (!groups[key]) groups[key] = [];
    groups[key].push(pred);
  });

  // Calculate metrics per period
  const periods = Object.entries(groups).map(([period, preds]) => {
    const roi = calculateROI(preds);
    const brier = calculateBrierScore(preds);

    return {
      period,
      bets: preds.length,
      roi: roi.roi,
      profit: roi.profit,
      winRate: roi.winRate,
      brierScore: brier.score,
      cumulativeProfit: 0, // Will be calculated below
    };
  });

  // Calculate cumulative profit
  let cumulative = 0;
  periods.forEach(p => {
    cumulative += p.profit || 0;
    p.cumulativeProfit = parseFloat(cumulative.toFixed(2));
  });

  // Determine trend
  let trend = 'stable';
  if (periods.length >= 3) {
    const recentROI = periods.slice(-3).reduce((sum, p) => sum + (p.roi || 0), 0) / 3;
    const earlierROI = periods.slice(0, Math.min(3, periods.length)).reduce((sum, p) => sum + (p.roi || 0), 0) / Math.min(3, periods.length);

    if (recentROI > earlierROI + 3) trend = 'improving';
    else if (recentROI < earlierROI - 3) trend = 'declining';
  }

  return {
    periods,
    trend,
    totalPeriods: periods.length,
    bestPeriod: periods.reduce((best, p) => (p.roi || 0) > (best.roi || -999) ? p : best, periods[0]),
    worstPeriod: periods.reduce((worst, p) => (p.roi || 0) < (worst.roi || 999) ? p : worst, periods[0]),
  };
}

/**
 * Prediction Storage Class
 * Handles saving and loading predictions for backtesting
 */
export class PredictionStore {
  constructor(storagePath = DEFAULT_STORAGE_PATH) {
    this.storagePath = storagePath;
    this.predictions = [];
    this.loaded = false;
  }

  async ensureDirectory() {
    try {
      await fs.mkdir(this.storagePath, { recursive: true });
    } catch (err) {
      // Directory exists, ignore
    }
  }

  async load() {
    await this.ensureDirectory();
    const filePath = path.join(this.storagePath, 'predictions.json');

    try {
      const data = await fs.readFile(filePath, 'utf-8');
      this.predictions = JSON.parse(data);
      this.loaded = true;
    } catch (err) {
      // File doesn't exist yet
      this.predictions = [];
      this.loaded = true;
    }

    return this.predictions;
  }

  async save() {
    await this.ensureDirectory();
    const filePath = path.join(this.storagePath, 'predictions.json');
    await fs.writeFile(filePath, JSON.stringify(this.predictions, null, 2));
  }

  async addPrediction(prediction) {
    if (!this.loaded) await this.load();

    const record = createPredictionRecord(prediction);
    this.predictions.push(record);
    await this.save();
    return record;
  }

  async settlePrediction(predictionId, outcome, actualValue) {
    if (!this.loaded) await this.load();

    const pred = this.predictions.find(p => p.id === predictionId || p.matchId === predictionId);
    if (pred) {
      pred.outcome = outcome;
      pred.actualValue = actualValue;
      pred.settled = true;
      pred.settledAt = new Date().toISOString();

      // Calculate profit/loss
      if (outcome && pred.bookmakerOdds) {
        pred.profit = pred.bookmakerOdds - 1; // Profit per unit staked
      } else if (!outcome) {
        pred.profit = -1; // Loss per unit staked
      }

      await this.save();
    }

    return pred;
  }

  async settleByMatch(matchId, results) {
    if (!this.loaded) await this.load();

    const matchPredictions = this.predictions.filter(p => p.matchId === matchId && !p.settled);

    for (const pred of matchPredictions) {
      // Determine outcome based on actual value and bet type
      const actualValue = results[pred.marketType];
      if (actualValue !== undefined) {
        let outcome;

        if (pred.betType.startsWith('over')) {
          outcome = actualValue > pred.line;
        } else if (pred.betType.startsWith('under')) {
          outcome = actualValue < pred.line;
        } else {
          // Exact or other bet types
          outcome = actualValue === pred.line;
        }

        pred.outcome = outcome;
        pred.actualValue = actualValue;
        pred.settled = true;
        pred.settledAt = new Date().toISOString();

        if (outcome && pred.bookmakerOdds) {
          pred.profit = pred.bookmakerOdds - 1;
        } else {
          pred.profit = -1;
        }
      }
    }

    await this.save();
    return matchPredictions.filter(p => p.settled);
  }

  getStats() {
    return {
      total: this.predictions.length,
      pending: this.predictions.filter(p => !p.settled).length,
      settled: this.predictions.filter(p => p.settled).length,
      brier: calculateBrierScore(this.predictions),
      calibration: calculateCalibration(this.predictions),
      roi: calculateROIByMarket(this.predictions),
      trend: analyzePerformanceTrend(this.predictions),
    };
  }

  getPendingPredictions() {
    return this.predictions.filter(p => !p.settled);
  }

  getSettledPredictions() {
    return this.predictions.filter(p => p.settled);
  }
}

/**
 * Generate backtesting report
 *
 * @param {Array} predictions - All predictions
 * @returns {Object} Comprehensive backtesting report
 */
export function generateBacktestReport(predictions) {
  const brier = calculateBrierScore(predictions);
  const calibration = calculateCalibration(predictions);
  const roiByMarket = calculateROIByMarket(predictions);
  const trend = analyzePerformanceTrend(predictions);

  return {
    summary: {
      totalPredictions: predictions.length,
      settledPredictions: predictions.filter(p => p.settled).length,
      pendingPredictions: predictions.filter(p => !p.settled).length,
      overallROI: roiByMarket.totalSummary.roi,
      overallProfit: roiByMarket.totalSummary.profit,
      winRate: roiByMarket.totalSummary.winRate,
    },
    accuracy: {
      brierScore: brier,
      calibration: calibration,
    },
    profitability: roiByMarket,
    trend: trend,
    recommendations: generateRecommendations(brier, calibration, roiByMarket, trend),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate actionable recommendations based on backtest results
 */
function generateRecommendations(brier, calibration, roi, trend) {
  const recommendations = [];

  // Brier score recommendations
  if (brier.score && brier.score > 0.25) {
    recommendations.push({
      area: 'Probability Accuracy',
      issue: 'Brier score indicates predictions are no better than random',
      action: 'Review model parameters and data quality',
      priority: 'high',
    });
  }

  // Calibration recommendations
  if (calibration.expectedCalibrationError && calibration.expectedCalibrationError > 0.08) {
    recommendations.push({
      area: 'Calibration',
      issue: 'Model may be overconfident or underconfident',
      action: 'Apply Platt scaling or isotonic regression for probability calibration',
      priority: 'medium',
    });
  }

  // ROI recommendations
  if (roi.totalSummary.roi < 0) {
    recommendations.push({
      area: 'Profitability',
      issue: 'Overall negative ROI',
      action: 'Consider increasing minimum edge threshold or focusing on best-performing markets',
      priority: 'high',
    });
  }

  // Market-specific recommendations
  Object.entries(roi.byMarket).forEach(([market, stats]) => {
    if (stats.roi && stats.roi < -10 && stats.betsPlaced >= 10) {
      recommendations.push({
        area: `Market: ${market}`,
        issue: `Significant losses in ${market} market (${stats.roi}% ROI)`,
        action: `Consider excluding ${market} from betting or reviewing model for this market`,
        priority: 'medium',
      });
    }
  });

  // Trend recommendations
  if (trend.trend === 'declining') {
    recommendations.push({
      area: 'Performance Trend',
      issue: 'Recent performance is declining',
      action: 'Investigate recent changes in data quality or market efficiency',
      priority: 'medium',
    });
  }

  return recommendations;
}

export default {
  calculateBrierScore,
  calculateCalibration,
  calculateROI,
  calculateROIByMarket,
  analyzePerformanceTrend,
  PredictionStore,
  generateBacktestReport,
  createPredictionRecord,
};
