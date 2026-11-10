import 'server-only';
import { createAdminClient } from '@/utils/supabase/admin';
import { isEmailConfigured, sendEmail } from '@/utils/email/mailer';
import { canEmailRecipient } from '@/utils/email/recipients';
import type { SupabaseClient } from '@supabase/supabase-js';

type NotificationInput = {
  pregnantMotherId: string;
  eventKey: string;
  category: 'health_tip' | 'prenatal_reminder' | 'appointment' | 'missed_visit' | 'risk_alert' | 'care_message' | 'system' | 'staff' | 'maternal_report' | 'follow_up' | 'referral' | 'record_update' | 'program_recommendation';
  title: string;
  message: string;
};

export type RoleNotificationInput = {
  eventKey: string;
  category: NotificationInput['category'];
  title: string;
  message: string;
  recipientUserId?: string | null;
  recipientRole?: string | null;
  recipientPurok?: string | null;
};

type NotificationClient = SupabaseClient;

export async function createMaternalNotification(
  supabase: NotificationClient,
  input: NotificationInput,
) {
  const { data: mother } = await supabase
    .from('pregnant_mothers')
    .select('id, full_name')
    .eq('id', input.pregnantMotherId)
    .maybeSingle();
  if (!mother) return null;

  const delivery = createAdminClient();
  const { data: profile } = await delivery
    .from('profiles')
    .select('email')
    .eq('pregnant_mother_id', input.pregnantMotherId)
    .maybeSingle();
  const email = profile?.email?.trim().toLowerCase() || null;

  const { data: notification, error } = await delivery
    .from('maternal_notifications')
    .insert({
      pregnant_mother_id: input.pregnantMotherId,
      event_key: input.eventKey,
      category: input.category,
      title: input.title,
      message: input.message,
      email,
      email_status: canEmailRecipient(email) && isEmailConfigured() ? 'pending' : 'skipped',
    })
    .select('id, email, email_status')
    .maybeSingle();

  if (error?.code === '23505') {
    const { data: existing } = await delivery.from('maternal_notifications').select('id, email, email_status').eq('event_key', input.eventKey).maybeSingle();
    return existing;
  }
  if (error) throw new Error(error.message);
  if (error || !notification || notification.email_status === 'skipped' || !notification.email) return notification;

  try {
    await sendEmail({
      to: notification.email,
      subject: input.title,
      text: `${input.message}\n\nOpen Prenatrack to view this update.`,
    });
    await delivery.from('maternal_notifications').update({
      email_status: 'sent',
      email_sent_at: new Date().toISOString(),
      email_error: null,
    }).eq('id', notification.id);
  } catch (emailError) {
    await delivery.from('maternal_notifications').update({
      email_status: 'failed',
      email_error: emailError instanceof Error ? emailError.message : String(emailError),
    }).eq('id', notification.id);
  }

  return notification;
}

export async function createRoleNotification(
  supabase: NotificationClient,
  input: RoleNotificationInput,
) {
  const { data: notification, error } = await supabase
    .from('maternal_notifications')
    .insert({
      pregnant_mother_id: null,
      recipient_user_id: input.recipientUserId ?? null,
      recipient_role: input.recipientRole ?? null,
      recipient_purok: input.recipientPurok ?? null,
      event_key: input.eventKey,
      category: input.category,
      title: input.title,
      message: input.message,
      email_status: 'skipped',
    })
    .select('id, email_status')
    .maybeSingle();

  if (error?.code === '23505' || error) return null;
  return notification;
}
