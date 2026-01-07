import cron from 'node-cron';
import prefetch from '../services/prefetch.js';
import { valueBetsService } from '../services/valueBetsService.js';

let scheduledJobs = [];

/**
 * Start all scheduled jobs
 */
function startScheduler() {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║   ⏰ Starting Scheduler                               ║
╚═══════════════════════════════════════════════════════╝
  `);

  // Refresh fixtures every 10 minutes
  const fixturesJob = cron.schedule('*/10 * * * *', async () => {
    console.log('[Scheduler] Running fixtures prefetch...');
    await prefetch.prefetchAllDates();
  }, {
    scheduled: true,
    timezone: 'UTC'
  });

  scheduledJobs.push(fixturesJob);
  console.log('[Scheduler] ✓ Fixtures refresh: every 10 minutes');

  // Refresh live fixtures every 30 seconds
  const liveJob = cron.schedule('*/30 * * * * *', async () => {
    await prefetch.prefetchLive();
  }, {
    scheduled: true,
    timezone: 'UTC'
  });

  scheduledJobs.push(liveJob);
  console.log('[Scheduler] ✓ Live fixtures refresh: every 30 seconds');

  // NEW: Market scan for value bets every 30 seconds
  const marketScanJob = cron.schedule('*/30 * * * * *', async () => {
    try {
      await valueBetsService.runScan();
    } catch (error) {
      console.error('[Scheduler] Market scan error:', error.message);
    }
  }, {
    scheduled: true,
    timezone: 'UTC'
  });

  scheduledJobs.push(marketScanJob);
  console.log('[Scheduler] ✓ Market scan for value bets: every 30 seconds');

  // Legacy: Keep the old value bets prefetch for backward compatibility (every 10 minutes)
  // This uses the old probability route - will be deprecated
  const legacyValueBetsJob = cron.schedule('*/10 * * * *', async () => {
    console.log('[Scheduler] Running legacy value bets prefetch...');
    await prefetch.prefetchAllValueBets();
  }, {
    scheduled: true,
    timezone: 'UTC'
  });

  scheduledJobs.push(legacyValueBetsJob);
  console.log('[Scheduler] ✓ Legacy value bets refresh: every 10 minutes');

  // Initial market scan after 5 seconds (server needs to be ready)
  setTimeout(async () => {
    console.log('[Scheduler] Initial market scan starting...');
    try {
      await valueBetsService.runScan();
    } catch (error) {
      console.error('[Scheduler] Initial market scan error:', error.message);
    }
  }, 5000);

  // Initial legacy value bets prefetch after 10 seconds
  setTimeout(async () => {
    console.log('[Scheduler] Initial legacy value bets prefetch starting...');
    await prefetch.prefetchAllValueBets();
  }, 10000);

  console.log('[Scheduler] All jobs started');
}

/**
 * Stop all scheduled jobs
 */
function stopScheduler() {
  scheduledJobs.forEach(job => job.stop());
  scheduledJobs = [];
  console.log('[Scheduler] All jobs stopped');
}

export default {
  startScheduler,
  stopScheduler,
};
