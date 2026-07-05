const { redisService } = require('../config/redis');

const GOOGLE_TOKEN_TTL = 60 * 60; // 1 hour — matches Google access token lifetime

const getGoogleTokens = async (userId) => {
  try {
    const key = `google_tokens:${userId}`;
    const tokenStr = await redisService.get(key);
    return tokenStr ? JSON.parse(tokenStr) : null;
  } catch (error) {
    console.error('Error getting Google tokens from Redis:', error);
    return null;
  }
};

const saveGoogleTokens = async (userId, tokens) => {
  try {
    const key = `google_tokens:${userId}`;
    await redisService.set(key, JSON.stringify(tokens), GOOGLE_TOKEN_TTL);
    console.log(`Google tokens saved to Redis for user: ${userId}`);
  } catch (error) {
    console.error('Error saving Google tokens to Redis:', error);
    throw error;
  }
};

const deleteGoogleTokens = async (userId) => {
  try {
    const key = `google_tokens:${userId}`;
    await redisService.del(key);
    console.log(`Google tokens deleted from Redis for user: ${userId}`);
  } catch (error) {
    console.error('Error deleting Google tokens from Redis:', error);
  }
};

module.exports = {
  getGoogleTokens,
  saveGoogleTokens,
  deleteGoogleTokens
};


