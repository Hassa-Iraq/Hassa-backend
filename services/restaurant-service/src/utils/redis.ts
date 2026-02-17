import { createClient, RedisClientType } from 'redis';
import config from '../config/index';
import { createLogger } from 'shared/logger/index';

const logger = createLogger(config.SERVICE_NAME, config.LOG_LEVEL);

let redisClient: RedisClientType | null = null;
let isConnecting = false;
let connectionPromise: Promise<void> | null = null;

/**
 * Initialize Redis connection
 */
export async function initializeRedis(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    return;
  }

  if (isConnecting && connectionPromise) {
    return connectionPromise;
  }

  isConnecting = true;
  connectionPromise = (async () => {
    try {
      if (!redisClient) {
        redisClient = createClient({
          socket: {
            host: config.REDIS_HOST || 'localhost',
            port: config.REDIS_PORT || 6379,
            reconnectStrategy: (retries) => {
              if (retries > 10) {
                logger.error('Redis reconnection attempts exhausted');
                return new Error('Redis reconnection failed');
              }
              return Math.min(retries * 100, 3000);
            },
          },
        });

        redisClient.on('error', (err) => {
          logger.error({ error: err.message }, 'Redis client error');
        });

        redisClient.on('connect', () => {
          logger.info('Redis client connected');
        });

        redisClient.on('disconnect', () => {
          logger.warn('Redis client disconnected');
        });

        redisClient.on('ready', () => {
          logger.info('Redis client ready');
        });
      }

      if (!redisClient.isOpen) {
        await redisClient.connect();
        logger.info('Redis connection established');
      }
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to connect to Redis');
      throw error;
    } finally {
      isConnecting = false;
      connectionPromise = null;
    }
  })();

  return connectionPromise;
}

/**
 * Get or create Redis client
 */
export function getRedisClient(): RedisClientType {
  if (!redisClient) {
    redisClient = createClient({
      socket: {
        host: config.REDIS_HOST || 'localhost',
        port: config.REDIS_PORT || 6379,
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Redis reconnection attempts exhausted');
            return new Error('Redis reconnection failed');
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });

    redisClient.on('error', (err) => {
      logger.error({ error: err.message }, 'Redis client error');
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisClient.on('disconnect', () => {
      logger.warn('Redis client disconnected');
    });

    // Attempt connection in background (non-blocking)
    redisClient.connect().catch((err) => {
      logger.error({ error: err.message }, 'Failed to connect to Redis');
    });
  }

  return redisClient;
}

/**
 * Cache helper functions
 */
export const cache = {
  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const client = getRedisClient();
      const value = await client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error: any) {
      logger.error({ error: error.message, key }, 'Cache get error');
      return null;
    }
  },

  /**
   * Set value in cache with TTL
   */
  async set(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
    try {
      const client = getRedisClient();
      await client.setEx(key, ttlSeconds, JSON.stringify(value));
    } catch (error: any) {
      logger.error({ error: error.message, key }, 'Cache set error');
    }
  },

  /**
   * Delete value from cache
   */
  async del(key: string): Promise<void> {
    try {
      const client = getRedisClient();
      await client.del(key);
    } catch (error: any) {
      logger.error({ error: error.message, key }, 'Cache delete error');
    }
  },

  /**
   * Delete multiple keys matching pattern
   */
  async delPattern(pattern: string): Promise<void> {
    try {
      const client = getRedisClient();
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(keys);
      }
    } catch (error: any) {
      logger.error({ error: error.message, pattern }, 'Cache delete pattern error');
    }
  },
};

/**
 * Cache key generators
 */
export const cacheKeys = {
  restaurant: (id: string) => `restaurant:${id}`,
  restaurantList: (page: number, limit: number, filters?: string) => 
    `restaurants:list:${page}:${limit}${filters ? `:${filters}` : ''}`,
  restaurantMenu: (restaurantId: string) => `restaurant:${restaurantId}:menu`,
  menuItem: (id: string) => `menu_item:${id}`,
};

export default {
  getRedisClient,
  initializeRedis,
  cache,
  cacheKeys,
};
