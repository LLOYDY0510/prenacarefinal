import type { SmsGatewayConfig } from './gatewayCrypto';

type GatewayConfigInput = {
  authMode?: unknown;
  token?: unknown;
  username?: unknown;
  password?: unknown;
  deviceId?: unknown;
  simNumber?: unknown;
};

const INPUT_KEYS = new Set(['authMode', 'token', 'username', 'password', 'deviceId', 'simNumber']);

function text(value: unknown, field: string, limit: number): string {
  if (typeof value !== 'string' || value.length > limit || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`Enter a valid ${field}.`);
  }
  return value;
}

export function mergeGatewayConfig(input: GatewayConfigInput, current: SmsGatewayConfig | null): SmsGatewayConfig {
  if (!input || typeof input !== 'object' || Object.keys(input).some((key) => !INPUT_KEYS.has(key))) {
    throw new Error('Invalid SMS Gateway settings request.');
  }
  if (input.authMode !== 'token' && input.authMode !== 'credentials') {
    throw new Error('Choose an authentication method.');
  }
  const authMode = input.authMode;
  const sameMode = current?.authMode === authMode;
  const deviceEntry = input.deviceId === undefined ? '' : text(input.deviceId, 'device ID', 200).trim();
  const deviceId = deviceEntry || current?.deviceId || '';
  if (!deviceId) throw new Error('Enter the SMS Gateway device ID.');

  let simNumber = current?.simNumber ?? null;
  if (input.simNumber !== undefined) {
    const value = text(input.simNumber, 'SIM number', 8).trim();
    if (!value) simNumber = null;
    else if (!/^[1-3]$/.test(value)) throw new Error('SIM slot number must be from 1 to 3.');
    else simNumber = value;
  }
  if (!simNumber) throw new Error('Enter the SIM slot number used to send SMS.');

  if (authMode === 'token') {
    const entered = input.token === undefined ? '' : text(input.token, 'API token', 4096).trim();
    const token = entered || (sameMode ? current?.token : null) || '';
    if (!token) throw new Error('Enter the SMS Gateway API token.');
    return { authMode, token, username: null, password: null, deviceId, simNumber };
  }

  const enteredUsername = input.username === undefined ? '' : text(input.username, 'username', 320).trim();
  const enteredPassword = input.password === undefined ? '' : text(input.password, 'password', 2048);
  const username = enteredUsername || (sameMode ? current?.username : null) || '';
  const password = enteredPassword || (sameMode ? current?.password : null) || '';
  if (!username || !password) throw new Error('Enter both the SMS Gateway username and password.');
  return { authMode, token: null, username, password, deviceId, simNumber };
}
