/**
 * Line Movement and Sharp Money Indicators
 *
 * This module analyzes odds movements to identify:
 * - Sharp money (professional bettor activity)
 * - Steam moves (sudden significant line movements)
 * - Reverse line movement (line moves opposite to public betting)
 * - Closing line value (CLV) - key indicator of betting skill
 * - Market consensus and efficiency
 */

/**
 * Track odds history for a market
 *
 * @param {Array} oddsHistory - Array of odds snapshots with timestamps
 * @returns {Object} Processed odds movement data
 */
export function processOddsHistory(oddsHistory) {
  if (!oddsHistory || oddsHistory.length === 0) {
    return {
      available: false,
      snapshots: 0,
      description: 'No odds history available',
    };
  }

  // Sort by timestamp (oldest first)
  const sorted = [...oddsHistory].sort((a, b) =>
    new Date(a.timestamp || a.updated_at) - new Date(b.timestamp || b.updated_at)
  );

  const openingOdds = sorted[0];
  const currentOdds = sorted[sorted.length - 1];

  // Calculate movement metrics
  let totalMovement = 0;
  let maxMovement = 0;
  let movements = [];

  for (let i = 1; i < sorted.length; i++) {
    const prevOdds = sorted[i - 1].odds || sorted[i - 1].value;
    const currOdds = sorted[i].odds || sorted[i].value;
    const movement = currOdds - prevOdds;

    movements.push({
      from: prevOdds,
      to: currOdds,
      change: movement,
      percentChange: ((currOdds - prevOdds) / prevOdds) * 100,
      timestamp: sorted[i].timestamp || sorted[i].updated_at,
    });

    totalMovement += Math.abs(movement);
    maxMovement = Math.max(maxMovement, Math.abs(movement));
  }

  const openPrice = openingOdds.odds || openingOdds.value;
  const closePrice = currentOdds.odds || currentOdds.value;
  const netMovement = closePrice - openPrice;

  return {
    available: true,
    snapshots: sorted.length,
    openingOdds: parseFloat(openPrice.toFixed(3)),
    currentOdds: parseFloat(closePrice.toFixed(3)),
    netMovement: parseFloat(netMovement.toFixed(3)),
    totalVolatility: parseFloat(totalMovement.toFixed(3)),
    maxSingleMove: parseFloat(maxMovement.toFixed(3)),
    direction: netMovement > 0.05 ? 'drifting' : netMovement < -0.05 ? 'shortening' : 'stable',
    movements,
  };
}

/**
 * Detect steam move (sudden large odds movement indicating sharp action)
 *
 * @param {Array} movements - Array of odds movements
 * @param {Object} thresholds - Detection thresholds
 * @returns {Object} Steam move detection result
 */
export function detectSteamMove(movements, thresholds = {}) {
  const {
    minPercentChange = 5,        // Minimum % change to qualify
    maxTimeWindow = 300000,      // 5 minutes in milliseconds
    significantMove = 0.10,      // Significant odds change threshold
  } = thresholds;

  if (!movements || movements.length === 0) {
    return {
      detected: false,
      description: 'No movement data',
    };
  }

  const steamMoves = [];

  movements.forEach((move, index) => {
    const absPercentChange = Math.abs(move.percentChange);

    if (absPercentChange >= minPercentChange || Math.abs(move.change) >= significantMove) {
      steamMoves.push({
        index,
        ...move,
        severity: absPercentChange >= 10 ? 'major' : absPercentChange >= 5 ? 'moderate' : 'minor',
      });
    }
  });

  return {
    detected: steamMoves.length > 0,
    count: steamMoves.length,
    steamMoves,
    mostSignificant: steamMoves.length > 0
      ? steamMoves.reduce((max, m) => Math.abs(m.percentChange) > Math.abs(max.percentChange) ? m : max)
      : null,
    description: steamMoves.length > 0
      ? `${steamMoves.length} steam move(s) detected - possible sharp action`
      : 'No significant steam moves',
  };
}

/**
 * Analyze if line is moving opposite to public sentiment (reverse line movement)
 *
 * @param {Object} oddsMovement - Processed odds movement data
 * @param {Object} publicSentiment - Public betting percentages if available
 * @returns {Object} Reverse line movement analysis
 */
export function detectReverseLine(oddsMovement, publicSentiment = {}) {
  if (!oddsMovement?.available) {
    return {
      detected: false,
      description: 'Insufficient odds data',
    };
  }

  const {
    publicBackPercentage = 50, // % of public money on this side
    publicLayPercentage = 50,  // % of public money against
  } = publicSentiment;

  const isPublicSide = publicBackPercentage > 60; // Public heavily on this side
  const lineShortening = oddsMovement.direction === 'shortening'; // Odds getting shorter (more likely)
  const lineDrifting = oddsMovement.direction === 'drifting'; // Odds getting longer (less likely)

  let reverseLineDetected = false;
  let significance = 'none';
  let interpretation = '';

  // Reverse line: Public heavy on one side, but line moves the other way
  if (isPublicSide && lineDrifting) {
    reverseLineDetected = true;
    significance = publicBackPercentage > 70 ? 'strong' : 'moderate';
    interpretation = `Sharp money against public - odds drifting despite ${publicBackPercentage}% public backing`;
  } else if (!isPublicSide && publicLayPercentage > 60 && lineShortening) {
    reverseLineDetected = true;
    significance = publicLayPercentage > 70 ? 'strong' : 'moderate';
    interpretation = `Sharp money supporting this side - odds shortening against public sentiment`;
  } else if (isPublicSide && lineShortening) {
    interpretation = 'Line moving with public - normal market behavior';
  } else {
    interpretation = 'No clear reverse line movement pattern';
  }

  return {
    detected: reverseLineDetected,
    significance,
    publicBackPercentage,
    lineDirection: oddsMovement.direction,
    interpretation,
    // Sharp indicator: reverse line is strong signal of professional bettor activity
    sharpSignal: reverseLineDetected && significance === 'strong',
  };
}

/**
 * Calculate expected Closing Line Value (CLV)
 * CLV measures if you're beating the closing line - key indicator of long-term profitability
 *
 * @param {number} bettingOdds - Odds at time of bet placement
 * @param {number} closingOdds - Final odds before match start
 * @returns {Object} CLV analysis
 */
export function calculateCLV(bettingOdds, closingOdds) {
  if (!bettingOdds || !closingOdds) {
    return {
      available: false,
      description: 'Missing odds data for CLV calculation',
    };
  }

  // CLV = (Betting Odds / Closing Odds) - 1
  // Positive CLV = you got better odds than closing price
  const clv = (bettingOdds / closingOdds) - 1;
  const clvPercent = clv * 100;

  // Implied probability comparison
  const bettingImplied = 1 / bettingOdds;
  const closingImplied = 1 / closingOdds;
  const impliedDifference = (closingImplied - bettingImplied) * 100;

  let interpretation;
  if (clvPercent > 5) interpretation = 'Excellent CLV - significant edge captured';
  else if (clvPercent > 2) interpretation = 'Good CLV - beating the market';
  else if (clvPercent > 0) interpretation = 'Positive CLV - marginal edge';
  else if (clvPercent > -2) interpretation = 'Neutral - no significant CLV';
  else interpretation = 'Negative CLV - got worse odds than closing';

  return {
    available: true,
    bettingOdds: parseFloat(bettingOdds.toFixed(3)),
    closingOdds: parseFloat(closingOdds.toFixed(3)),
    clv: parseFloat(clv.toFixed(4)),
    clvPercent: parseFloat(clvPercent.toFixed(2)),
    impliedDifferencePercent: parseFloat(impliedDifference.toFixed(2)),
    positive: clv > 0,
    interpretation,
    // Long-term: positive CLV bettors profit; negative CLV bettors lose
  };
}

/**
 * Analyze market consensus from multiple bookmakers
 *
 * @param {Array} bookmakerOdds - Array of odds from different bookmakers
 * @returns {Object} Market consensus analysis
 */
export function analyzeMarketConsensus(bookmakerOdds) {
  if (!bookmakerOdds || bookmakerOdds.length === 0) {
    return {
      available: false,
      description: 'No bookmaker odds available',
    };
  }

  const odds = bookmakerOdds.map(b => b.odds || b.value).filter(o => o && o > 0);

  if (odds.length === 0) {
    return {
      available: false,
      description: 'No valid odds found',
    };
  }

  const avgOdds = odds.reduce((sum, o) => sum + o, 0) / odds.length;
  const minOdds = Math.min(...odds);
  const maxOdds = Math.max(...odds);
  const spread = maxOdds - minOdds;
  const spreadPercent = (spread / avgOdds) * 100;

  // Best value identification
  const bestOdds = maxOdds;
  const bestBookmaker = bookmakerOdds.find(b => (b.odds || b.value) === bestOdds)?.bookmaker || 'Unknown';

  // Market efficiency: tight spread = efficient market, wide spread = opportunity
  let efficiency;
  if (spreadPercent < 2) efficiency = 'Very efficient - tight consensus';
  else if (spreadPercent < 5) efficiency = 'Efficient - normal spread';
  else if (spreadPercent < 10) efficiency = 'Moderate - some disagreement';
  else efficiency = 'Inefficient - significant disagreement, possible value';

  // Implied probability from consensus
  const consensusImpliedProb = 1 / avgOdds;
  const fairOdds = 1 / consensusImpliedProb;

  return {
    available: true,
    bookmakerCount: odds.length,
    averageOdds: parseFloat(avgOdds.toFixed(3)),
    minOdds: parseFloat(minOdds.toFixed(3)),
    maxOdds: parseFloat(maxOdds.toFixed(3)),
    spread: parseFloat(spread.toFixed(3)),
    spreadPercent: parseFloat(spreadPercent.toFixed(2)),
    bestOdds: parseFloat(bestOdds.toFixed(3)),
    bestBookmaker,
    consensusImpliedProb: parseFloat((consensusImpliedProb * 100).toFixed(2)),
    fairOdds: parseFloat(fairOdds.toFixed(3)),
    efficiency,
    valueOpportunity: spreadPercent > 5,
  };
}

/**
 * Generate comprehensive line movement analysis
 *
 * @param {Object} params - All available market data
 * @returns {Object} Complete line movement analysis with recommendations
 */
export function analyzeLineMovement(params) {
  const {
    oddsHistory = [],
    bookmakerOdds = [],
    publicSentiment = {},
    bettingOdds = null,
    closingOdds = null,
  } = params;

  // Process all components
  const movement = processOddsHistory(oddsHistory);
  const steamMove = movement.available ? detectSteamMove(movement.movements) : { detected: false };
  const reverseLine = detectReverseLine(movement, publicSentiment);
  const clv = calculateCLV(bettingOdds, closingOdds);
  const consensus = analyzeMarketConsensus(bookmakerOdds);

  // Generate overall signal strength
  let signalStrength = 0;
  const signals = [];

  if (steamMove.detected) {
    signalStrength += steamMove.mostSignificant?.severity === 'major' ? 3 : 1;
    signals.push(`Steam move: ${steamMove.description}`);
  }

  if (reverseLine.detected) {
    signalStrength += reverseLine.significance === 'strong' ? 3 : 2;
    signals.push(`Reverse line: ${reverseLine.interpretation}`);
  }

  if (clv.available && clv.positive) {
    signalStrength += clv.clvPercent > 3 ? 2 : 1;
    signals.push(`Positive CLV: ${clv.clvPercent}%`);
  }

  if (consensus.valueOpportunity) {
    signalStrength += 1;
    signals.push(`Market inefficiency: ${consensus.spreadPercent}% spread`);
  }

  // Determine recommendation
  let recommendation = 'neutral';
  let confidence = 'low';

  if (signalStrength >= 5) {
    recommendation = reverseLine.sharpSignal ? 'fade_public' : 'follow_sharp';
    confidence = 'high';
  } else if (signalStrength >= 3) {
    recommendation = 'monitor';
    confidence = 'medium';
  }

  return {
    movement,
    steamMove,
    reverseLine,
    clv,
    consensus,
    signalStrength,
    signals,
    recommendation,
    confidence,
    summary: signals.length > 0
      ? signals.join(' | ')
      : 'No significant line movement signals',
  };
}

/**
 * Calculate sharp vs square (public) money split estimate
 * Based on line movement direction vs public betting percentages
 *
 * @param {Object} lineData - Line movement and public data
 * @returns {Object} Sharp/square money estimate
 */
export function estimateSharpSquareSplit(lineData) {
  const {
    publicPercentage = 50,
    lineDirection = 'stable',
    steamMoveDetected = false,
    reverseLineDetected = false,
  } = lineData;

  let sharpEstimate = 50; // Default to 50/50

  // Reverse line movement strongly suggests sharp money opposite to public
  if (reverseLineDetected) {
    sharpEstimate = publicPercentage > 60
      ? 100 - publicPercentage + 20  // Sharps on opposite side
      : publicPercentage + 20;       // Sharps with minority public
  }

  // Steam moves suggest sharp action
  if (steamMoveDetected) {
    if (lineDirection === 'shortening') {
      sharpEstimate = Math.min(80, sharpEstimate + 15);
    } else if (lineDirection === 'drifting') {
      sharpEstimate = Math.max(20, sharpEstimate - 15);
    }
  }

  sharpEstimate = Math.max(10, Math.min(90, sharpEstimate));
  const squareEstimate = 100 - sharpEstimate;

  return {
    sharpMoneyPercent: parseFloat(sharpEstimate.toFixed(0)),
    squareMoneyPercent: parseFloat(squareEstimate.toFixed(0)),
    confidence: reverseLineDetected || steamMoveDetected ? 'medium' : 'low',
    description: sharpEstimate > 60
      ? 'Sharp money appears to favor this side'
      : sharpEstimate < 40
        ? 'Sharp money appears against this side'
        : 'No clear sharp money direction',
  };
}

export default {
  processOddsHistory,
  detectSteamMove,
  detectReverseLine,
  calculateCLV,
  analyzeMarketConsensus,
  analyzeLineMovement,
  estimateSharpSquareSplit,
};
