const redis = require('redis');

// Add this at the top to load environment variables
require('dotenv').config();

const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },

  email: {
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT || 587,
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    from: process.env.EMAIL_FROM,
  },

  otp: {
    expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES) || 5,
    length: parseInt(process.env.OTP_LENGTH) || 6,
    maxAttempts: parseInt(process.env.MAX_ATTEMPTS) || 3,
  },
};


class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      // Method 1: Using host/port/password separately (recommended for Redis Cloud)
      const clientConfig = {
        socket: {
          host: config.redis.host,
          port: config.redis.port,
          connectTimeout: 60000,
          lazyConnect: true,
        },
        password: config.redis.password,
      };

      this.client = redis.createClient(clientConfig);

      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        console.log('Redis client ready');
        this.isConnected = true;
      });

      this.client.on('end', () => {
        console.log('Redis client disconnected');
        this.isConnected = false;
      });

      this.client.on('reconnecting', () => {
        console.log('Redis client reconnecting...');
      });

      await this.client.connect();
      
      // Test the connection
      const pong = await this.client.ping();
      
      return this.client;
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      this.isConnected = false;
      this.client = null;
      return null;
    }
  }

  async disconnect() {
    try {
      if (this.client && this.isConnected) {
        await this.client.disconnect();
        console.log('Redis disconnected successfully');
      }
    } catch (error) {
      console.error('Error disconnecting from Redis:', error);
    }
  }

  async set(key, value, expireInSeconds = null) {
    try {
      if (!this.isConnected) {
        throw new Error('Redis client not connected');
      }

      if (expireInSeconds) {
        return await this.client.setEx(key, expireInSeconds, value);
      }
      return await this.client.set(key, value);
    } catch (error) {
      console.error('Redis SET error:', error);
      throw error;
    }
  }

  async get(key) {
    try {
      if (!this.isConnected) {
        throw new Error('Redis client not connected');
      }
      return await this.client.get(key);
    } catch (error) {
      console.error('Redis GET error:', error);
      throw error;
    }
  }

  async del(key) {
    try {
      if (!this.isConnected) {
        throw new Error('Redis client not connected');
      }
      return await this.client.del(key);
    } catch (error) {
      console.error('Redis DEL error:', error);
      throw error;
    }
  }

  async getDel(key) {
    try {
      if (!this.isConnected) {
        throw new Error('Redis client not connected');
      }
      // GETDEL is atomic: reads the value and deletes the key in a single
      // Redis command. Prevents replay attacks where two simultaneous requests
      // both read a nonce before either deletes it.
      return await this.client.getDel(key);
    } catch (error) {
      console.error('Redis GETDEL error:', error);
      throw error;
    }
  }

  async exists(key) {
    try {
      if (!this.isConnected) {
        throw new Error('Redis client not connected');
      }
      return await this.client.exists(key);
    } catch (error) {
      console.error('Redis EXISTS error:', error);
      throw error;
    }
  }

  async incr(key) {
    try {
      if (!this.isConnected) {
        throw new Error('Redis client not connected');
      }
      return await this.client.incr(key);
    } catch (error) {
      console.error('Redis INCR error:', error);
      throw error;
    }
  }

  async expire(key, seconds) {
    try {
      if (!this.isConnected) {
        throw new Error('Redis client not connected');
      }
      return await this.client.expire(key, seconds);
    } catch (error) {
      console.error('Redis EXPIRE error:', error);
      throw error;
    }
  }

  async ttl(key) {
    try {
      if (!this.isConnected) {
        throw new Error('Redis client not connected');
      }
      return await this.client.ttl(key);
    } catch (error) {
      console.error('Redis TTL error:', error);
      throw error;
    }
  }

  getConnectionStatus() {
    return this.isConnected;
  }

  setupGracefulShutdown() {
    process.on('SIGINT', async () => {
      console.log('\nShutting down gracefully...');
      await this.disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\nShutting down gracefully...');
      await this.disconnect();
      process.exit(0);
    });
  }
}

// Create and export singleton instance
const redisService = new RedisService();
module.exports = { redisService, config };