export type SmsErrorKind = 'invalid_apikey' | 'no_sender_name' | 'no_credits' | 'invalid_number' | 'network' | 'unconfigured' | 'other';

// Shared fallback text for server responses and client error displays.
export function classifySmsError(message: string | null | undefined): {kind:SmsErrorKind;friendly:string} {
  const text=(message??'').toLowerCase();
  if(text.includes('not configured')||text.includes('configure sms gateway')||text.includes('semaphore_api_key is missing'))return {kind:'unconfigured',friendly:'SMS Gateway is not configured. Ask an administrator to check the cloud credentials and device.'};
  if(text.includes('authentication')||text.includes('http 401')||text.includes('apikey'))return {kind:'invalid_apikey',friendly:'SMS authentication failed. Ask an administrator to verify the provider credentials.'};
  if(text.includes('sender')&&(text.includes('invalid')||text.includes('approved')))return {kind:'no_sender_name',friendly:'The provider rejected the sender configuration. Ask an administrator to review it.'};
  if(text.includes('credit')||text.includes('balance')||text.includes('insufficient'))return {kind:'no_credits',friendly:'The provider reported insufficient sending capacity. Review the account or SIM before retrying.'};
  if(text.includes('number')&&(text.includes('invalid')||text.includes('format')||text.includes('not a valid')))return {kind:'invalid_number',friendly:'Verify the recipient’s Philippine mobile number before retrying.'};
  if(text.includes('unknown')||text.includes('network')||text.includes('fetch failed')||text.includes('timeout')||text.includes('unreadable'))return {kind:'network',friendly:'The submission outcome is uncertain. Check the provider and dispatch record before retrying.'};
  return {kind:'other',friendly:message||'The provider did not explain the failure. Review the SMS log.'};
}
