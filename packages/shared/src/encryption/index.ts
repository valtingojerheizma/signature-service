import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// AES-256-GCM encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyId: string;
}

export interface EncryptionKey {
  id: string;
  key: Buffer;
  createdAt: Date;
  rotatedAt?: Date;
}

/**
 * Derives an encryption key from a master secret using scrypt.
 * This is used for encrypting service account credentials.
 */
export function deriveKey(masterSecret: string, salt: Buffer): Buffer {
  return scryptSync(masterSecret, salt, KEY_LENGTH);
}

/**
 * Generates a random salt for key derivation.
 */
export function generateSalt(): Buffer {
  return randomBytes(SALT_LENGTH);
}

/**
 * Encrypts data using AES-256-GCM.
 *
 * @param plaintext - The data to encrypt
 * @param key - 32-byte encryption key
 * @param keyId - Identifier for the key (for rotation tracking)
 * @returns Encrypted data with IV and auth tag
 */
export function encrypt(
  plaintext: string,
  key: Buffer,
  keyId: string
): EncryptedData {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Key must be ${KEY_LENGTH} bytes`);
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyId,
  };
}

/**
 * Decrypts data encrypted with AES-256-GCM.
 *
 * @param encryptedData - The encrypted data object
 * @param key - 32-byte encryption key
 * @returns Decrypted plaintext
 */
export function decrypt(encryptedData: EncryptedData, key: Buffer): string {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Key must be ${KEY_LENGTH} bytes`);
  }

  const iv = Buffer.from(encryptedData.iv, 'base64');
  const authTag = Buffer.from(encryptedData.authTag, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let plaintext = decipher.update(encryptedData.ciphertext, 'base64', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

/**
 * Encrypts service account credentials.
 *
 * @param credentials - JSON string of service account credentials
 * @param masterSecret - Master encryption secret from environment
 * @param keyId - Current key ID for rotation tracking
 * @returns Encrypted data ready for database storage
 */
export function encryptServiceAccountCredentials(
  credentials: string,
  masterSecret: string,
  keyId: string
): EncryptedData & { salt: string } {
  const salt = generateSalt();
  const key = deriveKey(masterSecret, salt);
  const encrypted = encrypt(credentials, key, keyId);

  return {
    ...encrypted,
    salt: salt.toString('base64'),
  };
}

/**
 * Decrypts service account credentials.
 *
 * @param encryptedData - Encrypted data from database
 * @param salt - Salt used for key derivation (base64 encoded)
 * @param masterSecret - Master encryption secret from environment
 * @returns Decrypted credentials as JSON string
 */
export function decryptServiceAccountCredentials(
  encryptedData: EncryptedData,
  salt: string,
  masterSecret: string
): string {
  const saltBuffer = Buffer.from(salt, 'base64');
  const key = deriveKey(masterSecret, saltBuffer);
  return decrypt(encryptedData, key);
}

/**
 * Validates that a master secret meets minimum security requirements.
 */
export function validateMasterSecret(secret: string): boolean {
  // Minimum 32 characters (256 bits of entropy when using secure random generation)
  return secret.length >= 32;
}

/**
 * Generates a secure random key ID.
 */
export function generateKeyId(): string {
  return `key_${randomBytes(16).toString('hex')}`;
}

/**
 * Key rotation support:
 *
 * When rotating encryption keys:
 * 1. Generate a new keyId using generateKeyId()
 * 2. Re-encrypt all credentials with the new key
 * 3. Update the keyId in the database
 * 4. Keep old key available for a transition period
 *
 * The keyId stored with each encrypted credential allows:
 * - Identifying which key version was used
 * - Gradual re-encryption without downtime
 * - Audit trail of key usage
 */

export interface KeyRotationPlan {
  /**
   * Steps to rotate encryption keys:
   *
   * 1. PREPARATION
   *    - Generate new ENCRYPTION_MASTER_SECRET and ENCRYPTION_KEY_ID
   *    - Add new secret to environment (e.g., ENCRYPTION_MASTER_SECRET_NEW)
   *    - Deploy with both old and new secrets available
   *
   * 2. RE-ENCRYPTION
   *    - Query all WorkspaceConnections
   *    - For each, decrypt with old key, encrypt with new key
   *    - Update database atomically
   *    - Track progress and handle failures
   *
   * 3. VALIDATION
   *    - Verify all records use new keyId
   *    - Test decryption with new key
   *
   * 4. CLEANUP
   *    - Remove old secret from environment
   *    - Update ENCRYPTION_MASTER_SECRET to new value
   *    - Deploy without old secret
   *
   * 5. AUDIT
   *    - Log key rotation event
   *    - Record old keyId retirement date
   */
  steps: string[];
}
