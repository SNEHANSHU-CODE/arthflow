const { redisService } = require('../config/redis');

const OAUTH_NONCE_TTL_SECONDS = 10 * 60; // 10 minutes

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

    // Compute TTL from the actual token expiry_date so Redis and Google stay in sync.
    // Fall back to 55 minutes if expiry_date is missing (Google access tokens last ~1 hour).
    const FALLBACK_TTL_SECONDS = 55 * 60;
    let ttl = FALLBACK_TTL_SECONDS;
    if (tokens.expiry_date) {
      const secondsUntilExpiry = Math.floor((tokens.expiry_date - Date.now()) / 1000);
      // Subtract a 60-second safety buffer; enforce a minimum of 60 seconds.
      ttl = Math.max(60, secondsUntilExpiry - 60);
    }

    await redisService.set(key, JSON.stringify(tokens), ttl);
    console.log(`Google tokens saved to Redis for user: ${userId} (TTL: ${ttl}s)`);
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

/**
 * Store an OAuth state nonce in Redis.
 * Called in Step 1 when the user requests the Google OAuth URL.
 *
 * The nonce key is opaque (just a UUID) and carries zero information about
 * the user. The actual userId + timeZone are stored as the Redis value.
 * This means even if an attacker sees the state in the Google URL they get
 * nothing useful — the nonce is unguessable and single-use.
 *
 * @param {string} nonce   - crypto.randomUUID() output (128-bit secure random)
 * @param {{ userId: string, timeZone: string }} payload
 */
const saveOAuthNonce = async (nonce, payload) => {
  try {
    const key = `oauth_nonce:${nonce}`;
    await redisService.set(key, JSON.stringify(payload), OAUTH_NONCE_TTL_SECONDS);
    console.log(`🔐 OAuth nonce stored (TTL: ${OAUTH_NONCE_TTL_SECONDS}s)`);
  } catch (error) {
    console.error('❌ Error saving OAuth nonce to Redis:', error);
    throw error; // let the caller (POST /) return 500 to the user
  }
};

/**
 * Atomically consume an OAuth state nonce from Redis.
 * Uses GETDEL so the nonce is read AND deleted in a single atomic Redis
 * command — preventing replay attacks from concurrent requests.
 *
 * Returns the stored payload ({ userId, timeZone }) when the nonce is valid.
 * Returns null when: nonce not found, already consumed, expired, or any error.
 * NEVER throws — the callback route must always produce a clean redirect.
 *
 * @param {string} nonce  - the `state` query param received from Google's callback
 * @returns {{ userId: string, timeZone: string } | null}
 */
const consumeOAuthNonce = async (nonce) => {
  try {
    const key = `oauth_nonce:${nonce}`;
    const raw = await redisService.getDel(key); // atomic: read + delete in one command
    if (!raw) return null; // expired, already consumed, or never existed
    return JSON.parse(raw);
  } catch (error) {
    // Treat ALL errors (Redis down, parse failure) as an invalid nonce.
    // Never throw — the callback must always produce a clean redirect.
    console.error('❌ Error consuming OAuth nonce:', error);
    return null;
  }
};

module.exports = {
  getGoogleTokens,
  saveGoogleTokens,
  deleteGoogleTokens,
  saveOAuthNonce,
  consumeOAuthNonce,
};
