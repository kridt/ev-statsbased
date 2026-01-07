import { Routes, Route } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import Layout from './components/Layout';
import ValueBetsDashboard from './pages/ValueBetsDashboard';
import HomePage from './pages/HomePage';
import MatchPage from './pages/MatchPage';
import TeamPage from './pages/TeamPage';
import PlayerPage from './pages/PlayerPage';
import LeaguePage from './pages/LeaguePage';
import FavoritesPage from './pages/FavoritesPage';
import SearchPage from './pages/SearchPage';
// PWAInstallBanner temporarily disabled due to duplicate React issue
// import PWAInstallBanner from './components/PWAInstallBanner';

function App() {
  return (
    <Layout>
      <AnimatePresence mode="wait">
        <Routes>
          <Route path="/" element={<ValueBetsDashboard />} />
          <Route path="/value-bets" element={<ValueBetsDashboard />} />
          <Route path="/matches" element={<HomePage />} />
          <Route path="/match/:id" element={<MatchPage />} />
          <Route path="/team/:id" element={<TeamPage />} />
          <Route path="/player/:id" element={<PlayerPage />} />
          <Route path="/league/:id" element={<LeaguePage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/search" element={<SearchPage />} />
        </Routes>
      </AnimatePresence>
    </Layout>
  );
}

export default App;
