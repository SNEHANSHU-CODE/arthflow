const crypto = require('crypto');

// Store states in memory (in production, use Redis or database)
const stateStore = new Map();

// Configuration
const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const STATE_LENGTH = 32; // 32 bytes = 256 bits

/**
 * Generate a secure random state for OAuth
 * @param {Object} data - Data to encode in state (guestId, provider, timestamp, etc.)
 * @returns {string} - Encrypted state token
 */
function generateState(data) {
  try {
    const randomBytes = crypto.randomBytes(STATE_LENGTH);
    const stateId = randomBytes.toString('hex');

    // Store the data with expiry
    stateStore.set(stateId, {
      data,
      createdAt: Date.now(),
      expiresAt: Date.now() + STATE_EXPIRY_MS
    });

    // Clean up expired states periodically
    cleanupExpiredStates();

    return stateId;
  } catch (error) {
    throw new Error('Failed to generate state: ' + error.message);
  }
}

/**
 * Validate and retrieve state data
 * @param {string} state - State token to validate
 * @returns {Object} - Original data if valid
 * @throws {Error} - If state is invalid or expired
 */
function validateState(state) {
  try {
    if (!state || typeof state !== 'string') {
      throw new Error('Invalid state format');
    }

    const stateData = stateStore.get(state);

    if (!stateData) {
      throw new Error('State not found or invalid');
    }

    // Check if expired
    if (Date.now() > stateData.expiresAt) {
      stateStore.delete(state);
      throw new Error('State has expired');
    }

    if (stateData.used) {
      throw new Error('State already used');
    }

    // Mark state as used instead of deleting (allows graceful handling of double requests)
    stateData.used = true;

    return stateData.data;
  } catch (error) {
    throw new Error('State validation failed: ' + error.message);
  }
}

/**
 * Clean up expired states from store
 */
function cleanupExpiredStates() {
  const now = Date.now();
  for (const [stateId, stateData] of stateStore.entries()) {
    if (now > stateData.expiresAt) {
      stateStore.delete(stateId);
    }
  }
}

/**
 * Get state store size (useful for monitoring)
 * @returns {number} - Number of active states
 */
function getStoreSize() {
  return stateStore.size;
}

module.exports = {
  generateState,
  validateState,
  getStoreSize,
  cleanupExpiredStates
};
