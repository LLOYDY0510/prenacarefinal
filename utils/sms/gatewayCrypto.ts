import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const AAD = Buffer.from('prenatrack:sms-gateway-settings:v1');

export type SmsGatewayConfig = {
  authMode: 'token' | 'credentials';
  token: string | null;
  username: string | null;
  password: string | null;
  deviceId: string;
  simNumber: string | null;
};

function parseKey(value: string): Buffer {
  const normalized = value.trim();
  const key = Buffer.from(normalized, 'base64');
  if (key.length !== 32 || key.toString('base64').replace(/=+$/, '') !== normalized.replace(/=+$/, '')) {
    throw new Error('SMS Gateway encryption key is invalid.');
  }
  return key;
}

export function gatewayEncryptionKey(): Buffer {
  const value = process.env.SMS_GATEWAY_CONFIG_ENCRYPTION_KEY;
  if (!value?.trim()) throw new Error('SMS Gateway encryption key is not configured.');
  return parseKey(value);
}

export function hasGatewayEncryptionKey(): boolean {
  try {
    gatewayEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptGatewayConfig(config: SmsGatewayConfig, key = gatewayEncryptionKey()): string {
  if (key.length !== 32) throw new Error('SMS Gateway encryption key is invalid.');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
  return JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: ciphertext.toString('base64') });
}

export function decryptGatewayConfig(envelope: string, key = gatewayEncryptionKey()): SmsGatewayConfig {
  if (key.length !== 32) throw new Error('SMS Gateway encryption key is invalid.');
  try {
    const parsed = JSON.parse(envelope) as { version?: number; iv?: string; tag?: string; data?: string };
    if (parsed.version !== 1 || !parsed.iv || !parsed.tag || !parsed.data) throw new Error();
    const iv = Buffer.from(parsed.iv, 'base64');
    const tag = Buffer.from(parsed.tag, 'base64');
    if (iv.length !== 12 || tag.length !== 16) throw new Error();
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    const clear = Buffer.concat([decipher.update(Buffer.from(parsed.data, 'base64')), decipher.final()]).toString('utf8');
    const value = JSON.parse(clear) as SmsGatewayConfig;
    if (!['token', 'credentials'].includes(value.authMode) || typeof value.deviceId !== 'string' ||
      (value.authMode === 'token' && typeof value.token !== 'string') ||
      (value.authMode === 'credentials' && (typeof value.username !== 'string' || typeof value.password !== 'string'))) throw new Error();
    return value;
  } catch {
    throw new Error('Saved SMS Gateway settings cannot be decrypted. Check the server encryption key.');
  }
}

export function maskGatewayIdentifier(value: string | null | undefined): string | null {
  if (!value) return null;
  const tail = value.slice(-4);
  return `••••${tail}`;
}
