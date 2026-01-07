/**
 * OpticOdds API Configuration
 *
 * API Documentation: https://developer.opticodds.com
 * Base URL: https://api.opticodds.com/api/v3
 */

export const OPTIC_ODDS_CONFIG = {
  baseUrl: 'https://api.opticodds.com/api/v3',
  apiKey: process.env.OPTIC_ODDS_API_KEY, // Required - set in .env file

  // Sport ID for soccer
  sport: 'soccer',

  // Sharp sportsbooks for calculating true probabilities (averaged)
  // OpticOdds uses opticodds_ai as a synthetic sharp line, pinnacle as market reference
  sharpBooks: ['opticodds_ai', 'pinnacle'],

  // All sportsbooks for finding value (active sportsbooks for soccer)
  // Prioritized by: playable books first, then sharp/benchmark books
  allSportsbooks: [
    // User's playable bookmakers (organized by network)
    // Independent
    'betano',           // Independent - own odds
    'bet365',           // Independent - own odds
    // Kambi Network (share odds)
    'unibet',           // Kambi network
    'unibet_(denmark)', // Kambi network - DK specific
    'leovegas',         // Kambi network
    'betsson',          // Kambi network
    'betsafe',          // Kambi network
    'nordicbet',        // Kambi network
    'expekt',           // Kambi network
    'rizk',             // Kambi network
    'coolbet',          // Kambi network
    // Smaller bookmakers
    'campobet',         // Smaller independent
    'betinia',          // Smaller bookmaker
    // Sharp books for probability calculation
    'opticodds_ai',
    'pinnacle',
    // Benchmark books for odds comparison
    'circa_sports',
    'bet99',
    'elite_bet',
  ],

  // Playable bookmakers (user can actually bet on these)
  // Organized by network for filtering
  playableBooks: [
    // Independent (unique odds)
    'betano',
    'bet365',
    // Kambi Network (shared odds - pick one)
    'unibet',
    'unibet_(denmark)',
    'leovegas',
    'betsson',
    'betsafe',
    'nordicbet',
    'expekt',
    'rizk',
    'coolbet',
    // Smaller bookmakers
    'campobet',
    'betinia',
  ],

  // Bookmaker networks for frontend filtering
  bookmakerNetworks: {
    independent: ['betano', 'bet365'],
    kambi: ['unibet', 'unibet_(denmark)', 'leovegas', 'betsson', 'betsafe', 'nordicbet', 'expekt', 'rizk', 'coolbet'],
    other: ['campobet', 'betinia']
  },

  // Display names for bookmakers
  bookmakerDisplayNames: {
    'betano': 'Betano',
    'bet365': 'Bet365',
    'unibet': 'Unibet',
    'unibet_(denmark)': 'Unibet DK',
    'leovegas': 'LeoVegas',
    'betsson': 'Betsson',
    'betsafe': 'Betsafe',
    'nordicbet': 'Nordicbet',
    'expekt': 'Expekt',
    'rizk': 'Rizk',
    'coolbet': 'Coolbet',
    'campobet': 'Campobet',
    'betinia': 'Betinia',
  },

  // Minimum edge threshold (3% = 0.03)
  minEdge: 0.03,

  // Cache TTL in seconds
  cacheTTL: {
    fixtures: 300,     // 5 minutes for fixtures list
    odds: 60,          // 1 minute for odds (they change frequently)
    leagues: 86400,    // 24 hours for leagues
    players: 3600,     // 1 hour for player data
    markets: 86400,    // 24 hours for market definitions
    sportsbooks: 86400 // 24 hours for sportsbook list
  },

  // Markets to track for EV calculations
  markets: {
    // Match markets
    match: [
      'total_goals',
      'asian_total_goals',
      'both_teams_to_score',
      'moneyline',
      'asian_handicap',
      'total_corners',
      'team_total_corners',
      'total_cards',
      'total_card_points',
      // Offsides markets
      'total_offsides',
      'team_total_offsides',
      '1st_half_total_offsides',
      '1st_half_team_total_offsides',
      // Throw-ins markets
      'total_throw_ins',
      'team_total_throw_ins',
      '1st_half_total_throw_ins',
      '1st_half_team_total_throw_ins'
    ],
    // Player prop markets
    playerProps: [
      'player_goals',
      'player_shots_on_target',
      'player_assists',
      'player_saves',
      'player_cards',
      'player_passes',
      'player_fouls_drawn',
      'anytime_goal_scorer',
      'first_goal_scorer'
    ]
  }
};

/**
 * League mapping: SportMonks league ID -> OpticOdds league ID
 * OpticOdds uses slugs like "england_-_premier_league"
 */
export const LEAGUE_MAPPING = {
  // England
  8: 'england_-_premier_league',           // Premier League
  9: 'england_-_championship',             // Championship
  24: 'england_-_fa_cup',                  // FA Cup
  27: 'england_-_efl_cup',                 // Carabao Cup / EFL Cup

  // Italy
  384: 'italy_-_serie_a',                  // Serie A
  387: 'italy_-_serie_b',                  // Serie B
  390: 'italy_-_coppa_italia',             // Coppa Italia

  // Spain
  564: 'spain_-_la_liga',                  // La Liga
  567: 'spain_-_la_liga_2',                // La Liga 2
  570: 'spain_-_copa_del_rey',             // Copa Del Rey

  // Germany
  82: 'germany_-_bundesliga',              // Bundesliga
  83: 'germany_-_2._bundesliga',           // 2. Bundesliga

  // France
  301: 'france_-_ligue_1',                 // Ligue 1
  302: 'france_-_ligue_2',                 // Ligue 2

  // Netherlands
  72: 'netherlands_-_eredivisie',          // Eredivisie

  // Portugal
  462: 'portugal_-_primeira_liga',         // Primeira Liga

  // Belgium
  208: 'belgium_-_jupiler_pro_league',     // Pro League

  // Austria
  181: 'austria_-_bundesliga',             // Bundesliga

  // Denmark
  271: 'denmark_-_superliga',              // Superliga

  // Sweden
  573: 'sweden_-_allsvenskan',             // Allsvenskan

  // Norway
  444: 'norway_-_eliteserien',             // Eliteserien

  // Scotland
  501: 'scotland_-_premiership',           // Premiership

  // Switzerland
  591: 'switzerland_-_super_league',       // Super League

  // Turkey
  600: 'turkey_-_super_lig',               // Super Lig

  // Poland
  453: 'poland_-_ekstraklasa',             // Ekstraklasa

  // Croatia
  244: 'croatia_-_1._hnl',                 // 1. HNL

  // Greece
  325: 'greece_-_super_league',            // Super League

  // Czech Republic
  262: 'czech_republic_-_1._liga',         // 1. Liga

  // MLS
  779: 'usa_-_mls',                        // MLS

  // Saudi Pro League
  955: 'saudi_arabia_-_saudi_pro_league',  // Saudi Pro League
};

/**
 * Reverse mapping: OpticOdds league slug -> SportMonks league ID
 */
export const REVERSE_LEAGUE_MAPPING = Object.entries(LEAGUE_MAPPING).reduce(
  (acc, [sportmonksId, opticOddsSlug]) => {
    acc[opticOddsSlug] = parseInt(sportmonksId);
    return acc;
  },
  {}
);

/**
 * Get OpticOdds league slug from SportMonks league ID
 */
export function getOpticOddsLeague(sportmonksLeagueId) {
  return LEAGUE_MAPPING[sportmonksLeagueId] || null;
}

/**
 * Get SportMonks league ID from OpticOdds league slug
 */
export function getSportmonksLeague(opticOddsSlug) {
  return REVERSE_LEAGUE_MAPPING[opticOddsSlug] || null;
}

/**
 * Convert American odds to decimal odds
 * @param {number} americanOdds - American odds (e.g., -110, +150)
 * @returns {number} Decimal odds (e.g., 1.91, 2.50)
 */
export function americanToDecimal(americanOdds) {
  if (americanOdds >= 100) {
    return (americanOdds / 100) + 1;
  } else {
    return (100 / Math.abs(americanOdds)) + 1;
  }
}

/**
 * Convert decimal odds to implied probability
 * @param {number} decimalOdds - Decimal odds (e.g., 1.91)
 * @returns {number} Implied probability (0-1)
 */
export function oddsToImpliedProbability(decimalOdds) {
  if (decimalOdds <= 1) return 1;
  return 1 / decimalOdds;
}

/**
 * Remove vig from a two-way market to get true probabilities
 * @param {number} decimalOdds1 - Decimal odds for outcome 1
 * @param {number} decimalOdds2 - Decimal odds for outcome 2
 * @returns {Object} { prob1, prob2 } - True probabilities summing to 1
 */
export function removeVig(decimalOdds1, decimalOdds2) {
  const implied1 = oddsToImpliedProbability(decimalOdds1);
  const implied2 = oddsToImpliedProbability(decimalOdds2);
  const totalImplied = implied1 + implied2;

  return {
    prob1: implied1 / totalImplied,
    prob2: implied2 / totalImplied,
    overround: totalImplied - 1
  };
}

export default {
  OPTIC_ODDS_CONFIG,
  LEAGUE_MAPPING,
  REVERSE_LEAGUE_MAPPING,
  getOpticOddsLeague,
  getSportmonksLeague,
  americanToDecimal,
  oddsToImpliedProbability,
  removeVig
};
