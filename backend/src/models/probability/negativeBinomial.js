/**
 * Negative Binomial Distribution for Sports Statistics
 *
 * The Negative Binomial distribution is preferred over Poisson when:
 * - Variance > Mean (overdispersion) - common in corners, shots, cards
 * - Data shows more extreme outcomes than Poisson predicts
 * - Events have "clumping" tendency (e.g., corners often come in clusters)
 *
 * Parameters:
 * - r (size/dispersion): Controls variance. Lower r = more overdispersion
 * - p (probability): Related to mean. p = r / (r + μ)
 *
 * Mean = r(1-p)/p = μ
 * Variance = r(1-p)/p² = μ + μ²/r > μ (always greater than Poisson variance)
 */

/**
 * Gamma function approximation using Stirling's formula
 * For calculating binomial coefficients
 */
function gammaLn(n) {
  if (n <= 0) return 0;
  if (n < 12) {
    // Use factorial for small values
    let result = 1;
    for (let i = 2; i < n; i++) {
      result *= i;
    }
    return Math.log(result);
  }
  // Stirling's approximation for larger values
  const x = n;
  return (
    0.5 * Math.log(2 * Math.PI) +
    (x - 0.5) * Math.log(x) -
    x +
    1 / (12 * x) -
    1 / (360 * x * x * x)
  );
}

/**
 * Calculate log of binomial coefficient C(n, k)
 */
function logBinomialCoeff(n, k) {
  if (k < 0 || k > n) return -Infinity;
  if (k === 0 || k === n) return 0;
  return gammaLn(n + 1) - gammaLn(k + 1) - gammaLn(n - k + 1);
}

/**
 * Calculate Negative Binomial probability
 * P(X = k) = C(k + r - 1, k) * p^r * (1-p)^k
 *
 * @param {number} k - Number of events (non-negative integer)
 * @param {number} r - Dispersion parameter (>0). Lower = more variance
 * @param {number} p - Probability parameter (0 < p < 1)
 * @returns {number} Probability
 */
export function negativeBinomialProbability(k, r, p) {
  if (k < 0 || r <= 0 || p <= 0 || p >= 1) return 0;

  // Use log form for numerical stability
  const logProb =
    logBinomialCoeff(k + r - 1, k) +
    r * Math.log(p) +
    k * Math.log(1 - p);

  return Math.exp(logProb);
}

/**
 * Convert mean and variance to Negative Binomial parameters
 *
 * Given μ (mean) and σ² (variance):
 * - If σ² <= μ, use Poisson instead (no overdispersion)
 * - r = μ² / (σ² - μ)
 * - p = μ / σ²
 *
 * @param {number} mean - Expected value (μ)
 * @param {number} variance - Variance (σ²). If not provided, estimates from overdispersion factor
 * @param {number} overdispersionFactor - Multiplier for variance (default 1.3 for corners, 1.5 for cards)
 * @returns {Object} {r, p, mean, variance, useNegBinom}
 */
export function parametersFromMeanVariance(mean, variance = null, overdispersionFactor = 1.3) {
  // Estimate variance if not provided
  const estimatedVariance = variance || mean * overdispersionFactor;

  // Check if overdispersion exists
  if (estimatedVariance <= mean) {
    // No overdispersion - Poisson is appropriate
    return {
      r: Infinity,
      p: 1,
      mean,
      variance: mean,
      useNegBinom: false,
      recommendation: 'Use Poisson distribution',
    };
  }

  // Calculate Negative Binomial parameters
  const r = (mean * mean) / (estimatedVariance - mean);
  const p = mean / estimatedVariance;

  return {
    r: parseFloat(r.toFixed(4)),
    p: parseFloat(p.toFixed(4)),
    mean,
    variance: estimatedVariance,
    useNegBinom: true,
    recommendation: 'Use Negative Binomial distribution',
  };
}

/**
 * Calculate P(X >= k) for Negative Binomial
 *
 * @param {number} k - Threshold
 * @param {number} r - Dispersion parameter
 * @param {number} p - Probability parameter
 * @returns {number} Probability of k or more events
 */
export function negativeBinomialOver(k, r, p) {
  let cumulativeProb = 0;
  for (let i = 0; i < k; i++) {
    cumulativeProb += negativeBinomialProbability(i, r, p);
  }
  return 1 - cumulativeProb;
}

/**
 * Calculate P(X <= k) for Negative Binomial
 *
 * @param {number} k - Threshold
 * @param {number} r - Dispersion parameter
 * @param {number} p - Probability parameter
 * @returns {number} Probability of k or fewer events
 */
export function negativeBinomialUnder(k, r, p) {
  let cumulativeProb = 0;
  for (let i = 0; i <= k; i++) {
    cumulativeProb += negativeBinomialProbability(i, r, p);
  }
  return cumulativeProb;
}

/**
 * Smart distribution selection based on data characteristics
 * Returns probabilities using the most appropriate distribution
 *
 * @param {number} lambda - Expected value (mean)
 * @param {Object} options - Configuration options
 * @returns {Object} Distribution info and probability functions
 */
export function selectOptimalDistribution(lambda, options = {}) {
  const {
    variance = null,
    overdispersionFactor = 1.3,
    marketType = 'general', // 'corners', 'cards', 'shots', 'goals', 'fouls'
  } = options;

  // Market-specific overdispersion factors (based on empirical data)
  const marketOverdispersion = {
    corners: 1.35,      // Corners tend to cluster
    cards: 1.6,         // Cards are highly variable
    shots: 1.25,        // Moderate overdispersion
    goals: 1.1,         // Goals are close to Poisson
    fouls: 1.4,         // Fouls vary with referee
    offsides: 1.3,      // Moderate
    throwIns: 1.2,      // Close to Poisson
    general: 1.3,
  };

  const actualOverdispersion = overdispersionFactor || marketOverdispersion[marketType] || 1.3;
  const params = parametersFromMeanVariance(lambda, variance, actualOverdispersion);

  // Return unified interface for probability calculations
  return {
    params,
    distribution: params.useNegBinom ? 'Negative Binomial' : 'Poisson',

    // Probability of exactly k events
    exact: (k) => params.useNegBinom
      ? negativeBinomialProbability(k, params.r, params.p)
      : poissonProbability(lambda, k),

    // Probability of k or more events
    over: (k) => params.useNegBinom
      ? negativeBinomialOver(k, params.r, params.p)
      : poissonOver(lambda, k),

    // Probability of k or fewer events
    under: (k) => params.useNegBinom
      ? negativeBinomialUnder(k, params.r, params.p)
      : poissonUnder(lambda, k),

    // Full distribution up to maxK
    distribution: (maxK = 20) => {
      const dist = [];
      for (let k = 0; k <= maxK; k++) {
        dist.push({
          value: k,
          probability: params.useNegBinom
            ? negativeBinomialProbability(k, params.r, params.p)
            : poissonProbability(lambda, k),
        });
      }
      return dist;
    },
  };
}

// Import Poisson functions for fallback
import { poissonProbability, poissonOver, poissonUnder } from './poisson.js';

/**
 * Calculate market probabilities using optimal distribution
 *
 * @param {number} expectedValue - Lambda/mean for the market
 * @param {string} marketType - Type of market ('corners', 'cards', etc.)
 * @param {Array<number>} lines - Betting lines to calculate (e.g., [9.5, 10.5, 11.5])
 * @returns {Object} Probabilities for each line
 */
export function calculateMarketProbabilities(expectedValue, marketType, lines = []) {
  const dist = selectOptimalDistribution(expectedValue, { marketType });
  const result = {
    expectedValue,
    distribution: dist.distribution,
    parameters: dist.params,
    probabilities: {},
  };

  lines.forEach(line => {
    const threshold = Math.ceil(line);
    result.probabilities[`over${line}`] = parseFloat(dist.over(threshold).toFixed(4));
    result.probabilities[`under${line}`] = parseFloat(dist.under(Math.floor(line)).toFixed(4));
  });

  return result;
}

/**
 * Compare Poisson vs Negative Binomial predictions
 * Useful for calibration and understanding model differences
 *
 * @param {number} lambda - Expected value
 * @param {number} overdispersion - Overdispersion factor
 * @returns {Object} Side-by-side comparison
 */
export function compareDistributions(lambda, overdispersion = 1.3) {
  const params = parametersFromMeanVariance(lambda, null, overdispersion);

  const lines = [
    Math.floor(lambda) - 1,
    Math.floor(lambda),
    Math.floor(lambda) + 1,
    Math.floor(lambda) + 2,
  ].map(l => l + 0.5);

  const comparison = {
    expectedValue: lambda,
    overdispersion,
    poissonVariance: lambda,
    negBinomVariance: params.variance,
    lines: {},
  };

  lines.forEach(line => {
    const k = Math.ceil(line);
    const poissonOverProb = poissonOver(lambda, k);
    const negBinomOverProb = params.useNegBinom
      ? negativeBinomialOver(k, params.r, params.p)
      : poissonOverProb;

    comparison.lines[`over${line}`] = {
      poisson: parseFloat(poissonOverProb.toFixed(4)),
      negativeBinomial: parseFloat(negBinomOverProb.toFixed(4)),
      difference: parseFloat((negBinomOverProb - poissonOverProb).toFixed(4)),
      // Negative Binomial typically gives higher probability to extremes
      note: negBinomOverProb > poissonOverProb
        ? 'NB gives higher over probability (more variance)'
        : 'Similar to Poisson',
    };
  });

  return comparison;
}

export default {
  negativeBinomialProbability,
  negativeBinomialOver,
  negativeBinomialUnder,
  parametersFromMeanVariance,
  selectOptimalDistribution,
  calculateMarketProbabilities,
  compareDistributions,
};
