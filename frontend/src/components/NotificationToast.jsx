import { motion, AnimatePresence } from 'framer-motion';
import { X, Goal, AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import { useNotification } from '../context/NotificationContext';

const notificationIcons = {
  goal: Goal,
  red_card: AlertTriangle,
  match_start: Clock,
  match_end: CheckCircle,
  default: CheckCircle,
};

const notificationColors = {
  goal: 'bg-accent-green/20 border-accent-green/50 text-accent-green',
  red_card: 'bg-accent-red/20 border-accent-red/50 text-accent-red',
  match_start: 'bg-accent-cyan/20 border-accent-cyan/50 text-accent-cyan',
  match_end: 'bg-primary-500/20 border-primary-500/50 text-primary-400',
  default: 'bg-dark-800/80 border-dark-600 text-white',
};

export default function NotificationToast() {
  const { notifications, removeNotification } = useNotification();

  return (
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-2 max-w-sm">
      <AnimatePresence>
        {notifications.slice(0, 5).map((notification) => {
          const Icon = notificationIcons[notification.type] || notificationIcons.default;
          const colorClass = notificationColors[notification.type] || notificationColors.default;

          return (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, x: 100, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.8 }}
              className={`flex items-start gap-3 p-4 rounded-xl border backdrop-blur-lg ${colorClass}`}
            >
              <div className="flex-shrink-0">
                <Icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{notification.message}</p>
              </div>
              <button
                onClick={() => removeNotification(notification.id)}
                className="flex-shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
