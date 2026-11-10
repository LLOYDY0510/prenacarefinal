import 'server-only';
import { createAdminClient } from '@/utils/supabase/admin';
import { decryptGatewayConfig, encryptGatewayConfig, type SmsGatewayConfig } from './gatewayCrypto';

export async function readGatewayConfig(): Promise<{ config: SmsGatewayConfig; updatedAt: string | null } | null> {
  const { data, error } = await createAdminClient().from('sms_gateway_settings')
    .select('settings_ciphertext, updated_at').eq('id', 1).maybeSingle();
  if (error) throw new Error('SMS Gateway settings are unavailable.');
  if (!data) return null;
  return { config: decryptGatewayConfig(data.settings_ciphertext), updatedAt: data.updated_at };
}

export async function writeGatewayConfig(config: SmsGatewayConfig, actorId: string): Promise<void> {
  const { error } = await createAdminClient(actorId).from('sms_gateway_settings').upsert({
    id: 1,
    settings_ciphertext: encryptGatewayConfig(config),
    updated_by: actorId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (error) throw new Error('SMS Gateway settings could not be saved.');
}

export async function clearGatewayConfig(actorId: string): Promise<void> {
  const { error } = await createAdminClient(actorId).from('sms_gateway_settings').delete().eq('id', 1);
  if (error) throw new Error('SMS Gateway settings could not be cleared.');
}
