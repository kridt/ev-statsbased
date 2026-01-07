# SoccerStats - Live Soccer Statistics

A comprehensive soccer statistics platform built with React and Node.js, featuring real-time updates, detailed match statistics, and a beautiful dark-themed UI.

## Features

- **Live Matches** - Real-time score updates via WebSocket
- **Date Navigation** - Browse matches by date with an intuitive date picker
- **Match Details** - Comprehensive statistics including:
  - Live scores and match events
  - Full match statistics (possession, shots, passes, etc.)
  - Team lineups and formations
  - Timeline of events (goals, cards, substitutions)
  - Head-to-head history
- **Team Profiles** - Squad lists, recent form, and season statistics
- **Player Profiles** - Career statistics, transfers, and trophies
- **League Standings** - Full tables with form indicators
- **Top Scorers** - League-specific goal scoring charts
- **Favorites System** - Star teams, matches, and leagues
- **Browser Notifications** - Get notified for goals and red cards
- **Responsive Design** - Works on desktop and mobile

## Tech Stack

### Frontend
- React 18 with Vite
- Tailwind CSS for styling
- Framer Motion for animations
- Socket.io-client for real-time updates
- React Router for navigation
- date-fns for date handling
- Lucide React for icons

### Backend
- Node.js with Express
- Socket.io for WebSocket connections
- Redis/Memory cache for API response caching
- SportMonks API v3 for data

## Getting Started

### Prerequisites
- Node.js 18+ installed
- (Optional) Redis for caching - falls back to memory cache if unavailable

### Installation

1. **Navigate to the project folder:**
   ```bash
   cd C:\Users\chrni\Desktop\projects\soccer-stats
   ```

2. **Start the backend:**
   ```bash
   cd backend
   npm run dev
   ```
   The backend will start on http://localhost:3001

3. **In a new terminal, start the frontend:**
   ```bash
   cd frontend
   npm run dev
   ```
   The frontend will start on http://localhost:5173

4. **Open your browser:**
   Navigate to http://localhost:5173

## Project Structure

```
soccer-stats/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── redis.js          # Redis/cache configuration
│   │   ├── routes/
│   │   │   ├── fixtures.js       # Match endpoints
│   │   │   ├── teams.js          # Team endpoints
│   │   │   ├── players.js        # Player endpoints
│   │   │   └── leagues.js        # League endpoints
│   │   ├── services/
│   │   │   └── sportmonks.js     # SportMonks API service
│   │   ├── sockets/
│   │   │   └── liveUpdates.js    # WebSocket handlers
│   │   └── server.js             # Express server
│   ├── .env                      # Environment variables
│   └── package.json
│
└── frontend/
    ├── public/
    │   └── soccer-ball.svg       # App icon
    ├── src/
    │   ├── components/
    │   │   ├── DatePicker.jsx
    │   │   ├── Layout.jsx
    │   │   ├── LoadingSpinner.jsx
    │   │   ├── MatchCard.jsx
    │   │   ├── NotificationToast.jsx
    │   │   └── StatBar.jsx
    │   ├── context/
    │   │   ├── FavoritesContext.jsx
    │   │   ├── NotificationContext.jsx
    │   │   └── SocketContext.jsx
    │   ├── hooks/
    │   │   └── useDebounce.js
    │   ├── pages/
    │   │   ├── FavoritesPage.jsx
    │   │   ├── HomePage.jsx
    │   │   ├── LeaguePage.jsx
    │   │   ├── MatchPage.jsx
    │   │   ├── PlayerPage.jsx
    │   │   ├── SearchPage.jsx
    │   │   └── TeamPage.jsx
    │   ├── services/
    │   │   └── api.js            # API client
    │   ├── utils/
    │   │   └── helpers.js
    │   ├── App.jsx
    │   ├── index.css
    │   └── main.jsx
    ├── index.html
    ├── tailwind.config.js
    ├── vite.config.js
    └── package.json
```

## API Caching

The backend implements intelligent caching to minimize API calls:

| Data Type | Cache Duration |
|-----------|---------------|
| Live matches | 30 seconds |
| Match details | 1 minute |
| Fixtures | 5 minutes |
| Standings | 10 minutes |
| Team data | 1 hour |
| Player data | 1 hour |
| Leagues/Seasons | 24 hours |

## Environment Variables

Backend `.env`:
```env
PORT=3001
SPORTMONKS_API_KEY=your_api_key_here
SPORTMONKS_BASE_URL=https://api.sportmonks.com/v3/football
REDIS_URL=redis://localhost:6379
NODE_ENV=development
```

## Real-time Updates

The app uses Socket.io for real-time updates:
- Live match scores update every 30 seconds
- Goal and card notifications are pushed instantly
- Subscribe to specific matches for detailed updates

## Design

The UI features a SofaScore-inspired dark theme with:
- Deep blue/purple gradient backgrounds
- Cyan and purple accent colors
- Smooth Framer Motion animations
- Glassmorphism effects
- Responsive mobile-first design

## Available Routes

| Route | Description |
|-------|-------------|
| `/` | Homepage with today's matches |
| `/match/:id` | Match details and statistics |
| `/team/:id` | Team profile and squad |
| `/player/:id` | Player profile and stats |
| `/league/:id` | League standings and top scorers |
| `/favorites` | Your starred items |
| `/search` | Search teams and players |

## License

MIT
