import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';
import { recordActivity } from '@/utils/audit/server';
import { clearGatewayConfig, readGatewayConfig, writeGatewayConfig } from '@/utils/sms/gatewayConfig';
import { hasGatewayEncryptionKey, maskGatewayIdentifier } from '@/utils/sms/gatewayCrypto';
import { mergeGatewayConfig } from '@/utils/sms/gatewayPolicy';
import { isSmsDryRun } from '@/utils/sms/semaphore';

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  return !!origin && origin === new URL(request.url).origin;
}

async function activeBhw() {
  const auth = await requireApiPermission('canSendSMS');
  if (auth.error) return { response: auth.error } as const;
  if (auth.role !== 'bhw') {
    return { response: NextResponse.json({ error: 'Only BHW accounts can manage SMS Gateway settings.' }, { status: 403 }) } as const;
  }
  return { auth } as const;
}

export async function GET() {
  const access = await activeBhw();
  if ('response' in access) return access.response;
  const encryptionKeyReady = hasGatewayEncryptionKey();
  if (!encryptionKeyReady) {
    return NextResponse.json({ configured: false, encryptionKeyReady: false, error: 'The server encryption key is not configured.' }, { status: 503 });
  }
  try {
    const saved = await readGatewayConfig();
    return NextResponse.json({
      configured: !!saved,
      encryptionKeyReady: true,
      authMode: saved?.config.authMode ?? null,
      deviceId: saved?.config.deviceId ?? null,
      simNumber: saved?.config.simNumber ?? null,
      deviceHint: maskGatewayIdentifier(saved?.config.deviceId),
      simHint: maskGatewayIdentifier(saved?.config.simNumber),
      dryRun: isSmsDryRun(),
      updatedAt: saved?.updatedAt ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'Saved SMS Gateway settings are unavailable. Check the server encryption key.' }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  const access = await activeBhw();
  if ('response' in access) return access.response;
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  if (!hasGatewayEncryptionKey()) return NextResponse.json({ error: 'The server encryption key is not configured.' }, { status: 503 });
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 8192) return NextResponse.json({ error: 'Settings request is too large.' }, { status: 413 });
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody) > 8192) return NextResponse.json({ error: 'Settings request is too large.' }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(rawBody); } catch { body = null; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid settings request.' }, { status: 400 });
  try {
    const current = (await readGatewayConfig())?.config ?? null;
    const config = mergeGatewayConfig(body, current);
    await writeGatewayConfig(config, access.auth.user.id);
    let auditWarning: string | null = null;
    try {
      await recordActivity(access.auth.profile, 'sms_gateway_config_saved', 'Updated SMS Gateway credentials and device settings', 'sms_gateway_settings');
    } catch {
      auditWarning = 'Settings were saved, but the activity log could not be recorded.';
    }
    return NextResponse.json({ success: true, warning: auditWarning });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SMS Gateway settings could not be saved.';
    const status = /Enter |Choose |SIM number|Invalid SMS Gateway/.test(message) ? 400 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  const access = await activeBhw();
  if ('response' in access) return access.response;
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Request origin could not be verified.' }, { status: 403 });
  try {
    await clearGatewayConfig(access.auth.user.id);
    let auditWarning: string | null = null;
    try {
      await recordActivity(access.auth.profile, 'sms_gateway_config_cleared', 'Cleared SMS Gateway credentials and device settings', 'sms_gateway_settings');
    } catch {
      auditWarning = 'Settings were cleared, but the activity log could not be recorded.';
    }
    return NextResponse.json({ success: true, warning: auditWarning });
  } catch {
    return NextResponse.json({ error: 'SMS Gateway settings could not be cleared.' }, { status: 503 });
  }
}
