import sportmonks from '../services/sportmonks.js';

// Store connected clients and their subscriptions
const subscriptions = new Map();

export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Initialize subscription set for this client
    subscriptions.set(socket.id, new Set());

    // Subscribe to live updates
    socket.on('subscribe:live', () => {
      subscriptions.get(socket.id)?.add('live');
      socket.join('live-updates');
      console.log(`[Socket] ${socket.id} subscribed to live updates`);
    });

    // Unsubscribe from live updates
    socket.on('unsubscribe:live', () => {
      subscriptions.get(socket.id)?.delete('live');
      socket.leave('live-updates');
      console.log(`[Socket] ${socket.id} unsubscribed from live updates`);
    });

    // Subscribe to specific match
    socket.on('subscribe:match', (matchId) => {
      subscriptions.get(socket.id)?.add(`match:${matchId}`);
      socket.join(`match:${matchId}`);
      console.log(`[Socket] ${socket.id} subscribed to match ${matchId}`);
    });

    // Unsubscribe from specific match
    socket.on('unsubscribe:match', (matchId) => {
      subscriptions.get(socket.id)?.delete(`match:${matchId}`);
      socket.leave(`match:${matchId}`);
      console.log(`[Socket] ${socket.id} unsubscribed from match ${matchId}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      subscriptions.delete(socket.id);
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  // Start polling for live updates
  startLiveUpdatePolling(io);
}

// Store previous state to detect changes
let previousLiveData = null;

async function startLiveUpdatePolling(io) {
  const POLL_INTERVAL = 30000; // 30 seconds

  const pollLiveData = async () => {
    try {
      const liveFixtures = await sportmonks.getLiveFixtures();

      // Emit to all clients subscribed to live updates
      io.to('live-updates').emit('live:fixtures', liveFixtures);

      // Check for changes and emit notifications
      if (previousLiveData) {
        detectAndEmitChanges(io, previousLiveData, liveFixtures);
      }

      previousLiveData = liveFixtures;
    } catch (error) {
      console.error('[Socket] Error polling live data:', error.message);
    }
  };

  // Initial poll
  await pollLiveData();

  // Set up interval
  setInterval(pollLiveData, POLL_INTERVAL);
}

function detectAndEmitChanges(io, oldData, newData) {
  const oldMap = new Map(oldData.map(f => [f.id, f]));
  const newMap = new Map(newData.map(f => [f.id, f]));

  newData.forEach(fixture => {
    const oldFixture = oldMap.get(fixture.id);

    if (!oldFixture) {
      // New match started
      io.to('live-updates').emit('notification', {
        type: 'match_start',
        fixture,
        message: `Match started: ${getTeamNames(fixture)}`,
      });
      return;
    }

    // Check for score changes (goals)
    const oldScore = getScore(oldFixture);
    const newScore = getScore(fixture);

    if (oldScore.home !== newScore.home || oldScore.away !== newScore.away) {
      const goalTeam = oldScore.home !== newScore.home ? 'home' : 'away';
      io.to('live-updates').emit('notification', {
        type: 'goal',
        fixture,
        goalTeam,
        message: `GOAL! ${getTeamNames(fixture)} (${newScore.home}-${newScore.away})`,
      });

      // Also emit to specific match room
      io.to(`match:${fixture.id}`).emit('match:goal', {
        fixture,
        goalTeam,
        score: newScore,
      });
    }

    // Check for red cards (if events include cards)
    checkForCards(io, fixture, oldFixture);
  });

  // Check for matches that ended
  oldData.forEach(oldFixture => {
    if (!newMap.has(oldFixture.id)) {
      io.to('live-updates').emit('notification', {
        type: 'match_end',
        fixture: oldFixture,
        message: `Full Time: ${getTeamNames(oldFixture)} (${getScore(oldFixture).home}-${getScore(oldFixture).away})`,
      });
    }
  });
}

function getTeamNames(fixture) {
  const home = fixture.participants?.find(p => p.meta?.location === 'home')?.name || 'Home';
  const away = fixture.participants?.find(p => p.meta?.location === 'away')?.name || 'Away';
  return `${home} vs ${away}`;
}

function getScore(fixture) {
  const scores = fixture.scores || [];
  const currentScore = scores.find(s => s.description === 'CURRENT') ||
                       scores.find(s => s.description === '2ND_HALF') ||
                       scores.find(s => s.description === '1ST_HALF') ||
                       { score: { participant: 'home', goals: 0 } };

  let home = 0, away = 0;
  scores.forEach(s => {
    if (s.score?.participant === 'home') home = s.score.goals || 0;
    if (s.score?.participant === 'away') away = s.score.goals || 0;
  });

  return { home, away };
}

function checkForCards(io, newFixture, oldFixture) {
  const oldEvents = oldFixture.events || [];
  const newEvents = newFixture.events || [];

  if (newEvents.length > oldEvents.length) {
    const newEventIds = new Set(oldEvents.map(e => e.id));
    const addedEvents = newEvents.filter(e => !newEventIds.has(e.id));

    addedEvents.forEach(event => {
      if (event.type?.code === 'redcard' || event.type?.code === 'yellowred') {
        io.to('live-updates').emit('notification', {
          type: 'red_card',
          fixture: newFixture,
          event,
          message: `Red Card! ${event.player?.name || 'Player'} - ${getTeamNames(newFixture)}`,
        });
      }
    });
  }
}

export default { setupSocketHandlers };
