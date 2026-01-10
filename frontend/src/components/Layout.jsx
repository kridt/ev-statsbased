import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  Star,
  Search,
  Bell,
  Wifi,
  WifiOff,
  Trophy,
  Menu,
  X,
  TrendingUp,
  Calendar,
  BarChart3,
} from 'lucide-react';
import { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useNotification } from '../context/NotificationContext';
import NotificationToast from './NotificationToast';

const navItems = [
  { path: '/', icon: TrendingUp, label: 'Value Bets' },
  { path: '/matches', icon: Calendar, label: 'Matches' },
  { path: '/admin/clv', icon: BarChart3, label: 'CLV Tracker' },
  { path: '/favorites', icon: Star, label: 'Favorites' },
  { path: '/search', icon: Search, label: 'Search' },
];

export default function Layout({ children }) {
  const location = useLocation();
  const { isConnected } = useSocket();
  const { notifications, notificationPermission, requestPermission } = useNotification();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-dark-950">
      {/* Notification Toasts */}
      <NotificationToast />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-dark-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3 group">
              <motion.div
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.5 }}
                className="w-10 h-10 bg-gradient-to-br from-primary-500 to-accent-cyan rounded-xl flex items-center justify-center"
              >
                <Trophy className="w-6 h-6 text-white" />
              </motion.div>
              <span className="text-xl font-bold text-gradient hidden sm:block">
                SoccerStats
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-2">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`relative flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-300 ${
                      isActive
                        ? 'bg-primary-500/20 text-primary-400'
                        : 'text-dark-400 hover:text-white hover:bg-dark-800'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="nav-indicator"
                        className="absolute inset-0 bg-primary-500/20 rounded-xl -z-10"
                        transition={{ type: 'spring', duration: 0.5 }}
                      />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Right side actions */}
            <div className="flex items-center gap-4">
              {/* Connection status */}
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <div className="flex items-center gap-2 text-accent-green text-sm">
                    <Wifi className="w-4 h-4" />
                    <span className="hidden sm:inline">Live</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-accent-red text-sm">
                    <WifiOff className="w-4 h-4" />
                    <span className="hidden sm:inline">Offline</span>
                  </div>
                )}
              </div>

              {/* Notification permission button */}
              {notificationPermission !== 'granted' && (
                <button
                  onClick={requestPermission}
                  className="p-2 rounded-lg bg-dark-800 hover:bg-dark-700 transition-colors"
                  title="Enable notifications"
                >
                  <Bell className="w-5 h-5 text-dark-400" />
                </button>
              )}

              {/* Mobile menu button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-lg bg-dark-800 hover:bg-dark-700 transition-colors"
              >
                {mobileMenuOpen ? (
                  <X className="w-5 h-5" />
                ) : (
                  <Menu className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-dark-700/50"
            >
              <nav className="px-4 py-3 space-y-1">
                {navItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${
                        isActive
                          ? 'bg-primary-500/20 text-primary-400'
                          : 'text-dark-400 hover:text-white hover:bg-dark-800'
                      }`}
                    >
                      <item.icon className="w-5 h-5" />
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main content */}
      <main className="pt-20 pb-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          {children}
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="border-t border-dark-800 py-6 px-4">
        <div className="max-w-7xl mx-auto text-center text-dark-500 text-sm">
          <p>Powered by SportMonks API</p>
        </div>
      </footer>
    </div>
  );
}
