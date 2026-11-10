import { NextResponse } from 'next/server';
import { requireApiPermission } from '@/utils/auth/api';
import { gatewayStatus } from '@/utils/sms/androidGateway';
import { isSmsDryRun } from '@/utils/sms/semaphore';
import { getSmsSchemaCapabilities } from '@/utils/sms/schema';

// Report configuration without contacting the phone or submitting a message.
export async function GET() {
  const auth=await requireApiPermission('canSendSMS');
  if(auth.error)return auth.error;
  const account=await gatewayStatus();const configured=account.configured;
  let migration014Present=false;
  try{migration014Present=(await getSmsSchemaCapabilities()).hasReceipts;}catch{}
  return NextResponse.json({ok:configured&&migration014Present,dryRun:isSmsDryRun(),provider:'android_sms_gateway',mode:'public_cloud',numberFormat:'plus63',configured,cronSecretSet:!!process.env.CRON_SECRET?.trim(),migration014Present,deliveryVerified:false,account:{accountName:account.accountName,status:account.status,creditBalance:null},accountError:configured?null:'Configure SMS Gateway settings from the BHW SMS dashboard.'});
}
