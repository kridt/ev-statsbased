// Format number with K/M suffix
export function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

// Get match result for a team
export function getMatchResult(match, teamId) {
  const isHome = match.participants?.find(p => p.meta?.location === 'home')?.id === teamId;
  const homeScore = match.scores?.find(s => s.score?.participant === 'home')?.score?.goals || 0;
  const awayScore = match.scores?.find(s => s.score?.participant === 'away')?.score?.goals || 0;

  if (isHome) {
    if (homeScore > awayScore) return 'W';
    if (homeScore < awayScore) return 'L';
    return 'D';
  } else {
    if (awayScore > homeScore) return 'W';
    if (awayScore < homeScore) return 'L';
    return 'D';
  }
}

// Format match state
export const STATE_LABELS = {
  NS: 'Not Started',
  INPLAY_1ST_HALF: '1st Half',
  INPLAY_2ND_HALF: '2nd Half',
  HT: 'Half Time',
  FT: 'Full Time',
  FT_PEN: 'Full Time (Pen)',
  AET: 'After Extra Time',
  BREAK: 'Break',
  ET: 'Extra Time',
  PEN_LIVE: 'Penalties',
  SUSP: 'Suspended',
  INT: 'Interrupted',
  POSTP: 'Postponed',
  CANC: 'Cancelled',
  ABD: 'Abandoned',
  AWD: 'Awarded',
  WO: 'Walkover',
  LIVE: 'Live',
};

export function getStateLabel(state) {
  return STATE_LABELS[state] || state;
}

// Check if match is live
export function isMatchLive(state) {
  return ['INPLAY_1ST_HALF', 'INPLAY_2ND_HALF', 'HT', 'BREAK', 'ET', 'PEN_LIVE', 'LIVE'].includes(state);
}

// Check if match is finished
export function isMatchFinished(state) {
  return ['FT', 'FT_PEN', 'AET', 'ABD', 'AWD', 'WO'].includes(state);
}

// Truncate text with ellipsis
export function truncate(text, maxLength = 20) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

// Generate unique ID
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Delay helper for animations
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
