const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

/**
 * Derive a consistent 32-byte key from any input string.
 */
const deriveKey = (secret) => {
  return crypto.createHash('sha256').update(String(secret)).digest();
};

/**
 * Get the primary key used for encryption.
 * Priority:
 * 1. Dedicated OUTBOX_ENCRYPTION_KEY
 * 2. Dedicated ENCRYPTION_KEY
 * 3. Dedicated stable deployment secret
 * 4. JWT_SECRET (legacy fallback)
 */
const getPrimaryEncryptionKey = () => {
  const secret =
    process.env.OUTBOX_ENCRYPTION_KEY ||
    process.env.ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    'faculty-leave-system-outbox-stable-key-2026';
  return deriveKey(secret);
};

/**
 * Return a list of all candidate keys for decryption to handle secret rotation safely.
 * Includes:
 * 1. Current dedicated OUTBOX_ENCRYPTION_KEY / ENCRYPTION_KEY
 * 2. Any old keys specified in OUTBOX_ENCRYPTION_OLD_KEYS (comma-separated)
 * 3. JWT_SECRET (in case in-flight records were encrypted with JWT_SECRET before rotation)
 * 4. Fallback defaults
 */
const getDecryptionCandidateKeys = () => {
  const keys = [];
  const addKey = (secret) => {
    if (secret) {
      const derived = deriveKey(secret);
      // Avoid duplicate keys
      if (!keys.some((k) => k.equals(derived))) {
        keys.push(derived);
      }
    }
  };

  // Primary dedicated keys
  addKey(process.env.OUTBOX_ENCRYPTION_KEY);
  addKey(process.env.ENCRYPTION_KEY);

  // Rotation old keys (e.g. "old_key_1,old_key_2")
  if (process.env.OUTBOX_ENCRYPTION_OLD_KEYS) {
    const oldKeys = process.env.OUTBOX_ENCRYPTION_OLD_KEYS.split(',').map((k) => k.trim()).filter(Boolean);
    for (const k of oldKeys) {
      addKey(k);
    }
  }

  // Legacy fallback: JWT_SECRET (ensures previously queued items remain decryptable)
  addKey(process.env.JWT_SECRET);

  // Fallback constant
  addKey('faculty-leave-system-outbox-stable-key-2026');
  addKey('faculty-leave-system-fallback-secret-2026');

  return keys;
};

/**
 * Encrypt sensitive plain text (e.g. passwords, reset tokens) before storing in outbox.
 * Always encrypts using the primary dedicated key.
 *
 * @param {string} text - Plaintext to encrypt
 * @returns {string|null} - Encrypted string in format "iv:tag:ciphertext"
 */
const encryptSensitive = (text) => {
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getPrimaryEncryptionKey(), iv);
  let encrypted = cipher.update(String(text), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
};

/**
 * Decrypt ciphertext back to plain text.
 * Attempts decryption against candidate keys in order to support zero-downtime key rotation
 * and prevent queued credentials from becoming unreadable if JWT_SECRET or OUTBOX_ENCRYPTION_KEY is rotated.
 *
 * @param {string} payload - Encrypted string in format "iv:tag:ciphertext"
 * @returns {string|null} - Decrypted plaintext or null on failure
 */
const decryptSensitive = (payload) => {
  if (!payload || typeof payload !== 'string') return null;
  const parts = payload.split(':');
  if (parts.length !== 3) return null;

  const [ivHex, tagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');

  const candidateKeys = getDecryptionCandidateKeys();

  for (const key of candidateKeys) {
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      // Auth tag mismatch or bad key; try next candidate key
      continue;
    }
  }

  console.error('[cryptoHelper] Decryption failed: none of the available candidate keys matched.');
  return null;
};

module.exports = {
  encryptSensitive,
  decryptSensitive,
  getPrimaryEncryptionKey,
  getDecryptionCandidateKeys,
};
