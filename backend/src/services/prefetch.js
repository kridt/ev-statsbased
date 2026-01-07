import { cache } from '../config/redis.js';
import sportmonks from './sportmonks.js';

// Prefetch configuration
const PREFETCH_CONFIG = {
  DAYS_BEFORE: 3,    // Prefetch 3 days in the past
  DAYS_AFTER: 7,     // Prefetch 7 days in the future
  TTL: 1800,         // 30 minutes TTL for prefetched data
  VALUE_BETS_TTL: 600, // 10 minutes TTL for value bets
  VALUE_BETS_DAYS: 3,  // Only prefetch value bets for next 3 days
};

/**
 * Get array of dates to prefetch (today-3 to today+7)
 */
function getDateRange() {
  const dates = [];
  const today = new Date();

  for (let i = -PREFETCH_CONFIG.DAYS_BEFORE; i <= PREFETCH_CONFIG.DAYS_AFTER; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    dates.push(formatDate(date));
  }

  return dates;
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Prefetch fixtures for a single date
 */
async function prefetchDate(date) {
  const cacheKey = `fixtures:date:${date}`;

  try {
    // Force fetch from API (bypass cache)
    const response = await sportmonks.getFixturesByDate(date);

    // Store with longer TTL
    await cache.set(cacheKey, response, PREFETCH_CONFIG.TTL);

    return { date, success: true, count: response?.length || 0 };
  } catch (error) {
    console.error(`[Prefetch] Failed to prefetch ${date}:`, error.message);
    return { date, success: false, error: error.message };
  }
}

/**
 * Prefetch all dates in the configured range
 */
async function prefetchAllDates() {
  const dates = getDateRange();
  const startTime = Date.now();

  console.log(`[Prefetch] Starting prefetch for ${dates.length} dates...`);

  // Fetch all dates in parallel (but limit concurrency)
  const results = await Promise.all(
    dates.map(date => prefetchDate(date))
  );

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalFixtures = successful.reduce((sum, r) => sum + r.count, 0);
  const duration = Date.now() - startTime;

  console.log(`[Prefetch] Complete: ${successful.length}/${dates.length} dates, ${totalFixtures} fixtures in ${duration}ms`);

  if (failed.length > 0) {
    console.log(`[Prefetch] Failed dates: ${failed.map(f => f.date).join(', ')}`);
  }

  return { successful: successful.length, failed: failed.length, totalFixtures, duration };
}

/**
 * Prefetch live fixtures
 */
async function prefetchLive() {
  try {
    const fixtures = await sportmonks.getLiveFixtures();
    await cache.set('fixtures:live', fixtures, 30); // 30 second TTL for live
    console.log(`[Prefetch] Live fixtures updated: ${fixtures?.length || 0} matches`);
    return { success: true, count: fixtures?.length || 0 };
  } catch (error) {
    console.error('[Prefetch] Failed to prefetch live fixtures:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Get dates for value bets prefetch (today to today+3)
 */
function getValueBetsDateRange() {
  const dates = [];
  const today = new Date();

  for (let i = 0; i <= PREFETCH_CONFIG.VALUE_BETS_DAYS; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    dates.push(formatDate(date));
  }

  return dates;
}

/**
 * Prefetch value bets for a single date via internal HTTP request
 */
async function prefetchValueBetsForDate(date, port = process.env.PORT || 3001) {
  try {
    const url = `http://localhost:${port}/api/probability/value-bets?date=${date}`;
    const response = await fetch(url, {
      method: 'GET',
      timeout: 120000 // 2 minute timeout - value bets take longer
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[Prefetch] Value bets for ${date}: ${data?.data?.length || 0} bets`);
    return { date, success: true, count: data?.data?.length || 0 };
  } catch (error) {
    console.error(`[Prefetch] Failed to prefetch value bets for ${date}:`, error.message);
    return { date, success: false, error: error.message };
  }
}

/**
 * Prefetch value bets for all upcoming dates (sequentially to avoid overload)
 */
async function prefetchAllValueBets() {
  const dates = getValueBetsDateRange();
  const startTime = Date.now();

  console.log(`[Prefetch] Starting value bets prefetch for ${dates.length} dates...`);

  // Process sequentially (value bets are heavy - avoid parallel)
  const results = [];
  for (const date of dates) {
    const result = await prefetchValueBetsForDate(date);
    results.push(result);
  }

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalBets = successful.reduce((sum, r) => sum + r.count, 0);
  const duration = Date.now() - startTime;

  console.log(`[Prefetch] Value bets complete: ${successful.length}/${dates.length} dates, ${totalBets} bets in ${duration}ms`);

  if (failed.length > 0) {
    console.log(`[Prefetch] Failed value bets dates: ${failed.map(f => f.date).join(', ')}`);
  }

  return { successful: successful.length, failed: failed.length, totalBets, duration };
}

/**
 * Start initial prefetch on server startup
 */
async function startPrefetch() {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║   📦 Starting Data Prefetch                           ║
║   Range: ${PREFETCH_CONFIG.DAYS_BEFORE} days before → ${PREFETCH_CONFIG.DAYS_AFTER} days after              ║
╚═══════════════════════════════════════════════════════╝
  `);

  // Prefetch all dates
  const result = await prefetchAllDates();

  // Also prefetch live fixtures
  await prefetchLive();

  return result;
}

export default {
  startPrefetch,
  prefetchAllDates,
  prefetchDate,
  prefetchLive,
  prefetchAllValueBets,
  prefetchValueBetsForDate,
  getDateRange,
  getValueBetsDateRange,
  PREFETCH_CONFIG,
};
