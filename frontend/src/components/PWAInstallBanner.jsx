import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, RefreshCw, Bell, Smartphone } from 'lucide-react';
import usePWA from '../hooks/usePWA';

export function PWAInstallBanner() {
  const { canInstall, isUpdateAvailable, installApp, updateApp, requestNotificationPermission } = usePWA();
  const [dismissed, setDismissed] = useState(false);
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);

  const handleInstall = async () => {
    const installed = await installApp();
    if (installed) {
      setShowNotificationPrompt(true);
    }
  };

  const handleEnableNotifications = async () => {
    await requestNotificationPermission();
    setShowNotificationPrompt(false);
  };

  // Update available toast
  if (isUpdateAvailable) {
    return (
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50"
      >
        <div className="bg-gradient-to-r from-blue-600 to-blue-500 rounded-xl p-4 shadow-2xl shadow-blue-500/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <RefreshCw className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-white">Update Available</h4>
              <p className="text-sm text-blue-100">A new version is ready to install</p>
            </div>
            <button
              onClick={updateApp}
              className="px-4 py-2 bg-white text-blue-600 rounded-lg font-medium hover:bg-blue-50 transition-colors"
            >
              Update
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Notification prompt after install
  if (showNotificationPrompt) {
    return (
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50"
      >
        <div className="bg-gradient-to-r from-purple-600 to-purple-500 rounded-xl p-4 shadow-2xl shadow-purple-500/20">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-white">Enable Notifications?</h4>
              <p className="text-sm text-purple-100 mt-1">
                Get alerts when high-value bets appear or odds change
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleEnableNotifications}
                  className="px-4 py-2 bg-white text-purple-600 rounded-lg font-medium hover:bg-purple-50 transition-colors"
                >
                  Enable
                </button>
                <button
                  onClick={() => setShowNotificationPrompt(false)}
                  className="px-4 py-2 bg-white/20 text-white rounded-lg font-medium hover:bg-white/30 transition-colors"
                >
                  Later
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Install prompt banner
  if (!canInstall || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50"
      >
        <div className="bg-gradient-to-r from-primary-600 to-accent-purple rounded-xl p-4 shadow-2xl shadow-primary-500/20 border border-primary-500/30">
          <button
            onClick={() => setDismissed(true)}
            className="absolute top-2 right-2 p-1 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl">
              <Smartphone className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h4 className="font-semibold text-white">Install SoccerStats</h4>
              <p className="text-sm text-primary-100 mt-0.5">
                Add to home screen for quick access & offline support
              </p>
            </div>
          </div>
          <button
            onClick={handleInstall}
            className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 bg-white text-primary-600 rounded-lg font-semibold hover:bg-primary-50 transition-colors"
          >
            <Download className="w-5 h-5" />
            Install App
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default PWAInstallBanner;
