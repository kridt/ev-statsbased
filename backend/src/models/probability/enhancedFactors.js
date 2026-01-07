/**
 * Enhanced Factors Module for Probability Calculations
 *
 * Calculates adjustment factors from:
 * - Referee statistics (cards, fouls)
 * - Weather conditions (rain, wind, temperature)
 * - Head-to-head history
 * - Recent form
 * - Match importance (league position)
 * - Derby/rivalry detection
 * - Rest days between matches
 * - Time of match (day/night)
 *
 * Also generates human-readable reasoning for predictions.
 */

import { LEAGUE_AVERAGES } from './advancedStats.js';

/**
 * League average referee stats (baseline for comparison)
 */
const REFEREE_AVERAGES = {
  yellowCardsPerGame: 3.6, // Average total yellow cards per game
  redCardsPerGame: 0.1,
  foulsPerGame: 22,
};

/**
 * Process referee statistics to get averages
 *
 * @param {Object} referee - Referee object with statistics
 * @returns {Object} Referee averages and factor
 */
export function processRefereeStats(referee) {
  if (!referee || !referee.statistics?.length) {
    return {
      available: false,
      yellowCardsPerGame: REFEREE_AVERAGES.yellowCardsPerGame,
      redCardsPerGame: REFEREE_AVERAGES.redCardsPerGame,
      foulsPerGame: REFEREE_AVERAGES.foulsPerGame,
      cardFactor: 1.0,
      foulFactor: 1.0,
      strictness: 'average',
    };
  }

  // Get the most recent season stats
  const stats = referee.statistics[0];
  const details = stats?.details || [];

  let yellowCards = 0;
  let redCards = 0;
  let fouls = 0;
  let games = 0;

  details.forEach((detail) => {
    const typeName = detail.type?.developer_name || detail.type?.name || '';
    const value = detail.value?.total ?? detail.value ?? 0;

    if (typeName.includes('YELLOW') && !typeName.includes('RED')) {
      yellowCards = value;
    } else if (typeName.includes('RED') || typeName === 'REDCARDS') {
      redCards = value;
    } else if (typeName.includes('FOUL')) {
      fouls = value;
    } else if (typeName === 'GAMES' || typeName === 'APPEARANCES') {
      games = value;
    }
  });

  // Calculate per-game averages
  const gamesPlayed = games || 1;
  const yellowPerGame = yellowCards / gamesPlayed;
  const redPerGame = redCards / gamesPlayed;
  const foulsPerGame = fouls / gamesPlayed;

  // Calculate factors relative to league average
  const cardFactor = yellowPerGame / REFEREE_AVERAGES.yellowCardsPerGame;
  const foulFactor = foulsPerGame > 0 ? foulsPerGame / REFEREE_AVERAGES.foulsPerGame : 1.0;

  // Determine strictness level
  let strictness = 'average';
  if (cardFactor > 1.2) strictness = 'strict';
  else if (cardFactor > 1.1) strictness = 'above average';
  else if (cardFactor < 0.9) strictness = 'lenient';
  else if (cardFactor < 0.8) strictness = 'very lenient';

  return {
    available: true,
    name: referee.common_name || referee.name || 'Unknown',
    yellowCardsPerGame: parseFloat(yellowPerGame.toFixed(2)),
    redCardsPerGame: parseFloat(redPerGame.toFixed(3)),
    foulsPerGame: parseFloat(foulsPerGame.toFixed(1)),
    gamesOfficiated: gamesPlayed,
    cardFactor: parseFloat(Math.max(0.7, Math.min(1.4, cardFactor)).toFixed(3)),
    foulFactor: parseFloat(Math.max(0.8, Math.min(1.3, foulFactor)).toFixed(3)),
    strictness,
  };
}

/**
 * Process weather conditions to get adjustment factors
 *
 * @param {Object} weatherReport - Weather report from API
 * @returns {Object} Weather factors for different markets
 */
export function processWeatherConditions(weatherReport) {
  if (!weatherReport) {
    return {
      available: false,
      cornerFactor: 1.0,
      foulFactor: 1.0,
      goalFactor: 1.0,
      condition: 'unknown',
      description: 'Weather data not available',
    };
  }

  const code = weatherReport.code?.toLowerCase() || '';
  const type = weatherReport.type?.toLowerCase() || '';
  const temp = weatherReport.temperature_celcius?.temp || weatherReport.temperature?.temp || 15;
  const windSpeed = weatherReport.wind?.speed || 0;
  const humidity = weatherReport.humidity || 50;
  const clouds = weatherReport.clouds || 0;

  let cornerFactor = 1.0;
  let foulFactor = 1.0;
  let goalFactor = 1.0;
  let condition = 'normal';
  const reasons = [];

  // Rain conditions - wet pitch = more corners, more fouls
  if (code.includes('rain') || type.includes('rain') || type.includes('drizzle')) {
    cornerFactor += 0.08; // Wet pitch = ball moves faster, more corners
    foulFactor += 0.1; // Slippery = more mistimed tackles
    goalFactor -= 0.05; // Slightly harder to control
    condition = 'rainy';
    reasons.push('wet conditions');
  }

  // Heavy rain
  if (type.includes('heavy rain') || type.includes('thunderstorm')) {
    cornerFactor += 0.05;
    foulFactor += 0.05;
    goalFactor -= 0.05;
    condition = 'heavy rain';
  }

  // Strong wind - affects crosses and long balls
  if (windSpeed > 30) {
    cornerFactor += 0.06;
    goalFactor -= 0.03;
    reasons.push('strong wind');
  } else if (windSpeed > 20) {
    cornerFactor += 0.03;
    reasons.push('moderate wind');
  }

  // Extreme temperature
  if (temp > 30) {
    foulFactor -= 0.05; // Players more tired, less aggressive
    reasons.push('hot conditions');
  } else if (temp < 5) {
    foulFactor += 0.05; // Cold = more physical play
    reasons.push('cold conditions');
  }

  // High humidity
  if (humidity > 80) {
    reasons.push('humid');
  }

  const description =
    reasons.length > 0 ? reasons.join(', ') : `${Math.round(temp)}°C, ${type || 'clear'}`;

  return {
    available: true,
    temperature: Math.round(temp),
    windSpeed: Math.round(windSpeed),
    humidity,
    clouds,
    type: type || code,
    cornerFactor: parseFloat(cornerFactor.toFixed(3)),
    foulFactor: parseFloat(foulFactor.toFixed(3)),
    goalFactor: parseFloat(goalFactor.toFixed(3)),
    condition,
    description,
  };
}

/**
 * Calculate head-to-head factors
 *
 * @param {Array} h2hMatches - Array of H2H matches
 * @param {number} homeTeamId - Home team ID
 * @param {number} awayTeamId - Away team ID
 * @returns {Object} H2H analysis and factors
 */
export function processHeadToHead(h2hMatches, homeTeamId, awayTeamId) {
  if (!h2hMatches || h2hMatches.length === 0) {
    return {
      available: false,
      totalMatches: 0,
      cardFactor: 1.0,
      cornerFactor: 1.0,
      description: 'No H2H data',
    };
  }

  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  let totalCards = 0;
  let totalCorners = 0;
  let matchCount = 0;

  h2hMatches.slice(0, 10).forEach((match) => {
    const homeParticipant = match.participants?.find((p) => p.meta?.location === 'home');
    const awayParticipant = match.participants?.find((p) => p.meta?.location === 'away');

    if (!homeParticipant || !awayParticipant) return;

    const homeGoals =
      match.scores?.find(
        (s) => s.description === 'CURRENT' && s.score?.participant === 'home',
      )?.score?.goals || 0;
    const awayGoals =
      match.scores?.find(
        (s) => s.description === 'CURRENT' && s.score?.participant === 'away',
      )?.score?.goals || 0;

    if (homeParticipant.id === homeTeamId) {
      if (homeGoals > awayGoals) homeWins++;
      else if (awayGoals > homeGoals) awayWins++;
      else draws++;
    } else {
      if (awayGoals > homeGoals) homeWins++;
      else if (homeGoals > awayGoals) awayWins++;
      else draws++;
    }

    // Extract cards and corners from statistics if available
    const stats = match.statistics || [];
    stats.forEach((stat) => {
      const typeName = stat.type?.developer_name || '';
      if (typeName.includes('YELLOWCARD') || typeName.includes('REDCARD')) {
        totalCards += stat.data?.value || 0;
      }
      if (typeName === 'CORNERS') {
        totalCorners += stat.data?.value || 0;
      }
    });

    matchCount++;
  });

  // Calculate factors based on H2H patterns
  const avgCards = matchCount > 0 ? totalCards / matchCount : LEAGUE_AVERAGES.totalCards;
  const avgCorners = matchCount > 0 ? totalCorners / matchCount : LEAGUE_AVERAGES.totalCorners;

  const cardFactor = avgCards / LEAGUE_AVERAGES.totalCards;
  const cornerFactor = avgCorners / LEAGUE_AVERAGES.totalCorners;

  // Determine dominance
  let dominance = 'even';
  if (homeWins > awayWins + draws) dominance = 'home favored';
  else if (awayWins > homeWins + draws) dominance = 'away favored';

  return {
    available: true,
    totalMatches: matchCount,
    homeWins,
    awayWins,
    draws,
    avgCardsPerMatch: parseFloat(avgCards.toFixed(1)),
    avgCornersPerMatch: parseFloat(avgCorners.toFixed(1)),
    cardFactor: parseFloat(Math.max(0.8, Math.min(1.3, cardFactor)).toFixed(3)),
    cornerFactor: parseFloat(Math.max(0.8, Math.min(1.3, cornerFactor)).toFixed(3)),
    dominance,
    description: `${matchCount} matches: ${homeWins}W-${draws}D-${awayWins}L`,
  };
}

/**
 * Calculate match importance based on league standings
 *
 * @param {Array} standings - League standings
 * @param {number} homeTeamId - Home team ID
 * @param {number} awayTeamId - Away team ID
 * @returns {Object} Match importance factor
 */
export function calculateMatchImportance(standings, homeTeamId, awayTeamId) {
  if (!standings || standings.length === 0) {
    return {
      available: false,
      importance: 'normal',
      factor: 1.0,
      description: 'Standings not available',
    };
  }

  const homeStanding = standings.find((s) => s.participant_id === homeTeamId || s.team_id === homeTeamId);
  const awayStanding = standings.find((s) => s.participant_id === awayTeamId || s.team_id === awayTeamId);

  if (!homeStanding || !awayStanding) {
    return {
      available: false,
      importance: 'normal',
      factor: 1.0,
      description: 'Team standings not found',
    };
  }

  const homePos = homeStanding.position || homeStanding.rank || 99;
  const awayPos = awayStanding.position || awayStanding.rank || 99;
  const totalTeams = standings.length;

  let importance = 'normal';
  let factor = 1.0;
  const reasons = [];

  // Title race (top 2-3 teams)
  if (homePos <= 3 && awayPos <= 3) {
    importance = 'title clash';
    factor = 1.15;
    reasons.push('title race');
  } else if (homePos <= 3 || awayPos <= 3) {
    if (homePos <= 6 || awayPos <= 6) {
      importance = 'top of table';
      factor = 1.08;
      reasons.push('top team involved');
    }
  }

  // Relegation battle (bottom 3-4 teams)
  const relegationZone = totalTeams - 3;
  if (homePos >= relegationZone && awayPos >= relegationZone) {
    importance = 'relegation battle';
    factor = 1.12;
    reasons.push('relegation battle');
  } else if (homePos >= relegationZone || awayPos >= relegationZone) {
    if (importance === 'normal') {
      importance = 'relegation pressure';
      factor = 1.05;
      reasons.push('team fighting relegation');
    }
  }

  // Close positions = more competitive
  const posDiff = Math.abs(homePos - awayPos);
  if (posDiff <= 3) {
    factor += 0.03;
    reasons.push('close in standings');
  }

  return {
    available: true,
    homePosition: homePos,
    awayPosition: awayPos,
    importance,
    factor: parseFloat(factor.toFixed(3)),
    description: reasons.length > 0 ? reasons.join(', ') : `Positions: ${homePos} vs ${awayPos}`,
  };
}

/**
 * Calculate rest days factor
 *
 * @param {Array} homeRecentMatches - Home team recent matches
 * @param {Array} awayRecentMatches - Away team recent matches
 * @param {Date} matchDate - Current match date
 * @returns {Object} Rest days analysis
 */
export function calculateRestDays(homeRecentMatches, awayRecentMatches, matchDate) {
  const getLastMatchDate = (matches) => {
    if (!matches || matches.length === 0) return null;
    const lastMatch = matches[0];
    return lastMatch.starting_at ? new Date(lastMatch.starting_at) : null;
  };

  const currentDate = matchDate ? new Date(matchDate) : new Date();
  const homeLastMatch = getLastMatchDate(homeRecentMatches);
  const awayLastMatch = getLastMatchDate(awayRecentMatches);

  const homeRestDays = homeLastMatch
    ? Math.floor((currentDate - homeLastMatch) / (1000 * 60 * 60 * 24))
    : 7;
  const awayRestDays = awayLastMatch
    ? Math.floor((currentDate - awayLastMatch) / (1000 * 60 * 60 * 24))
    : 7;

  let factor = 1.0;
  let advantage = 'none';
  const reasons = [];

  // Short rest = more fatigue, more fouls
  if (homeRestDays < 4) {
    factor += 0.03;
    reasons.push('home team short rest');
  }
  if (awayRestDays < 4) {
    factor += 0.03;
    reasons.push('away team short rest');
  }

  // Significant rest advantage
  const restDiff = homeRestDays - awayRestDays;
  if (restDiff >= 3) {
    advantage = 'home';
    reasons.push('home team more rested');
  } else if (restDiff <= -3) {
    advantage = 'away';
    reasons.push('away team more rested');
  }

  return {
    available: true,
    homeRestDays,
    awayRestDays,
    advantage,
    foulFactor: parseFloat(factor.toFixed(3)),
    description: `Rest: ${homeRestDays}d vs ${awayRestDays}d`,
  };
}

/**
 * Detect if match is a derby/rivalry
 *
 * @param {Object} homeTeam - Home team object
 * @param {Object} awayTeam - Away team object
 * @param {Object} venue - Venue object
 * @returns {Object} Derby detection result
 */
export function detectDerby(homeTeam, awayTeam, venue) {
  if (!homeTeam || !awayTeam) {
    return { isDerby: false, factor: 1.0, description: null };
  }

  // Check if same city
  const homeCity = (venue?.city_name || homeTeam.city || '').toLowerCase();
  const awayCity = (awayTeam.city || '').toLowerCase();

  // Check venue name for hints
  const venueName = (venue?.name || '').toLowerCase();

  let isDerby = false;
  let factor = 1.0;
  let derbyType = null;

  // Same city = local derby
  if (homeCity && awayCity && homeCity === awayCity) {
    isDerby = true;
    factor = 1.1;
    derbyType = 'city derby';
  }

  // Known derby matchups (can be expanded)
  const knownDerbies = [
    ['Arsenal', 'Tottenham'],
    ['Manchester United', 'Manchester City'],
    ['Liverpool', 'Everton'],
    ['AC Milan', 'Inter'],
    ['Real Madrid', 'Barcelona'],
    ['Juventus', 'Inter'],
    ['Roma', 'Lazio'],
    ['Bayern', 'Dortmund'],
    ['Ajax', 'Feyenoord'],
    ['Celtic', 'Rangers'],
    ['Boca', 'River'],
    ['Galatasaray', 'Fenerbahce'],
  ];

  const homeName = (homeTeam.name || '').toLowerCase();
  const awayName = (awayTeam.name || '').toLowerCase();

  for (const [team1, team2] of knownDerbies) {
    const t1 = team1.toLowerCase();
    const t2 = team2.toLowerCase();
    if ((homeName.includes(t1) && awayName.includes(t2)) ||
        (homeName.includes(t2) && awayName.includes(t1))) {
      isDerby = true;
      factor = 1.15;
      derbyType = 'historic rivalry';
      break;
    }
  }

  return {
    isDerby,
    derbyType,
    factor: parseFloat(factor.toFixed(3)),
    cardFactor: isDerby ? 1.1 : 1.0,
    description: isDerby ? `${derbyType} - expect intensity` : null,
  };
}

/**
 * Calculate time of day factor
 *
 * @param {string} startingAt - Match start time
 * @returns {Object} Time of day analysis
 */
export function calculateTimeOfDay(startingAt) {
  if (!startingAt) {
    return { available: false, period: 'unknown', factor: 1.0 };
  }

  const matchTime = new Date(startingAt);
  const hour = matchTime.getUTCHours();

  let period = 'afternoon';
  let factor = 1.0;

  if (hour >= 19 || hour < 2) {
    period = 'evening';
    factor = 1.02; // Night games slightly more intense
  } else if (hour < 14) {
    period = 'early';
  }

  return {
    available: true,
    hour,
    period,
    factor: parseFloat(factor.toFixed(3)),
  };
}

/**
 * Generate combined factors and reasoning for a match
 *
 * @param {Object} params - All match data
 * @returns {Object} Combined factors and reasoning text
 */
export function generateMatchFactors(params) {
  const {
    referee,
    weatherReport,
    h2hMatches,
    homeTeamId,
    awayTeamId,
    homeTeam,
    awayTeam,
    venue,
    standings,
    homeRecentMatches,
    awayRecentMatches,
    startingAt,
    // New parameters
    homeStats,
    awayStats,
    homeInjuries,
    awayInjuries,
  } = params;

  // Process all existing factors
  const refStats = processRefereeStats(referee);
  const weather = processWeatherConditions(weatherReport);
  const h2h = processHeadToHead(h2hMatches, homeTeamId, awayTeamId);
  const importance = calculateMatchImportance(standings, homeTeamId, awayTeamId);
  const restDays = calculateRestDays(homeRecentMatches, awayRecentMatches, startingAt);
  const derby = detectDerby(homeTeam, awayTeam, venue);
  const timeOfDay = calculateTimeOfDay(startingAt);

  // Process NEW advanced factors
  const xgFactor = calculateXGFactor(homeStats, awayStats);
  const possession = calculatePossessionFactor(homeStats, awayStats);
  const setPiece = calculateSetPieceFactor(homeStats, awayStats);
  const injuries = calculateInjuryFactor(homeInjuries, awayInjuries);
  const europeanFatigue = calculateEuropeanFatigue(homeRecentMatches, awayRecentMatches);
  const travel = calculateTravelFactor(venue, awayTeam);
  const seasonal = calculateSeasonalFactor(standings, startingAt);
  const timePattern = calculateTimePatternFactor(homeStats, awayStats);

  // Calculate combined factors for each market (including new factors)
  const cardsFactor =
    refStats.cardFactor *
    weather.foulFactor *
    h2h.cardFactor *
    importance.factor *
    derby.cardFactor *
    restDays.foulFactor *
    injuries.homeImpact * injuries.awayImpact; // Injuries affect card likelihood

  const cornersFactor =
    weather.cornerFactor *
    h2h.cornerFactor *
    importance.factor *
    possession.homeCornerFactor * possession.awayCornerFactor * // Possession affects corners
    setPiece.homeSetPieceFactor; // Set piece specialists

  const foulsFactor =
    refStats.foulFactor *
    weather.foulFactor *
    restDays.foulFactor *
    derby.factor *
    europeanFatigue.homeFatigueFactor * europeanFatigue.awayFatigueFactor; // Tired teams foul more

  // NEW: Goals factor combining multiple inputs
  const goalsFactor =
    weather.goalFactor *
    xgFactor.combinedFactor *
    injuries.homeImpact * injuries.awayImpact *
    europeanFatigue.homeFatigueFactor * europeanFatigue.awayFatigueFactor *
    travel.factor *
    seasonal.factor;

  // NEW: Shots factor
  const shotsFactor =
    possession.homeShotFactor * possession.awayShotFactor *
    injuries.homeImpact * injuries.awayImpact *
    europeanFatigue.homeFatigueFactor * europeanFatigue.awayFatigueFactor;

  // Generate reasoning text
  const reasoningParts = [];

  // Referee insight
  if (refStats.available && refStats.strictness !== 'average') {
    reasoningParts.push(
      `${refStats.strictness} referee (${refStats.yellowCardsPerGame} cards/game)`
    );
  }

  // Weather insight
  if (weather.available && weather.condition !== 'normal' && weather.condition !== 'unknown') {
    reasoningParts.push(weather.description);
  }

  // Derby insight
  if (derby.isDerby) {
    reasoningParts.push(derby.derbyType);
  }

  // Match importance
  if (importance.available && importance.importance !== 'normal') {
    reasoningParts.push(importance.importance);
  }

  // Rest days insight
  if (restDays.advantage !== 'none') {
    reasoningParts.push(restDays.description);
  }

  // H2H insight
  if (h2h.available && h2h.totalMatches >= 3) {
    reasoningParts.push(`H2H: ${h2h.description}`);
  }

  // NEW: xG insight
  if (xgFactor.available) {
    reasoningParts.push(xgFactor.description);
  }

  // NEW: European fatigue
  if (europeanFatigue.homeInEurope || europeanFatigue.awayInEurope) {
    reasoningParts.push(europeanFatigue.description);
  }

  // NEW: Possession insight
  if (possession.available && (possession.homePossession > 58 || possession.homePossession < 42)) {
    reasoningParts.push(possession.description);
  }

  // NEW: Injuries insight
  if (injuries.available && (injuries.homeInjuryCount > 2 || injuries.awayInjuryCount > 2)) {
    reasoningParts.push(injuries.description);
  }

  // NEW: Travel insight
  if (travel.available && travel.distanceKm > 500) {
    reasoningParts.push(travel.description);
  }

  // NEW: Seasonal insight
  if (seasonal.available && seasonal.phase !== 'mid-season') {
    reasoningParts.push(seasonal.description);
  }

  const reasoning =
    reasoningParts.length > 0
      ? reasoningParts.join(' • ')
      : 'Standard match conditions';

  return {
    factors: {
      cards: parseFloat(Math.max(0.6, Math.min(1.5, cardsFactor)).toFixed(3)),
      corners: parseFloat(Math.max(0.8, Math.min(1.3, cornersFactor)).toFixed(3)),
      fouls: parseFloat(Math.max(0.7, Math.min(1.4, foulsFactor)).toFixed(3)),
      goals: parseFloat(Math.max(0.7, Math.min(1.4, goalsFactor)).toFixed(3)),
      shots: parseFloat(Math.max(0.8, Math.min(1.3, shotsFactor)).toFixed(3)),
    },
    details: {
      // Original factors
      referee: refStats,
      weather,
      h2h,
      importance,
      restDays,
      derby,
      timeOfDay,
      // NEW advanced factors
      xg: xgFactor,
      possession,
      setPiece,
      injuries,
      europeanFatigue,
      travel,
      seasonal,
      timePattern,
    },
    reasoning,
    // Summary of total parameters used
    parametersUsed: {
      original: 7,  // referee, weather, h2h, importance, restDays, derby, timeOfDay
      advanced: 8,  // xg, possession, setPiece, injuries, europeanFatigue, travel, seasonal, timePattern
      total: 15,
    },
  };
}

// ===== NEW ADVANCED FACTOR FUNCTIONS =====

/**
 * Calculate xG (Expected Goals) factor based on team's recent xG performance
 *
 * @param {Object} homeStats - Home team statistics
 * @param {Object} awayStats - Away team statistics
 * @returns {Object} xG analysis and factors
 */
export function calculateXGFactor(homeStats, awayStats) {
  const leagueAvgXG = LEAGUE_AVERAGES.xG || 1.35;

  // Extract xG from team stats if available
  const homeXG = homeStats?.xG?.average || homeStats?.expectedGoals?.average || leagueAvgXG;
  const awayXG = awayStats?.xG?.average || awayStats?.expectedGoals?.average || leagueAvgXG;
  const homeXGConceded = homeStats?.xGConceded?.average || homeStats?.expectedGoalsConceded?.average || leagueAvgXG;
  const awayXGConceded = awayStats?.xGConceded?.average || awayStats?.expectedGoalsConceded?.average || leagueAvgXG;

  // Calculate performance vs expected
  const homeActualGoals = homeStats?.goals?.scored?.average || leagueAvgXG;
  const awayActualGoals = awayStats?.goals?.scored?.average || leagueAvgXG;

  const homeOverperformance = homeXG > 0 ? homeActualGoals / homeXG : 1.0;
  const awayOverperformance = awayXG > 0 ? awayActualGoals / awayXG : 1.0;

  // xG-based goal factor (teams outperforming xG might regress)
  const homeGoalFactor = homeXG > leagueAvgXG ? 1 + ((homeXG - leagueAvgXG) / leagueAvgXG) * 0.3 : 1.0;
  const awayGoalFactor = awayXG > leagueAvgXG ? 1 + ((awayXG - leagueAvgXG) / leagueAvgXG) * 0.3 : 1.0;

  return {
    available: !!(homeStats?.xG || awayStats?.xG),
    homeXG: parseFloat(homeXG.toFixed(2)),
    awayXG: parseFloat(awayXG.toFixed(2)),
    homeXGConceded: parseFloat(homeXGConceded.toFixed(2)),
    awayXGConceded: parseFloat(awayXGConceded.toFixed(2)),
    homeOverperformance: parseFloat(homeOverperformance.toFixed(2)),
    awayOverperformance: parseFloat(awayOverperformance.toFixed(2)),
    homeGoalFactor: parseFloat(Math.max(0.8, Math.min(1.3, homeGoalFactor)).toFixed(3)),
    awayGoalFactor: parseFloat(Math.max(0.8, Math.min(1.3, awayGoalFactor)).toFixed(3)),
    combinedFactor: parseFloat(((homeGoalFactor + awayGoalFactor) / 2).toFixed(3)),
    description: `xG: ${homeXG.toFixed(2)} vs ${awayXG.toFixed(2)}`,
  };
}

/**
 * Calculate possession factor - teams with high possession tend to have more corners/shots
 *
 * @param {Object} homeStats - Home team statistics
 * @param {Object} awayStats - Away team statistics
 * @returns {Object} Possession analysis and factors
 */
export function calculatePossessionFactor(homeStats, awayStats) {
  const leagueAvg = LEAGUE_AVERAGES.possession || 50.0;

  const homePossession = homeStats?.possession?.average || leagueAvg;
  const awayPossession = awayStats?.possession?.average || leagueAvg;

  // High possession = more corners, more shots
  const homePossDiff = (homePossession - leagueAvg) / leagueAvg;
  const awayPossDiff = (awayPossession - leagueAvg) / leagueAvg;

  // Possession dominance affects corner/shot distribution
  const homeCornerFactor = 1 + (homePossDiff * 0.15);
  const awayCornerFactor = 1 + (awayPossDiff * 0.15);
  const homeShotFactor = 1 + (homePossDiff * 0.2);
  const awayShotFactor = 1 + (awayPossDiff * 0.2);

  // Very high possession teams may have fewer counter-attack opportunities for opponent
  const style = homePossession > 58 ? 'possession-based' : homePossession < 45 ? 'counter-attacking' : 'balanced';

  return {
    available: !!(homeStats?.possession || awayStats?.possession),
    homePossession: parseFloat(homePossession.toFixed(1)),
    awayPossession: parseFloat(awayPossession.toFixed(1)),
    homeCornerFactor: parseFloat(Math.max(0.85, Math.min(1.2, homeCornerFactor)).toFixed(3)),
    awayCornerFactor: parseFloat(Math.max(0.85, Math.min(1.2, awayCornerFactor)).toFixed(3)),
    homeShotFactor: parseFloat(Math.max(0.85, Math.min(1.25, homeShotFactor)).toFixed(3)),
    awayShotFactor: parseFloat(Math.max(0.85, Math.min(1.25, awayShotFactor)).toFixed(3)),
    homeStyle: style,
    description: `Possession: ${homePossession.toFixed(0)}% vs ${awayPossession.toFixed(0)}%`,
  };
}

/**
 * Calculate set piece effectiveness factor
 *
 * @param {Object} homeStats - Home team statistics
 * @param {Object} awayStats - Away team statistics
 * @returns {Object} Set piece analysis
 */
export function calculateSetPieceFactor(homeStats, awayStats) {
  const leagueCornerConversion = LEAGUE_AVERAGES.cornerConversionRate || 0.03;

  // Extract set piece data if available
  const homeCornerGoals = homeStats?.setPieces?.cornerGoals || 0;
  const homeCorners = homeStats?.corners?.total || homeStats?.corners?.average * 5 || 25;
  const awayCornerGoals = awayStats?.setPieces?.cornerGoals || 0;
  const awayCorners = awayStats?.corners?.total || awayStats?.corners?.average * 5 || 25;

  const homeConversionRate = homeCorners > 0 ? homeCornerGoals / homeCorners : leagueCornerConversion;
  const awayConversionRate = awayCorners > 0 ? awayCornerGoals / awayCorners : leagueCornerConversion;

  // Set piece specialists get bonus
  const homeSetPieceFactor = homeConversionRate > leagueCornerConversion * 1.5 ? 1.08 : 1.0;
  const awaySetPieceFactor = awayConversionRate > leagueCornerConversion * 1.5 ? 1.08 : 1.0;

  return {
    available: !!(homeStats?.setPieces || awayStats?.setPieces),
    homeCornerConversion: parseFloat((homeConversionRate * 100).toFixed(1)),
    awayCornerConversion: parseFloat((awayConversionRate * 100).toFixed(1)),
    homeSetPieceFactor: parseFloat(homeSetPieceFactor.toFixed(3)),
    awaySetPieceFactor: parseFloat(awaySetPieceFactor.toFixed(3)),
    description: `Set piece conversion: ${(homeConversionRate * 100).toFixed(1)}% vs ${(awayConversionRate * 100).toFixed(1)}%`,
  };
}

/**
 * Calculate injury/suspension impact factor
 *
 * @param {Object} homeInjuries - Home team injuries/suspensions
 * @param {Object} awayInjuries - Away team injuries/suspensions
 * @returns {Object} Injury impact analysis
 */
export function calculateInjuryFactor(homeInjuries, awayInjuries) {
  if (!homeInjuries && !awayInjuries) {
    return {
      available: false,
      homeImpact: 1.0,
      awayImpact: 1.0,
      description: 'No injury data',
    };
  }

  // Count key player absences (strikers, midfielders worth more)
  const countImpact = (injuries) => {
    if (!injuries || !Array.isArray(injuries)) return 0;
    let impact = 0;
    injuries.forEach(injury => {
      const position = (injury.position || '').toLowerCase();
      if (position.includes('forward') || position.includes('striker')) impact += 0.08;
      else if (position.includes('midfielder')) impact += 0.05;
      else if (position.includes('defender')) impact += 0.03;
      else if (position.includes('goalkeeper')) impact += 0.1;
      else impact += 0.03;
    });
    return Math.min(impact, 0.25); // Cap at 25% impact
  };

  const homeImpactValue = countImpact(homeInjuries);
  const awayImpactValue = countImpact(awayInjuries);

  return {
    available: true,
    homeInjuryCount: homeInjuries?.length || 0,
    awayInjuryCount: awayInjuries?.length || 0,
    homeImpact: parseFloat((1 - homeImpactValue).toFixed(3)),
    awayImpact: parseFloat((1 - awayImpactValue).toFixed(3)),
    description: `Injuries: ${homeInjuries?.length || 0} vs ${awayInjuries?.length || 0}`,
  };
}

/**
 * Calculate European competition fatigue
 *
 * @param {Array} homeRecentMatches - Home team recent matches
 * @param {Array} awayRecentMatches - Away team recent matches
 * @returns {Object} European fatigue analysis
 */
export function calculateEuropeanFatigue(homeRecentMatches, awayRecentMatches) {
  const checkEuropeanMatch = (matches) => {
    if (!matches || matches.length === 0) return { hasEuropean: false, midweekEuropean: false };

    const lastWeek = matches.slice(0, 3);
    let hasEuropean = false;
    let midweekEuropean = false;

    lastWeek.forEach(match => {
      const leagueName = (match.league?.name || '').toLowerCase();
      if (leagueName.includes('champions') || leagueName.includes('europa') || leagueName.includes('conference')) {
        hasEuropean = true;
        const matchDay = new Date(match.starting_at).getDay();
        if (matchDay >= 2 && matchDay <= 4) midweekEuropean = true; // Tue-Thu
      }
    });

    return { hasEuropean, midweekEuropean };
  };

  const homeEuropean = checkEuropeanMatch(homeRecentMatches);
  const awayEuropean = checkEuropeanMatch(awayRecentMatches);

  let homeFatigueFactor = 1.0;
  let awayFatigueFactor = 1.0;

  if (homeEuropean.midweekEuropean) homeFatigueFactor = LEAGUE_AVERAGES.europeanFatigueFactor || 0.92;
  else if (homeEuropean.hasEuropean) homeFatigueFactor = 0.96;

  if (awayEuropean.midweekEuropean) awayFatigueFactor = LEAGUE_AVERAGES.europeanFatigueFactor || 0.92;
  else if (awayEuropean.hasEuropean) awayFatigueFactor = 0.96;

  return {
    available: true,
    homeInEurope: homeEuropean.hasEuropean,
    awayInEurope: awayEuropean.hasEuropean,
    homeMidweekEuropean: homeEuropean.midweekEuropean,
    awayMidweekEuropean: awayEuropean.midweekEuropean,
    homeFatigueFactor: parseFloat(homeFatigueFactor.toFixed(3)),
    awayFatigueFactor: parseFloat(awayFatigueFactor.toFixed(3)),
    description: homeEuropean.hasEuropean || awayEuropean.hasEuropean
      ? `European: ${homeEuropean.hasEuropean ? 'Home' : ''} ${awayEuropean.hasEuropean ? 'Away' : ''}`
      : 'No European matches',
  };
}

/**
 * Calculate travel distance factor for away team
 *
 * @param {Object} homeVenue - Home venue with coordinates
 * @param {Object} awayTeam - Away team with venue coordinates
 * @returns {Object} Travel analysis
 */
export function calculateTravelFactor(homeVenue, awayTeam) {
  if (!homeVenue?.coordinates || !awayTeam?.venue?.coordinates) {
    return {
      available: false,
      distanceKm: 0,
      factor: 1.0,
      description: 'Location data not available',
    };
  }

  // Haversine formula to calculate distance
  const toRad = (deg) => deg * Math.PI / 180;
  const R = 6371; // Earth radius in km

  const lat1 = homeVenue.coordinates.latitude || homeVenue.latitude;
  const lon1 = homeVenue.coordinates.longitude || homeVenue.longitude;
  const lat2 = awayTeam.venue?.coordinates?.latitude || awayTeam.venue?.latitude;
  const lon2 = awayTeam.venue?.coordinates?.longitude || awayTeam.venue?.longitude;

  if (!lat1 || !lon1 || !lat2 || !lon2) {
    return { available: false, distanceKm: 0, factor: 1.0, description: 'Coordinates missing' };
  }

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;

  let factor = 1.0;
  const threshold = LEAGUE_AVERAGES.longDistanceTravelKm || 500;

  if (distance > threshold * 2) factor = 0.94; // Very long travel
  else if (distance > threshold) factor = LEAGUE_AVERAGES.travelFatigueFactor || 0.97;

  return {
    available: true,
    distanceKm: Math.round(distance),
    factor: parseFloat(factor.toFixed(3)),
    description: `Travel: ${Math.round(distance)}km`,
  };
}

/**
 * Calculate seasonal trend factor
 *
 * @param {Object} standings - League standings to determine season progress
 * @param {Date} matchDate - Match date
 * @returns {Object} Seasonal analysis
 */
export function calculateSeasonalFactor(standings, matchDate) {
  if (!standings || standings.length === 0) {
    return {
      available: false,
      phase: 'unknown',
      factor: 1.0,
      description: 'No season data',
    };
  }

  // Estimate season progress from played games
  const avgPlayed = standings.reduce((sum, s) => sum + (s.games_played || s.played || 0), 0) / standings.length;
  const totalGames = (standings.length - 1) * 2; // Typical league format
  const progress = totalGames > 0 ? avgPlayed / totalGames : 0.5;

  let phase = 'mid-season';
  let factor = LEAGUE_AVERAGES.midSeasonFactor || 1.0;

  if (progress < 0.25) {
    phase = 'early-season';
    factor = LEAGUE_AVERAGES.earlySeasonFactor || 0.95;
  } else if (progress > 0.75) {
    phase = 'late-season';
    factor = LEAGUE_AVERAGES.lateSeasonFactor || 1.05;
  }

  return {
    available: true,
    progress: parseFloat((progress * 100).toFixed(0)),
    phase,
    factor: parseFloat(factor.toFixed(3)),
    description: `Season: ${phase} (${(progress * 100).toFixed(0)}% complete)`,
  };
}

/**
 * Calculate time-based goal pattern factor
 *
 * @param {Object} homeStats - Home team statistics with goal timing
 * @param {Object} awayStats - Away team statistics with goal timing
 * @returns {Object} Time pattern analysis
 */
export function calculateTimePatternFactor(homeStats, awayStats) {
  const leaguePattern = LEAGUE_AVERAGES.goalsBy15Min || {
    '0-15': 0.12, '15-30': 0.14, '30-45': 0.15,
    '45-60': 0.16, '60-75': 0.18, '75-90': 0.25,
  };

  // Extract goal timing if available
  const homeEarlyGoals = homeStats?.goalTiming?.early || leaguePattern['0-15'] + leaguePattern['15-30'];
  const homeLateGoals = homeStats?.goalTiming?.late || leaguePattern['60-75'] + leaguePattern['75-90'];
  const awayEarlyGoals = awayStats?.goalTiming?.early || leaguePattern['0-15'] + leaguePattern['15-30'];
  const awayLateGoals = awayStats?.goalTiming?.late || leaguePattern['60-75'] + leaguePattern['75-90'];

  // Teams that score late may benefit from betting on late goals
  const homeLateFactor = homeLateGoals > 0.45 ? 1.1 : 1.0;
  const awayLateFactor = awayLateGoals > 0.45 ? 1.1 : 1.0;

  return {
    available: !!(homeStats?.goalTiming || awayStats?.goalTiming),
    homeEarlyGoalRatio: parseFloat(homeEarlyGoals.toFixed(2)),
    homeLateGoalRatio: parseFloat(homeLateGoals.toFixed(2)),
    awayEarlyGoalRatio: parseFloat(awayEarlyGoals.toFixed(2)),
    awayLateGoalRatio: parseFloat(awayLateGoals.toFixed(2)),
    homeLateFactor: parseFloat(homeLateFactor.toFixed(3)),
    awayLateFactor: parseFloat(awayLateFactor.toFixed(3)),
    description: `Late goals: Home ${(homeLateGoals * 100).toFixed(0)}%, Away ${(awayLateGoals * 100).toFixed(0)}%`,
  };
}

export default {
  processRefereeStats,
  processWeatherConditions,
  processHeadToHead,
  calculateMatchImportance,
  calculateRestDays,
  detectDerby,
  calculateTimeOfDay,
  generateMatchFactors,
  // New advanced factors
  calculateXGFactor,
  calculatePossessionFactor,
  calculateSetPieceFactor,
  calculateInjuryFactor,
  calculateEuropeanFatigue,
  calculateTravelFactor,
  calculateSeasonalFactor,
  calculateTimePatternFactor,
};
