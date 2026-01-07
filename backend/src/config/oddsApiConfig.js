/**
 * Odds API Configuration
 *
 * API Documentation: https://api2.odds-api.io/v3/docs/index.html
 */

export const ODDS_API_CONFIG = {
  baseUrl: 'https://api2.odds-api.io/v3',
  apiKey: process.env.ODDS_API_KEY || '811e5fb0efa75d2b92e800cb55b60b30f62af8c21da06c4b2952eb516bee0a2e',

  // Default bookmakers to fetch odds from (comma-separated, max 30)
  // These are the 20 bookmakers available on the current plan
  defaultBookmakers: [
    'Pinnacle',      // Sharp book - best for true odds
    'Bet365',        // Most popular
    'Kambi',         // B2B provider (powers Unibet, 888, LeoVegas, etc.)
    'Betano',
    'DraftKings',
    'FanDuel',
    'Caesars',
    'BetMGM',
    'BetRivers',
    '888Sport',
    'Unibet DK',
  ].join(','),

  // Cache TTL in seconds
  cacheTTL: {
    events: 300,      // 5 minutes for events list
    odds: 60,         // 1 minute for odds (they change frequently)
    leagues: 86400,   // 24 hours for leagues
    teams: 3600,      // 1 hour for team data
  },
};

/**
 * League mapping: SportMonks league ID -> Odds API league slug
 * This maps leagues between the two APIs
 */
export const LEAGUE_MAPPING = {
  // England
  8: 'england-premier-league',      // Premier League
  9: 'england-championship',         // Championship
  24: 'england-fa-cup',              // FA Cup
  27: 'england-efl-cup',             // Carabao Cup / EFL Cup

  // Italy
  384: 'italy-serie-a',              // Serie A
  387: 'italy-serie-b',              // Serie B
  390: 'italy-coppa-italia',         // Coppa Italia

  // Spain
  564: 'spain-laliga',               // La Liga
  567: 'spain-laliga-2',             // La Liga 2
  570: 'spain-copa-del-rey',         // Copa Del Rey

  // Germany
  82: 'germany-bundesliga',          // Bundesliga

  // France
  301: 'france-ligue-1',             // Ligue 1

  // Netherlands
  72: 'netherlands-eredivisie',      // Eredivisie

  // Portugal
  462: 'portugal-liga-portugal',     // Liga Portugal

  // Belgium
  208: 'belgium-pro-league',         // Pro League

  // Austria
  181: 'austria-bundesliga',         // Admiral Bundesliga

  // Denmark
  271: 'denmark-superliga',          // Superliga

  // Sweden
  573: 'sweden-allsvenskan',         // Allsvenskan

  // Norway
  444: 'norway-eliteserien',         // Eliteserien

  // Scotland
  501: 'scotland-premiership',       // Premiership

  // Switzerland
  591: 'switzerland-super-league',   // Super League

  // Turkey
  600: 'turkey-super-lig',           // Super Lig

  // Poland
  453: 'poland-ekstraklasa',         // Ekstraklasa

  // Croatia
  244: 'croatia-hnl',                // 1. HNL

  // Russia (may not be available)
  486: 'russia-premier-league',      // Premier League
};

/**
 * Reverse mapping: Odds API slug -> SportMonks league ID
 */
export const REVERSE_LEAGUE_MAPPING = Object.entries(LEAGUE_MAPPING).reduce(
  (acc, [sportmonksId, oddsApiSlug]) => {
    acc[oddsApiSlug] = parseInt(sportmonksId);
    return acc;
  },
  {}
);

/**
 * Get Odds API league slug from SportMonks league ID
 */
export function getOddsApiLeague(sportmonksLeagueId) {
  return LEAGUE_MAPPING[sportmonksLeagueId] || null;
}

/**
 * Get SportMonks league ID from Odds API league slug
 */
export function getSportmonksLeague(oddsApiSlug) {
  return REVERSE_LEAGUE_MAPPING[oddsApiSlug] || null;
}

export default {
  ODDS_API_CONFIG,
  LEAGUE_MAPPING,
  REVERSE_LEAGUE_MAPPING,
  getOddsApiLeague,
  getSportmonksLeague,
};
