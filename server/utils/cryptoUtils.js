const crypto = require('crypto');
const ALGORITHM = 'aes-256-gcm';
// Default key for development only. In production, this should be set in environment variables.
const KEY = Buffer.from(process.env.PDF_SECRET_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', 'hex');

exports.encryptPassword = (plaintext) => {
  if (!plaintext) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
};

exports.decryptPassword = (ciphertext) => {
  if (!ciphertext) return '';
  try {
    const buf = Buffer.from(ciphertext, 'base64');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const data = buf.subarray(28);
    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data) + decipher.final('utf8');
  } catch (error) {
    console.error('Failed to decrypt password:', error.message);
    // Return original ciphertext on decrypt failure - allows graceful fallback for unmigrated data
    return ciphertext; 
  }
};
