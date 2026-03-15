import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SEPARATOR = ':';

function getEncryptionKey(): Buffer {
  const hex = process.env['TOKEN_ENCRYPTION_KEY'];
  if (hex === undefined || hex.length === 0) {
    throw new Error('TOKEN_ENCRYPTION_KEY env var is required');
  }
  return Buffer.from(hex, 'hex');
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), encrypted.toString('base64'), authTag.toString('base64')].join(SEPARATOR);
}

export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const [ivB64, encB64, tagB64] = ciphertext.split(SEPARATOR);
  if (ivB64 === undefined || encB64 === undefined || tagB64 === undefined) {
    throw new Error('Invalid ciphertext format');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const encrypted = Buffer.from(encB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}
