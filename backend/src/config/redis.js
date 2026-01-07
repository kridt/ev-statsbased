import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Create Redis client with fallback to memory cache if Redis unavailable
let redis = null;
let useMemoryCache = true; // Default to memory cache
const memoryCache = new Map();
let redisErrorLogged = false;

try {
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    retryStrategy: () => null, // Don't retry
    lazyConnect: true,
  });

  redis.on('error', () => {
    if (!redisErrorLogged) {
      console.log('[Cache] Redis not available, using in-memory cache');
      redisErrorLogged = true;
    }
    useMemoryCache = true;
  });

  redis.on('connect', () => {
    console.log('[Cache] Connected to Redis');
    useMemoryCache = false;
  });

  // Try to connect with timeout
  const connectPromise = redis.connect();
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), 2000)
  );

  await Promise.race([connectPromise, timeoutPromise]).catch(() => {
    console.log('[Cache] Using in-memory cache (Redis unavailable)');
    useMemoryCache = true;
  });
} catch (err) {
  console.log('[Cache] Using in-memory cache');
  useMemoryCache = true;
}

// Cache wrapper that works with both Redis and memory
export const cache = {
  async get(key) {
    try {
      if (useMemoryCache) {
        const item = memoryCache.get(key);
        if (item && item.expiry > Date.now()) {
          return item.value;
        }
        memoryCache.delete(key);
        return null;
      }
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (err) {
      console.error('Cache get error:', err.message);
      return null;
    }
  },

  async set(key, value, ttlSeconds = 300) {
    try {
      if (useMemoryCache) {
        memoryCache.set(key, {
          value,
          expiry: Date.now() + (ttlSeconds * 1000)
        });
        return true;
      }
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error('Cache set error:', err.message);
      return false;
    }
  },

  async del(key) {
    try {
      if (useMemoryCache) {
        memoryCache.delete(key);
        return true;
      }
      await redis.del(key);
      return true;
    } catch (err) {
      console.error('Cache delete error:', err.message);
      return false;
    }
  },

  async keys(pattern) {
    try {
      if (useMemoryCache) {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return Array.from(memoryCache.keys()).filter(k => regex.test(k));
      }
      return await redis.keys(pattern);
    } catch (err) {
      console.error('Cache keys error:', err.message);
      return [];
    }
  }
};

export default redis;
