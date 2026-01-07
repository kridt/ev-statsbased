import { motion } from 'framer-motion';

export default function StatBar({
  homeValue,
  awayValue,
  label,
  homeColor = 'bg-primary-500',
  awayColor = 'bg-accent-purple',
  showPercentage = true,
}) {
  const total = homeValue + awayValue;
  const homePercent = total > 0 ? (homeValue / total) * 100 : 50;
  const awayPercent = total > 0 ? (awayValue / total) * 100 : 50;

  return (
    <div className="mb-4">
      {/* Values and label */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-white font-semibold">
          {showPercentage ? `${Math.round(homePercent)}%` : homeValue}
        </span>
        <span className="text-dark-400 text-sm font-medium">{label}</span>
        <span className="text-white font-semibold">
          {showPercentage ? `${Math.round(awayPercent)}%` : awayValue}
        </span>
      </div>

      {/* Bar */}
      <div className="flex h-2 gap-1 rounded-full overflow-hidden bg-dark-800">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${homePercent}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`${homeColor} rounded-l-full`}
        />
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${awayPercent}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`${awayColor} rounded-r-full`}
        />
      </div>
    </div>
  );
}

export function VerticalStatBar({ value, maxValue, label, color = 'bg-primary-500' }) {
  const percent = maxValue > 0 ? (value / maxValue) * 100 : 0;

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-white font-bold">{value}</span>
      <div className="w-8 h-24 bg-dark-800 rounded-full overflow-hidden flex items-end">
        <motion.div
          initial={{ height: 0 }}
          animate={{ height: `${percent}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`w-full ${color} rounded-full`}
        />
      </div>
      <span className="text-xs text-dark-400 text-center">{label}</span>
    </div>
  );
}
