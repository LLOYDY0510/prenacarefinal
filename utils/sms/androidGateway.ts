import 'server-only';
import { createHash } from 'node:crypto';
import dns from 'node:dns';
import type { SemaphoreSendResult } from './semaphore';
import { readGatewayConfig } from './gatewayConfig';
import type { SmsGatewayConfig } from './gatewayCrypto';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

const BASE = 'https://api.sms-gate.app/3rdparty/v1';
let cached: { header: string; expires: number; fingerprint: string } | null = null;

class GatewayAuthenticationError extends Error {
  constructor(message: string, readonly httpStatus: number) {
    super(message);
  }
}

function configurationFingerprint(config: SmsGatewayConfig): string {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex');
}

async function authorization(config: SmsGatewayConfig): Promise<string> {
  if (config.authMode === 'token' && config.token) return `Bearer ${config.token}`;
  if (!config.username || !config.password) throw new GatewayAuthenticationError('SMS Gateway credentials are incomplete.', 400);
  const fingerprint = configurationFingerprint(config);
  if (cached && cached.fingerprint === fingerprint && cached.expires > Date.now() + 60_000) return cached.header;
  const header = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
  cached = {
    header,
    expires: Date.now() + 3_500_000,
    fingerprint,
  };
  return header;
}

export async function sendGatewayBatch(input: { numbers: string[]; message: string }): Promise<SemaphoreSendResult> {
  const failure = (message: string, httpStatus: number, submissionAttempted = true): SemaphoreSendResult => ({ ok: false, httpStatus, submissionAttempted, raw: null, recipients: [], batchError: message, accepted: false });
  let saved: Awaited<ReturnType<typeof readGatewayConfig>>;
  try {
    saved = await readGatewayConfig();
  } catch {
    return failure('SMS Gateway settings are unavailable. Ask a BHW to review the settings.', 503, false);
  }
  if (!saved?.config.deviceId) return failure('SMS Gateway is not configured. Ask a BHW to set it up.', 400, false);
  if (!saved.config.simNumber) return failure('SMS Gateway SIM slot is not configured. Ask a BHW to update the settings.', 400, false);
  let auth: string;
  try {
    auth = await authorization(saved.config);
  } catch (error) {
    return error instanceof GatewayAuthenticationError
      ? failure(error.message, error.httpStatus, false)
      : failure('SMS Gateway authentication could not be established. No message was submitted.', 502, false);
  }
  if (!input.numbers.length) return failure('No valid recipients.', 400, false);
  let response: Response;
  try {
    response = await fetch(`${BASE}/messages`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        textMessage: { text: input.message },
        phoneNumbers: input.numbers,
        deviceId: saved.config.deviceId,
        simNumber: Number(saved.config.simNumber),
        withDeliveryReport: true,
      }),
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });
  } catch {
    return failure('Gateway submission outcome is unknown. Reconcile before retrying.', 0);
  }
  if (!response.ok) {
    if (response.status === 401) cached = null;
    const message = response.status === 401
      ? saved.config.authMode === 'credentials'
        ? 'SMS Gateway rejected the Cloud Server username and password. Update them in Configure SMS.'
        : 'SMS Gateway rejected the saved API token. Update it in Configure SMS.'
      : response.status === 403
        ? 'SMS Gateway access was denied (HTTP 403). Check the account or token permissions.'
        : response.status === 429
          ? 'SMS Gateway received too many message requests. Try again later.'
          : response.status === 501
            ? 'SMS Gateway does not support this message request (HTTP 501). Check the Public Cloud service.'
            : response.status >= 500
              ? `SMS Gateway returned a server error (HTTP ${response.status}). Review submission before retrying.`
              : `SMS Gateway rejected the message request (HTTP ${response.status}).`;
    return failure(message, response.status);
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return failure('Gateway response was unreadable; submission needs review.', 0);
  }
  if (!data || typeof data !== 'object' || !('id' in data) || typeof data.id !== 'string' || !data.id.trim()) {
    return failure('Gateway returned no message identifier; review submission before retrying.', 0);
  }
  const messageId = data.id;
  return {
    ok: true,
    httpStatus: response.status,
    raw: { id: messageId, state: 'state' in data && typeof data.state === 'string' ? data.state : null, deviceId: saved.config.deviceId },
    batchError: null,
    accepted: true,
    recipients: input.numbers.map(number => ({ number, messageId, status: 'queued', error: null })),
  };
}

export async function gatewayConfigured(): Promise<boolean> {
  try {
    return !!(await readGatewayConfig());
  } catch {
    return false;
  }
}

export async function gatewayStatus() {
  const configured = await gatewayConfigured();
  return {
    accountId: null,
    accountName: 'SMS Gateway Public Cloud',
    configured,
    status: configured ? 'Configured; delivery requires connected phone' : 'Not configured',
    creditBalance: null,
  };
}
