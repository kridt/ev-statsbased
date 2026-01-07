/**
 * Player Impact and Manager Effect Factors
 *
 * This module calculates:
 * - Key player absence/return impact on team performance
 * - Manager tactical tendencies and their effect on match stats
 * - New manager bounce/settling effect
 * - Player fatigue and rotation patterns
 */

/**
 * Player position impact weights
 * How much each position affects different stats
 */
const POSITION_IMPACT = {
  // Goals impact by position
  goals: {
    forward: 0.40,        // Strikers account for ~40% of goals
    midfielder: 0.35,     // Midfielders ~35%
    defender: 0.15,       // Defenders ~15%
    goalkeeper: 0.00,     // GKs rarely score
    winger: 0.30,         // Wingers important for goals
  },
  // Assist/creativity impact
  assists: {
    forward: 0.15,
    midfielder: 0.45,
    defender: 0.10,
    goalkeeper: 0.02,
    winger: 0.35,
  },
  // Defensive solidity
  defense: {
    forward: 0.05,
    midfielder: 0.25,
    defender: 0.45,
    goalkeeper: 0.35,
    winger: 0.10,
  },
  // Set piece threat
  setPieces: {
    forward: 0.20,
    midfielder: 0.35,
    defender: 0.30,       // Tall CBs on corners
    goalkeeper: 0.00,
    winger: 0.25,
  },
};

/**
 * Calculate player importance score
 * Higher score = more important to team performance
 *
 * @param {Object} player - Player data
 * @returns {number} Importance score (0-1)
 */
export function calculatePlayerImportance(player) {
  if (!player) return 0;

  let score = 0;

  // Base importance by position
  const position = (player.position || '').toLowerCase();
  if (position.includes('forward') || position.includes('striker')) score = 0.35;
  else if (position.includes('midfielder') || position.includes('mid')) score = 0.30;
  else if (position.includes('defender') || position.includes('back')) score = 0.25;
  else if (position.includes('goalkeeper') || position.includes('keeper')) score = 0.40; // GK absence is critical
  else if (position.includes('wing')) score = 0.28;
  else score = 0.20;

  // Adjust by minutes played (regular starters more important)
  const minutesPlayed = player.statistics?.minutesPlayed || player.minutes || 0;
  const gamesPlayed = player.statistics?.appearances || player.games || 1;
  const avgMinutes = minutesPlayed / Math.max(gamesPlayed, 1);

  if (avgMinutes > 80) score *= 1.3;        // Regular starter
  else if (avgMinutes > 60) score *= 1.1;   // Key rotation player
  else if (avgMinutes < 30) score *= 0.5;   // Bench player

  // Adjust by goals/assists contribution
  const goals = player.statistics?.goals || player.goals || 0;
  const assists = player.statistics?.assists || player.assists || 0;
  const contributions = goals + assists * 0.7;

  if (contributions > 10) score *= 1.25;    // Key contributor
  else if (contributions > 5) score *= 1.1;

  // Captain bonus
  if (player.captain) score *= 1.15;

  // Clamp to 0-1 range
  return Math.min(1, Math.max(0, score));
}

/**
 * Calculate team impact from missing players
 *
 * @param {Array} missingPlayers - Array of absent players (injuries/suspensions)
 * @param {Array} squadSize - Total squad size for context
 * @returns {Object} Impact factors for different stats
 */
export function calculateMissingPlayerImpact(missingPlayers, squadSize = 25) {
  if (!missingPlayers || missingPlayers.length === 0) {
    return {
      available: false,
      goalFactor: 1.0,
      defenseFactor: 1.0,
      setPieceFactor: 1.0,
      overallImpact: 1.0,
      missingCount: 0,
      keyPlayersMissing: 0,
      description: 'Full squad available',
    };
  }

  let totalGoalImpact = 0;
  let totalDefenseImpact = 0;
  let totalSetPieceImpact = 0;
  let keyPlayersMissing = 0;

  missingPlayers.forEach(player => {
    const importance = calculatePlayerImportance(player);
    const position = (player.position || '').toLowerCase();

    // Determine position category
    let posCategory = 'midfielder';
    if (position.includes('forward') || position.includes('striker')) posCategory = 'forward';
    else if (position.includes('defender') || position.includes('back')) posCategory = 'defender';
    else if (position.includes('goalkeeper') || position.includes('keeper')) posCategory = 'goalkeeper';
    else if (position.includes('wing')) posCategory = 'winger';

    // Calculate impact per stat type
    totalGoalImpact += importance * (POSITION_IMPACT.goals[posCategory] || 0.2);
    totalDefenseImpact += importance * (POSITION_IMPACT.defense[posCategory] || 0.2);
    totalSetPieceImpact += importance * (POSITION_IMPACT.setPieces[posCategory] || 0.2);

    if (importance > 0.3) keyPlayersMissing++;
  });

  // Convert to factors (1.0 = no impact, lower = negative impact)
  const goalFactor = Math.max(0.7, 1 - totalGoalImpact * 0.5);
  const defenseFactor = Math.max(0.75, 1 - totalDefenseImpact * 0.4);
  const setPieceFactor = Math.max(0.8, 1 - totalSetPieceImpact * 0.3);
  const overallImpact = (goalFactor + defenseFactor + setPieceFactor) / 3;

  return {
    available: true,
    goalFactor: parseFloat(goalFactor.toFixed(3)),
    defenseFactor: parseFloat(defenseFactor.toFixed(3)),
    setPieceFactor: parseFloat(setPieceFactor.toFixed(3)),
    overallImpact: parseFloat(overallImpact.toFixed(3)),
    missingCount: missingPlayers.length,
    keyPlayersMissing,
    description: keyPlayersMissing > 0
      ? `${keyPlayersMissing} key player(s) missing`
      : `${missingPlayers.length} squad player(s) missing`,
  };
}

/**
 * Manager tactical tendencies database
 * Maps manager styles to expected stat adjustments
 */
const MANAGER_STYLES = {
  // Attacking managers
  attacking: {
    description: 'Attacking, high-tempo football',
    goalsFactor: 1.15,
    cornersFactor: 1.10,
    shotsFactor: 1.15,
    cardsFactor: 1.05,
    possessionFactor: 1.10,
    managers: ['Klopp', 'Guardiola', 'Ancelotti', 'Arteta', 'Slot'],
  },
  // Defensive/pragmatic managers
  defensive: {
    description: 'Defensive, organized football',
    goalsFactor: 0.85,
    cornersFactor: 0.90,
    shotsFactor: 0.85,
    cardsFactor: 1.10,
    possessionFactor: 0.90,
    managers: ['Mourinho', 'Simeone', 'Dyche', 'Allardyce', 'Conte'],
  },
  // Possession-based managers
  possession: {
    description: 'Possession-based, patient build-up',
    goalsFactor: 1.05,
    cornersFactor: 1.05,
    shotsFactor: 1.10,
    cardsFactor: 0.95,
    possessionFactor: 1.20,
    managers: ['Guardiola', 'Sarri', 'Arteta', 'Ten Hag', 'De Zerbi'],
  },
  // Counter-attacking managers
  counterAttack: {
    description: 'Counter-attacking, direct football',
    goalsFactor: 1.05,
    cornersFactor: 0.95,
    shotsFactor: 0.95,
    cardsFactor: 1.05,
    possessionFactor: 0.85,
    managers: ['Mourinho', 'Conte', 'Simeone', 'Emery'],
  },
  // Balanced/neutral
  balanced: {
    description: 'Balanced tactical approach',
    goalsFactor: 1.0,
    cornersFactor: 1.0,
    shotsFactor: 1.0,
    cardsFactor: 1.0,
    possessionFactor: 1.0,
    managers: [],
  },
};

/**
 * Identify manager tactical style
 *
 * @param {Object} manager - Manager data
 * @param {Object} teamStats - Team's recent stats for inference
 * @returns {Object} Manager style and factors
 */
export function identifyManagerStyle(manager, teamStats = {}) {
  if (!manager) {
    return {
      available: false,
      style: 'balanced',
      ...MANAGER_STYLES.balanced,
    };
  }

  const managerName = (manager.name || manager.common_name || '').toLowerCase();

  // Check known managers first
  for (const [style, data] of Object.entries(MANAGER_STYLES)) {
    if (data.managers.some(m => managerName.includes(m.toLowerCase()))) {
      return {
        available: true,
        managerName: manager.name || manager.common_name,
        style,
        ...data,
      };
    }
  }

  // Infer from team stats if manager not in database
  if (teamStats.possession?.average || teamStats.shots?.average) {
    const avgPossession = teamStats.possession?.average || 50;
    const avgShots = teamStats.shots?.average || 12;
    const avgGoals = teamStats.goals?.average || 1.35;

    if (avgPossession > 58 && avgShots > 14) {
      return {
        available: true,
        managerName: manager.name || manager.common_name,
        style: 'possession',
        inferred: true,
        ...MANAGER_STYLES.possession,
      };
    } else if (avgPossession < 45 && avgGoals > 1.3) {
      return {
        available: true,
        managerName: manager.name || manager.common_name,
        style: 'counterAttack',
        inferred: true,
        ...MANAGER_STYLES.counterAttack,
      };
    } else if (avgShots > 15 && avgGoals > 1.5) {
      return {
        available: true,
        managerName: manager.name || manager.common_name,
        style: 'attacking',
        inferred: true,
        ...MANAGER_STYLES.attacking,
      };
    } else if (avgShots < 10 && avgGoals < 1.2) {
      return {
        available: true,
        managerName: manager.name || manager.common_name,
        style: 'defensive',
        inferred: true,
        ...MANAGER_STYLES.defensive,
      };
    }
  }

  // Default to balanced
  return {
    available: true,
    managerName: manager.name || manager.common_name,
    style: 'balanced',
    inferred: true,
    ...MANAGER_STYLES.balanced,
  };
}

/**
 * Calculate new manager effect ("new manager bounce")
 * New managers often see an initial performance boost
 *
 * @param {Object} manager - Manager data with appointment date
 * @param {Date} matchDate - Date of the match
 * @returns {Object} New manager effect factors
 */
export function calculateNewManagerEffect(manager, matchDate) {
  if (!manager?.appointmentDate && !manager?.since) {
    return {
      available: false,
      effect: 'none',
      factor: 1.0,
      description: 'Manager tenure unknown',
    };
  }

  const appointmentDate = new Date(manager.appointmentDate || manager.since);
  const matchDateTime = new Date(matchDate || Date.now());
  const daysSinceAppointment = Math.floor((matchDateTime - appointmentDate) / (1000 * 60 * 60 * 24));
  const gamesInCharge = manager.gamesInCharge || Math.floor(daysSinceAppointment / 4); // Estimate ~1 game per 4 days

  let effect = 'established';
  let factor = 1.0;
  let description = 'Established manager';

  if (daysSinceAppointment < 0) {
    // Future appointment (shouldn't happen)
    effect = 'none';
    factor = 1.0;
    description = 'Manager not yet in charge';
  } else if (gamesInCharge <= 3) {
    // First few games - "new manager bounce"
    effect = 'honeymoon';
    factor = 1.12;  // 12% boost
    description = 'New manager honeymoon period - players motivated';
  } else if (gamesInCharge <= 8) {
    // Early period - still settling
    effect = 'settling';
    factor = 1.05;  // 5% boost
    description = 'Manager still implementing ideas';
  } else if (gamesInCharge <= 15) {
    // Adjustment period - can be rocky
    effect = 'adjusting';
    factor = 0.98;  // Slight negative
    description = 'Tactical adjustment phase';
  } else if (gamesInCharge <= 30) {
    // Established but still new season
    effect = 'established';
    factor = 1.0;
    description = 'Manager established with squad';
  } else {
    // Long-term manager
    effect = 'long-term';
    factor = 1.02;  // Slight positive for stability
    description = 'Long-term manager - tactical familiarity';
  }

  return {
    available: true,
    daysSinceAppointment,
    gamesInCharge,
    effect,
    factor: parseFloat(factor.toFixed(3)),
    description,
  };
}

/**
 * Calculate combined manager and player factors
 *
 * @param {Object} params - Manager and player data
 * @returns {Object} Combined factors for probability adjustment
 */
export function calculatePlayerManagerFactors(params) {
  const {
    homeManager,
    awayManager,
    homeMissingPlayers,
    awayMissingPlayers,
    homeTeamStats,
    awayTeamStats,
    matchDate,
  } = params;

  // Calculate individual factors
  const homePlayerImpact = calculateMissingPlayerImpact(homeMissingPlayers);
  const awayPlayerImpact = calculateMissingPlayerImpact(awayMissingPlayers);

  const homeManagerStyle = identifyManagerStyle(homeManager, homeTeamStats);
  const awayManagerStyle = identifyManagerStyle(awayManager, awayTeamStats);

  const homeNewManagerEffect = calculateNewManagerEffect(homeManager, matchDate);
  const awayNewManagerEffect = calculateNewManagerEffect(awayManager, matchDate);

  // Combined factors for each market
  const combinedFactors = {
    goals: {
      home: homePlayerImpact.goalFactor * homeManagerStyle.goalsFactor * homeNewManagerEffect.factor,
      away: awayPlayerImpact.goalFactor * awayManagerStyle.goalsFactor * awayNewManagerEffect.factor,
    },
    corners: {
      home: homeManagerStyle.cornersFactor,
      away: awayManagerStyle.cornersFactor,
    },
    shots: {
      home: homePlayerImpact.goalFactor * homeManagerStyle.shotsFactor,
      away: awayPlayerImpact.goalFactor * awayManagerStyle.shotsFactor,
    },
    cards: {
      home: homeManagerStyle.cardsFactor,
      away: awayManagerStyle.cardsFactor,
    },
    defense: {
      home: homePlayerImpact.defenseFactor,
      away: awayPlayerImpact.defenseFactor,
    },
  };

  // Generate reasoning text
  const reasoningParts = [];

  if (homePlayerImpact.keyPlayersMissing > 0) {
    reasoningParts.push(`Home: ${homePlayerImpact.description}`);
  }
  if (awayPlayerImpact.keyPlayersMissing > 0) {
    reasoningParts.push(`Away: ${awayPlayerImpact.description}`);
  }
  if (homeNewManagerEffect.effect === 'honeymoon') {
    reasoningParts.push(`Home: ${homeNewManagerEffect.description}`);
  }
  if (awayNewManagerEffect.effect === 'honeymoon') {
    reasoningParts.push(`Away: ${awayNewManagerEffect.description}`);
  }
  if (homeManagerStyle.style !== 'balanced' && !homeManagerStyle.inferred) {
    reasoningParts.push(`Home tactics: ${homeManagerStyle.description}`);
  }
  if (awayManagerStyle.style !== 'balanced' && !awayManagerStyle.inferred) {
    reasoningParts.push(`Away tactics: ${awayManagerStyle.description}`);
  }

  return {
    playerImpact: {
      home: homePlayerImpact,
      away: awayPlayerImpact,
    },
    managerStyle: {
      home: homeManagerStyle,
      away: awayManagerStyle,
    },
    newManagerEffect: {
      home: homeNewManagerEffect,
      away: awayNewManagerEffect,
    },
    combinedFactors,
    reasoning: reasoningParts.length > 0 ? reasoningParts.join(' • ') : 'Standard player/manager situation',
  };
}

export default {
  calculatePlayerImportance,
  calculateMissingPlayerImpact,
  identifyManagerStyle,
  calculateNewManagerEffect,
  calculatePlayerManagerFactors,
  POSITION_IMPACT,
  MANAGER_STYLES,
};
