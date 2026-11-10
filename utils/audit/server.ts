import 'server-only';
import { requestMetadata, browserName } from './request';
import { createAdminClient } from '@/utils/supabase/admin';
import type { Profile } from '@/types';

export async function recordActivity(profile: Profile|null, action:string, description:string, target?:string) {
  const {ip,agent}=await requestMetadata();const browser=browserName(agent);
  const {error}=await createAdminClient().from('activity_logs').insert({actor_id:profile?.id??null,actor_name:profile?.full_name??'System',actor_role:profile?.role??null,action,description:description.slice(0,1000),target_id:target??null,ip_address:ip,user_agent:agent,browser,request_id:crypto.randomUUID()});
  if(error) throw new Error('Activity could not be recorded.');
}
