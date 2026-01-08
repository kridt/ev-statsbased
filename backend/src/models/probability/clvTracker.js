/**
 * Closing Line Value (CLV) Tracker - Supabase Version
 *
 * Tracks whether our value bet recommendations beat the closing line.
 * Data is persisted in Supabase PostgreSQL database.
 *
 * CLV = (Our Odds - Closing Odds) / Closing Odds * 100
 */

import { supabase } from '../../config/supabase.js';

/**
 * Convert bet object to database record format
 */
const betToRecord = (bet) => ({
  // ID: unique per bet opportunity (fixture + market + selection + line)
  id: `${bet.fixtureId}-${bet.marketId || bet.market}-${bet.selectionLine || bet.selection || ''}-${bet.points || bet.line || 0}`,
  fixture_id: bet.fixtureId,
  fixture_name: bet.fixtureName,
  market: bet.market,
  market_id: bet.marketId,
  selection: bet.selection,
  selection_name: bet.selectionName,
  line: bet.points || bet.line,
  bet_type: bet.betType,
  opening_odds: bet.bookmakerOdds,
  opening_bookmaker: bet.bookmaker,
  opening_sharp_odds: bet.sharpOdds,
  opening_sharp_book: bet.sharpBook,
  model_probability: bet.probability,
  model_fair_odds: bet.fairOdds,
  model_edge: bet.edge,
  confidence: bet.grade || bet.confidence,
  match_start_time: bet.startingAt,
});

/**
 * Convert database record to bet object format
 */
const recordToBet = (record) => ({
  id: record.id,
  fixtureId: record.fixture_id,
  fixtureName: record.fixture_name,
  market: record.market,
  marketId: record.market_id,
  selection: record.selection,
  selectionName: record.selection_name,
  line: record.line,
  betType: record.bet_type,
  openingOdds: record.opening_odds,
  openingBookmaker: record.opening_bookmaker,
  openingSharpOdds: record.opening_sharp_odds,
  openingSharpBook: record.opening_sharp_book,
  modelProbability: record.model_probability,
  modelFairOdds: record.model_fair_odds,
  modelEdge: record.model_edge,
  confidence: record.confidence,
  recordedAt: record.recorded_at,
  matchStartTime: record.match_start_time,
  closingOdds: record.closing_odds,
  closingSharpOdds: record.closing_sharp_odds,
  closedAt: record.closed_at,
  outcome: record.outcome,
  actualResult: record.actual_result,
  settledAt: record.settled_at,
  clv: record.clv,
  clvPercent: record.clv_percent,
  beatClosingLine: record.beat_closing_line,
});

class CLVTracker {
  constructor() {
    this.enabled = !!supabase;
    if (!this.enabled) {
      console.warn('[CLV] Supabase not configured - CLV tracking disabled');
    }
  }

  /**
   * Record a new value bet for CLV tracking
   */
  async recordBet(bet) {
    if (!this.enabled) return null;

    try {
      const record = betToRecord(bet);

      const { data, error } = await supabase
        .from('clv_bets')
        .upsert(record, { onConflict: 'id' })
        .select()
        .single();

      if (error) throw error;

      console.log(`[CLV] Recorded bet: ${record.selection_name} @${record.opening_odds}`);
      return recordToBet(data);
    } catch (err) {
      console.error('[CLV] Error recording bet:', err.message);
      return null;
    }
  }

  /**
   * Record multiple bets at once
   */
  async recordBets(bets) {
    if (!this.enabled || !bets.length) return [];

    try {
      const records = bets.map(betToRecord);

      const { data, error } = await supabase
        .from('clv_bets')
        .upsert(records, { onConflict: 'id' })
        .select();

      if (error) throw error;

      console.log(`[CLV] Recorded ${data.length} bets`);
      return data.map(recordToBet);
    } catch (err) {
      console.error('[CLV] Error recording bets:', err.message);
      return [];
    }
  }

  /**
   * Update closing odds for a fixture
   */
  async recordClosingOdds(fixtureId, closingOddsData) {
    if (!this.enabled) return 0;

    try {
      // Get pending bets for this fixture
      const { data: bets, error: fetchError } = await supabase
        .from('clv_bets')
        .select('*')
        .eq('fixture_id', fixtureId)
        .is('closing_odds', null);

      if (fetchError) throw fetchError;
      if (!bets || bets.length === 0) return 0;

      let updatedCount = 0;

      for (const bet of bets) {
        const closingOdd = this.findMatchingOdds(recordToBet(bet), closingOddsData);

        if (closingOdd) {
          const clvResult = this.calculateCLV(bet.opening_odds, closingOdd.playableOdds);

          const { error: updateError } = await supabase
            .from('clv_bets')
            .update({
              closing_odds: closingOdd.playableOdds,
              closing_sharp_odds: closingOdd.sharpOdds,
              closed_at: new Date().toISOString(),
              clv: clvResult.clv,
              clv_percent: clvResult.clvPercent,
              beat_closing_line: clvResult.beatClosingLine,
            })
            .eq('id', bet.id);

          if (!updateError) {
            updatedCount++;
            console.log(`[CLV] Closing odds: ${bet.selection_name} @${bet.opening_odds} -> @${closingOdd.playableOdds} (CLV: ${clvResult.clvPercent > 0 ? '+' : ''}${clvResult.clvPercent.toFixed(2)}%)`);
          }
        }
      }

      return updatedCount;
    } catch (err) {
      console.error('[CLV] Error recording closing odds:', err.message);
      return 0;
    }
  }

  /**
   * Find matching odds from closing odds data
   */
  findMatchingOdds(bet, closingOddsData) {
    if (!closingOddsData?.bookmakers) return null;

    for (const [bookmaker, odds] of Object.entries(closingOddsData.bookmakers)) {
      for (const odd of odds) {
        const matchesMarket = odd.marketId === bet.marketId ||
          odd.market?.toLowerCase().includes(bet.market?.toLowerCase());
        const matchesSelection = odd.selection === bet.selection ||
          odd.selectionLine === bet.selection;
        const matchesLine = Math.abs((odd.points || 0) - (bet.line || 0)) < 0.01;

        if (matchesMarket && matchesSelection && matchesLine) {
          return {
            playableOdds: odd.decimalOdds,
            sharpOdds: odd.isSharp ? odd.decimalOdds : null,
            bookmaker: bookmaker,
          };
        }
      }
    }

    return null;
  }

  /**
   * Calculate CLV between opening and closing odds
   */
  calculateCLV(openingOdds, closingOdds) {
    if (!openingOdds || !closingOdds || closingOdds <= 1) {
      return { clv: 0, clvPercent: 0, beatClosingLine: false };
    }

    const clv = (openingOdds - closingOdds) / closingOdds;
    const clvPercent = clv * 100;
    const beatClosingLine = openingOdds > closingOdds;

    return {
      clv: parseFloat(clv.toFixed(6)),
      clvPercent: parseFloat(clvPercent.toFixed(4)),
      beatClosingLine,
    };
  }

  /**
   * Record bet outcome after match finishes
   */
  async recordOutcome(betId, outcome, actualResult = null) {
    if (!this.enabled) return null;

    try {
      const { data, error } = await supabase
        .from('clv_bets')
        .update({
          outcome,
          actual_result: actualResult?.toString(),
          settled_at: new Date().toISOString(),
        })
        .eq('id', betId)
        .select()
        .single();

      if (error) throw error;

      console.log(`[CLV] Settled: ${data.selection_name} - ${outcome.toUpperCase()}`);
      return recordToBet(data);
    } catch (err) {
      console.error('[CLV] Error recording outcome:', err.message);
      return null;
    }
  }

  /**
   * Auto-settle bets based on fixture results
   */
  async settleFixtureBets(fixtureId, fixtureStats) {
    if (!this.enabled) return [];

    try {
      const { data: bets, error } = await supabase
        .from('clv_bets')
        .select('*')
        .eq('fixture_id', fixtureId)
        .is('outcome', null);

      if (error) throw error;
      if (!bets || bets.length === 0) return [];

      const results = [];

      for (const bet of bets) {
        const betObj = recordToBet(bet);
        const outcome = this.determineOutcome(betObj, fixtureStats);

        if (outcome) {
          const result = await this.recordOutcome(bet.id, outcome.result, outcome.actualValue);
          if (result) results.push(result);
        }
      }

      return results;
    } catch (err) {
      console.error('[CLV] Error settling fixture bets:', err.message);
      return [];
    }
  }

  /**
   * Determine outcome based on bet type and fixture stats
   */
  determineOutcome(bet, stats) {
    if (!stats) return null;

    let actualValue = null;
    let result = null;

    switch (bet.betType) {
      case 'corners':
        actualValue = stats.corners?.total || stats.totalCorners;
        break;
      case 'cards':
        actualValue = stats.cards?.total || stats.totalCards;
        break;
      case 'goals':
        actualValue = stats.goals?.total || (stats.homeGoals + stats.awayGoals);
        break;
      case 'btts':
        const homeScored = (stats.homeGoals || 0) > 0;
        const awayScored = (stats.awayGoals || 0) > 0;
        actualValue = homeScored && awayScored ? 'Yes' : 'No';
        break;
      default:
        return null;
    }

    if (actualValue === null || actualValue === undefined) return null;

    const selection = (bet.selection || '').toLowerCase();
    const line = bet.line;

    if (selection.includes('over')) {
      result = actualValue > line ? 'win' : actualValue < line ? 'loss' : 'push';
    } else if (selection.includes('under')) {
      result = actualValue < line ? 'win' : actualValue > line ? 'loss' : 'push';
    } else if (bet.betType === 'btts') {
      result = actualValue === bet.selection ? 'win' : 'loss';
    }

    return { result, actualValue };
  }

  /**
   * Get pending bets (not yet settled)
   */
  async getPendingBets() {
    if (!this.enabled) return [];

    try {
      const { data, error } = await supabase
        .from('clv_bets')
        .select('*')
        .is('outcome', null)
        .order('recorded_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(recordToBet);
    } catch (err) {
      console.error('[CLV] Error getting pending bets:', err.message);
      return [];
    }
  }

  /**
   * Get completed bets
   */
  async getCompletedBets(limit = 100) {
    if (!this.enabled) return [];

    try {
      const { data, error } = await supabase
        .from('clv_bets')
        .select('*')
        .not('outcome', 'is', null)
        .order('settled_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []).map(recordToBet);
    } catch (err) {
      console.error('[CLV] Error getting completed bets:', err.message);
      return [];
    }
  }

  /**
   * Get aggregate CLV statistics
   */
  async getStats() {
    if (!this.enabled) return this.getEmptyStats();

    try {
      // Get all bets
      const { data: allBets, error } = await supabase
        .from('clv_bets')
        .select('*');

      if (error) throw error;
      if (!allBets || allBets.length === 0) return this.getEmptyStats();

      const completed = allBets.filter(b => b.outcome);
      const pending = allBets.filter(b => !b.outcome);

      const stats = this.getEmptyStats();
      stats.totalBets = allBets.length;
      stats.settledBets = completed.length;
      stats.pendingBets = pending.length;

      if (completed.length === 0) return stats;

      // Calculate CLV metrics
      let totalCLV = 0;
      let clvBeats = 0;
      const gradeStats = { A: [], B: [], C: [], D: [] };
      const marketStats = {};

      for (const bet of completed) {
        if (bet.clv_percent !== null) {
          totalCLV += parseFloat(bet.clv_percent);
          if (bet.beat_closing_line) clvBeats++;
        }

        if (bet.outcome === 'win') stats.wins++;
        else if (bet.outcome === 'loss') stats.losses++;
        else if (bet.outcome === 'push') stats.pushes++;

        const grade = bet.confidence || 'C';
        if (gradeStats[grade]) gradeStats[grade].push(bet);

        const market = bet.bet_type || 'other';
        if (!marketStats[market]) {
          marketStats[market] = { bets: [], wins: 0, clvTotal: 0 };
        }
        marketStats[market].bets.push(bet);
        if (bet.outcome === 'win') marketStats[market].wins++;
        if (bet.clv_percent) marketStats[market].clvTotal += parseFloat(bet.clv_percent);
      }

      stats.avgCLV = completed.length > 0 ? totalCLV / completed.length : 0;
      stats.clvHitRate = completed.length > 0 ? (clvBeats / completed.length) * 100 : 0;
      stats.totalCLV = totalCLV;
      stats.winRate = stats.settledBets > 0 ? (stats.wins / (stats.wins + stats.losses)) * 100 : 0;

      // Grade breakdown
      for (const [grade, bets] of Object.entries(gradeStats)) {
        if (bets.length > 0) {
          const wins = bets.filter(b => b.outcome === 'win').length;
          const clvSum = bets.reduce((sum, b) => sum + (parseFloat(b.clv_percent) || 0), 0);
          stats.byGrade[grade] = {
            bets: bets.length,
            avgCLV: parseFloat((clvSum / bets.length).toFixed(2)),
            winRate: parseFloat(((wins / bets.length) * 100).toFixed(1)),
          };
        }
      }

      // Market breakdown
      for (const [market, data] of Object.entries(marketStats)) {
        stats.byMarket[market] = {
          bets: data.bets.length,
          avgCLV: parseFloat((data.clvTotal / data.bets.length).toFixed(2)),
          winRate: parseFloat(((data.wins / data.bets.length) * 100).toFixed(1)),
        };
      }

      stats.lastUpdated = new Date().toISOString();
      return stats;
    } catch (err) {
      console.error('[CLV] Error getting stats:', err.message);
      return this.getEmptyStats();
    }
  }

  /**
   * Empty stats structure
   */
  getEmptyStats() {
    return {
      totalBets: 0,
      settledBets: 0,
      pendingBets: 0,
      avgCLV: 0,
      clvHitRate: 0,
      totalCLV: 0,
      wins: 0,
      losses: 0,
      pushes: 0,
      winRate: 0,
      totalStaked: 0,
      totalReturn: 0,
      roi: 0,
      byGrade: {
        A: { bets: 0, avgCLV: 0, winRate: 0 },
        B: { bets: 0, avgCLV: 0, winRate: 0 },
        C: { bets: 0, avgCLV: 0, winRate: 0 },
        D: { bets: 0, avgCLV: 0, winRate: 0 },
      },
      byMarket: {},
      dailyStats: [],
      lastUpdated: null,
    };
  }

  /**
   * Generate CLV report
   */
  async generateReport() {
    const stats = await this.getStats();
    const pending = await this.getPendingBets();
    const completed = await this.getCompletedBets(20);

    return {
      summary: {
        totalBets: stats.totalBets,
        settledBets: stats.settledBets,
        pendingBets: stats.pendingBets,
        clv: {
          average: `${stats.avgCLV > 0 ? '+' : ''}${stats.avgCLV.toFixed(2)}%`,
          hitRate: `${stats.clvHitRate.toFixed(1)}%`,
          interpretation: this.interpretCLV(stats.avgCLV),
        },
        performance: {
          wins: stats.wins,
          losses: stats.losses,
          winRate: `${stats.winRate.toFixed(1)}%`,
        },
      },
      byGrade: stats.byGrade,
      byMarket: stats.byMarket,
      recentBets: completed,
      pendingBets: pending,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Interpret CLV value
   */
  interpretCLV(avgCLV) {
    if (avgCLV >= 3) return 'Excellent - Strong long-term edge';
    if (avgCLV >= 1.5) return 'Good - Consistent value found';
    if (avgCLV >= 0.5) return 'Decent - Slight edge over market';
    if (avgCLV >= 0) return 'Break-even - No clear edge';
    if (avgCLV >= -1) return 'Slight negative - Review selection criteria';
    return 'Concerning - Model may need recalibration';
  }
}

// Export singleton instance
export const clvTracker = new CLVTracker();
export default clvTracker;
