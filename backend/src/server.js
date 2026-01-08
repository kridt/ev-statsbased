import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

// Import routes
import fixturesRouter from './routes/fixtures.js';
import teamsRouter from './routes/teams.js';
import playersRouter from './routes/players.js';
import leaguesRouter from './routes/leagues.js';
import probabilityRouter from './routes/probability.js';
import oddsRouter from './routes/odds.js';
import valueBetsRouter from './routes/valueBets.js';
import clvRouter from './routes/clv.js';

// Import socket handlers
import { setupSocketHandlers } from './sockets/liveUpdates.js';

// Import prefetch and scheduler
import prefetch from './services/prefetch.js';
import scheduler from './jobs/scheduler.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);

// Setup Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? ['https://ev-statsbased.vercel.app', 'https://ev-statsbased-kridt.vercel.app']
      : ['http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://ev-statsbased.vercel.app', 'https://ev-statsbased-kridt.vercel.app']
    : ['http://localhost:5173', 'http://localhost:3000'],
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${req.method}] ${req.path} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
app.use('/api/fixtures', fixturesRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/players', playersRouter);
app.use('/api/leagues', leaguesRouter);
app.use('/api/probability', probabilityRouter);
app.use('/api/odds', oddsRouter);
app.use('/api/value-bets', valueBetsRouter);
app.use('/api/clv', clvRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// Setup Socket.io handlers
setupSocketHandlers(io);

// Start server
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, async () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║   ⚽ Soccer Stats Backend Server                      ║
║                                                       ║
║   Server running on: http://localhost:${PORT}           ║
║   Socket.io enabled for real-time updates             ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
  `);

  // Start prefetch after server is up
  try {
    await prefetch.startPrefetch();
    scheduler.startScheduler();
  } catch (error) {
    console.error('[Startup] Prefetch error:', error.message);
    // Continue running even if prefetch fails
  }
});

export default app;
