/**
 * Poisson Distribution Probability Calculator
 * Used for modeling discrete count events like goals, corners, shots, etc.
 */

/**
 * Calculate factorial (used in Poisson formula)
 * Uses memoization for efficiency
 */
const factorialCache = { 0: 1, 1: 1 };
function factorial(n) {
  if (n < 0) return 1;
  if (factorialCache[n]) return factorialCache[n];

  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
    factorialCache[i] = result;
  }
  return result;
}

/**
 * Calculate Poisson probability for exactly k events given lambda (expected value)
 * P(X = k) = (λ^k * e^-λ) / k!
 *
 * @param {number} lambda - Expected value (average rate)
 * @param {number} k - Number of events to calculate probability for
 * @returns {number} Probability between 0 and 1
 */
export function poissonProbability(lambda, k) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  if (k < 0) return 0;

  return (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);
}

/**
 * Calculate probability of k or more events (Over k-0.5)
 * P(X >= k) = 1 - P(X <= k-1)
 *
 * @param {number} lambda - Expected value
 * @param {number} k - Threshold value
 * @returns {number} Probability
 */
export function poissonOver(lambda, k) {
  let cumulativeProb = 0;
  for (let i = 0; i < k; i++) {
    cumulativeProb += poissonProbability(lambda, i);
  }
  return 1 - cumulativeProb;
}

/**
 * Calculate probability of k or fewer events (Under k+0.5)
 * P(X <= k)
 *
 * @param {number} lambda - Expected value
 * @param {number} k - Threshold value
 * @returns {number} Probability
 */
export function poissonUnder(lambda, k) {
  let cumulativeProb = 0;
  for (let i = 0; i <= k; i++) {
    cumulativeProb += poissonProbability(lambda, i);
  }
  return cumulativeProb;
}

/**
 * Calculate probability of exactly k events
 *
 * @param {number} lambda - Expected value
 * @param {number} k - Exact number of events
 * @returns {number} Probability
 */
export function poissonExact(lambda, k) {
  return poissonProbability(lambda, k);
}

/**
 * Calculate probability distribution for 0 to maxK events
 *
 * @param {number} lambda - Expected value
 * @param {number} maxK - Maximum number of events to calculate (default: 20)
 * @returns {Array<{value: number, probability: number}>} Distribution array
 */
export function poissonDistribution(lambda, maxK = 20) {
  const distribution = [];
  for (let k = 0; k <= maxK; k++) {
    distribution.push({
      value: k,
      probability: poissonProbability(lambda, k),
    });
  }
  return distribution;
}

/**
 * Maximum and minimum realistic probability caps
 * No sporting event should have 100% or 0% probability
 */
export const MAX_REALISTIC_PROBABILITY = 0.98;  // 98% max - no bet is truly certain
export const MIN_REALISTIC_PROBABILITY = 0.02;  // 2% min - nothing is truly impossible
export const MIN_FAIR_ODDS = 1.02;              // Corresponds to 98% probability
export const MAX_FAIR_ODDS = 50.0;              // Corresponds to 2% probability

/**
 * Cap probability to realistic bounds
 * @param {number} probability - Raw probability between 0 and 1
 * @returns {number} Capped probability
 */
export function capProbability(probability) {
  return Math.max(MIN_REALISTIC_PROBABILITY, Math.min(MAX_REALISTIC_PROBABILITY, probability));
}

/**
 * Convert probability to fair odds
 *
 * @param {number} probability - Probability between 0 and 1
 * @returns {number} Decimal odds
 */
export function probabilityToOdds(probability) {
  if (probability <= 0) return Infinity;
  if (probability >= 1) return 1;
  return 1 / probability;
}

/**
 * Convert decimal odds to probability
 *
 * @param {number} odds - Decimal odds (e.g., 2.50)
 * @returns {number} Probability between 0 and 1
 */
export function oddsToProbability(odds) {
  if (odds <= 1) return 1;
  return 1 / odds;
}

/**
 * Calculate Expected Value (EV) for a bet
 *
 * @param {number} trueProbability - Our calculated probability (0-1)
 * @param {number} bookmakerOdds - Bookmaker's decimal odds
 * @returns {number} EV as percentage (positive = +EV, negative = -EV)
 */
export function calculateEV(trueProbability, bookmakerOdds) {
  // EV = (Probability × (Odds - 1)) - (1 - Probability) × 1
  // Simplified: EV = (Probability × Odds) - 1
  return (trueProbability * bookmakerOdds) - 1;
}

/**
 * Calculate Kelly Criterion bet sizing
 *
 * @param {number} trueProbability - Our calculated probability (0-1)
 * @param {number} bookmakerOdds - Bookmaker's decimal odds
 * @param {number} fractionalKelly - Fraction of Kelly to use (default: 0.25 = quarter Kelly)
 * @returns {number} Recommended stake as fraction of bankroll
 */
export function kellyStake(trueProbability, bookmakerOdds, fractionalKelly = 0.25) {
  const b = bookmakerOdds - 1; // Net odds (profit per unit staked)
  const p = trueProbability;
  const q = 1 - trueProbability;

  // Kelly formula: f* = (bp - q) / b = (p(b+1) - 1) / b = (p × odds - 1) / (odds - 1)
  const fullKelly = (p * bookmakerOdds - 1) / b;

  // Clamp to 0 if negative (no bet recommended)
  return Math.max(0, fullKelly * fractionalKelly);
}

export default {
  poissonProbability,
  poissonOver,
  poissonUnder,
  poissonExact,
  poissonDistribution,
  probabilityToOdds,
  oddsToProbability,
  calculateEV,
  kellyStake,
  capProbability,
  MAX_REALISTIC_PROBABILITY,
  MIN_REALISTIC_PROBABILITY,
  MIN_FAIR_ODDS,
  MAX_FAIR_ODDS,
};
