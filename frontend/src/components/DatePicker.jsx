import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { format, addDays, subDays, isToday, isTomorrow, isBefore, startOfDay, parse } from 'date-fns';

export default function DatePicker({ selectedDate, onDateChange }) {
  const [showCalendar, setShowCalendar] = useState(false);
  const today = startOfDay(new Date());

  const getDateLabel = (date) => {
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    return format(date, 'EEE, MMM d');
  };

  // Check if we can go back (not before today)
  const canGoBack = !isToday(selectedDate);

  // Generate dates from today onwards (7 days)
  const dates = [];
  for (let i = 0; i <= 6; i++) {
    dates.push(addDays(today, i));
  }

  return (
    <div className="relative">
      {/* Date navigation */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => canGoBack && onDateChange(subDays(selectedDate, 1))}
          disabled={!canGoBack}
          className={`p-2 rounded-xl transition-colors ${
            canGoBack
              ? 'bg-dark-800 hover:bg-dark-700'
              : 'bg-dark-900 text-dark-600 cursor-not-allowed'
          }`}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 flex items-center justify-center gap-2 overflow-x-auto scrollbar-hide">
          {dates.map((date) => {
            const isSelected = format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
            return (
              <motion.button
                key={date.toISOString()}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => onDateChange(date)}
                className={`px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-all duration-300 ${
                  isSelected
                    ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/25'
                    : isToday(date)
                    ? 'bg-dark-800 text-accent-cyan border border-accent-cyan/30'
                    : 'bg-dark-800/50 text-dark-300 hover:bg-dark-700'
                }`}
              >
                <span className="block text-xs opacity-75">
                  {format(date, 'EEE')}
                </span>
                <span className="block text-sm">
                  {format(date, 'd')}
                </span>
              </motion.button>
            );
          })}
        </div>

        <button
          onClick={() => onDateChange(addDays(selectedDate, 1))}
          className="p-2 rounded-xl bg-dark-800 hover:bg-dark-700 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        <button
          onClick={() => setShowCalendar(!showCalendar)}
          className="p-2 rounded-xl bg-dark-800 hover:bg-dark-700 transition-colors"
        >
          <Calendar className="w-5 h-5" />
        </button>
      </div>

      {/* Full calendar dropdown */}
      <AnimatePresence>
        {showCalendar && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full left-1/2 -translate-x-1/2 z-10 mt-2 p-4 card"
          >
            <input
              type="date"
              value={format(selectedDate, 'yyyy-MM-dd')}
              min={format(today, 'yyyy-MM-dd')}
              onChange={(e) => {
                // Parse date string as local time to avoid timezone shifts
                // Using parse from date-fns ensures correct local date interpretation
                const newDate = parse(e.target.value, 'yyyy-MM-dd', new Date());
                // Ensure we don't go before today and date is valid
                if (!isNaN(newDate.getTime()) && !isBefore(startOfDay(newDate), today)) {
                  onDateChange(startOfDay(newDate));
                }
                setShowCalendar(false);
              }}
              className="bg-dark-800 text-white px-4 py-2 rounded-xl border border-dark-600 focus:border-primary-500 focus:outline-none"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Current date display */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">
          {getDateLabel(selectedDate)}
        </h2>
        <p className="text-dark-400 text-sm">
          {format(selectedDate, 'EEEE, MMMM d, yyyy')}
        </p>
      </div>
    </div>
  );
}
