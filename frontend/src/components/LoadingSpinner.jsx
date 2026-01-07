import { motion } from 'framer-motion';

export default function LoadingSpinner({ size = 'md', text = 'Loading...' }) {
  const sizes = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
  };

  return (
    <div className="flex flex-col items-center justify-center py-12">
      <motion.div
        className={`${sizes[size]} border-4 border-dark-700 border-t-primary-500 rounded-full`}
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
      {text && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-4 text-dark-400"
        >
          {text}
        </motion.p>
      )}
    </div>
  );
}

export function MatchCardSkeleton() {
  return (
    <div className="card p-4 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 skeleton rounded-full" />
          <div className="w-24 h-3 skeleton" />
        </div>
        <div className="w-4 h-4 skeleton rounded" />
      </div>
      <div className="flex items-center gap-4">
        <div className="flex-1 flex items-center gap-3">
          <div className="w-10 h-10 skeleton rounded-full" />
          <div className="w-20 h-4 skeleton" />
        </div>
        <div className="flex flex-col items-center">
          <div className="w-16 h-8 skeleton" />
          <div className="w-10 h-3 skeleton mt-1" />
        </div>
        <div className="flex-1 flex items-center gap-3 justify-end">
          <div className="w-20 h-4 skeleton" />
          <div className="w-10 h-10 skeleton rounded-full" />
        </div>
      </div>
    </div>
  );
}
