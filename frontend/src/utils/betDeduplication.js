/**
 * Smart Deduplication Logic for Value Bets
 *
 * When there are multiple bets of the same type (e.g., "Over 8.5", "Over 9.5", "Over 12.5"),
 * this module selects the ONE bet with the best balance between:
 * - Win probability (money back chances)
 * - Expected Value (EV/edge)
 */

/**
 * Calculate a balanced score for a bet considering both probability and EV.
 * Higher probability = safer bet (more likely to win money back)
 * Higher edge = better expected value
 *
 * Score formula weights probability higher (60%) than edge (40%) to favor safer bets.
 */
export const calculateBalancedScore = (bet, maxEdgeInGroup = 1) => {
  const probability = bet.probability || 0;
  const edge = bet.edge || 0;

  // Normalize edge relative to the group's max edge (0-1 scale)
  const normalizedEdge = maxEdgeInGroup > 0 ? edge / maxEdgeInGroup : 0;

  // Weight: 60% probability (money back chances), 40% normalized edge (value)
  return (probability * 0.6) + (normalizedEdge * 0.4);
};

/**
 * Get the direction of a bet (over/under/yes/no) from the market string
 */
export const getBetDirection = (market) => {
  if (!market) return 'other';
  const lowerMarket = market.toLowerCase();
  if (lowerMarket.includes('over') || lowerMarket.includes('yes') || lowerMarket.includes('2+') || lowerMarket.includes('3+')) return 'over';
  if (lowerMarket.includes('under') || lowerMarket.includes('no')) return 'under';
  return 'other';
};

/**
 * Create a grouping key for similar bets within the same match.
 * Groups by: fixture + betType + direction + player (for player props)
 */
export const createBetGroupKey = (bet) => {
  const fixtureId = bet.fixture?.id || 'unknown';
  const betType = bet.betType || 'unknown';
  const direction = getBetDirection(bet.market);

  // For player props, also group by player name
  if (betType === 'player_shots' || betType === 'player_sot' || betType === 'goalscorer') {
    const playerMatch = bet.market?.match(/^([^-]+)/);
    const playerName = playerMatch ? playerMatch[1].trim() : 'unknown';
    return `${fixtureId}|${betType}|${direction}|${playerName}`;
  }

  return `${fixtureId}|${betType}|${direction}`;
};

/**
 * Deduplicate bets by selecting the best bet from each group.
 * Best = highest balanced score (probability * 0.6 + normalized_edge * 0.4)
 *
 * @param {Array} bets - Array of bet objects
 * @returns {Array} - Deduplicated array with best bet from each category
 */
export const deduplicateBets = (bets) => {
  const groups = {};

  // Group bets by their category key
  bets.forEach(bet => {
    const key = createBetGroupKey(bet);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(bet);
  });

  // From each group, select the bet with the best balanced score
  const result = [];
  Object.entries(groups).forEach(([key, groupBets]) => {
    if (groupBets.length === 1) {
      result.push(groupBets[0]);
    } else {
      // Find max edge in group for normalization
      const maxEdge = Math.max(...groupBets.map(b => b.edge || 0));

      // Calculate balanced score for each bet
      const withScores = groupBets.map(bet => ({
        ...bet,
        _balancedScore: calculateBalancedScore(bet, maxEdge),
        _alternativeCount: groupBets.length - 1, // How many alternatives were filtered
      }));

      // Sort by balanced score (highest first)
      withScores.sort((a, b) => b._balancedScore - a._balancedScore);

      // Select the best one
      result.push(withScores[0]);
    }
  });

  return result;
};

export default deduplicateBets;
