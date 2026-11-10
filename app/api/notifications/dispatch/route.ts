import { requireApiPermission } from '@/utils/auth/api';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { canManageHealthTips, canManageSchedules } from '@/utils/auth/permissions';
import { createMaternalNotification, createRoleNotification } from '@/utils/notifications';
import { collectRows } from '@/utils/supabase/collectRows';
import { dispatchSmsEvent } from '@/utils/sms/events';
import { createHash } from 'crypto';

export const maxDuration = 60;

type DispatchBody = {
  type: 'appointment' | 'health_tip' | 'risk_alert' | 'care_message' | 'role_alert';
  scheduleId?: string;
  broadcastId?: string;
  pregnantMotherId?: string;
  pregnantMotherIds?: string[];
  title?: string;
  message?: string;
  recipientRole?: string;
  recipientPurok?: string;
  recipientUserId?: string;
};

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  const auth=await requireApiPermission();
  if(auth.error)return auth.error;
  const {supabase,user,profile}=auth;

  // BHW purok users cannot create notifications
  if (profile?.role === 'bhw') {
    return NextResponse.json({ error: 'You are not authorized to create notifications.' }, { status: 403 });
  }

  // Only admin, nurse, and bhw_head can create notifications through this API
  if (!profile?.role || !['admin', 'nurse', 'bhw'].includes(profile.role)) {
    return NextResponse.json({ error: 'You are not authorized to create notifications.' }, { status: 403 });
  }

  const body = await request.json() as DispatchBody;
  const notificationKey = (recipientKey: string, title: string, message: string) =>
    createHash('sha256').update(`${user.id}:${recipientKey}:${title}:${message}`).digest('hex');

  // BHW purok users cannot create appointment notifications (schedule-related)
  if (body.type === 'appointment' && !canManageSchedules(profile.role)) {
    return NextResponse.json({ error: 'You do not have permission to create appointment notifications.' }, { status: 403 });
  }

  if ((body.type === 'risk_alert' || body.type === 'role_alert') && profile.role !== 'nurse' && body.type === 'risk_alert') {
    return NextResponse.json({ error: 'Only Nurses can send risk-based health advice.' }, { status: 403 });
  }

  if (body.type === 'role_alert' && body.title && body.message && (body.recipientRole || body.recipientPurok || body.recipientUserId)) {
    const notification = await createRoleNotification(supabase, {
      eventKey: `role-alert:${notificationKey(body.recipientUserId || body.recipientRole || body.recipientPurok || 'all', body.title, body.message)}`,
      category: 'system',
      title: body.title,
      message: body.message,
      recipientRole: body.recipientRole,
      recipientPurok: body.recipientPurok,
      recipientUserId: body.recipientUserId,
    });
    return NextResponse.json({ success: true, created: notification ? 1 : 0 });
  }
  if (body.type === 'health_tip' && body.broadcastId) {
    if (!canManageHealthTips(profile.role)) return NextResponse.json({ error: 'Only authorized care reviewers can dispatch tips.' }, { status: 403 });
    const admin = createAdminClient();
    const { data: broadcast, error: readError } = await admin.from('tip_broadcasts')
      .select('id, title, content, status').eq('id', body.broadcastId).maybeSingle();
    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
    if (!broadcast || !['approved','sent'].includes(broadcast.status)) return NextResponse.json({ error: 'Approve the broadcast before dispatching.' }, { status: 409 });
    const { data: frozen, error: prepareError } = await admin.rpc('prepare_tip_sms', { broadcast_uuid: broadcast.id, actor_uuid: user.id });
    if (prepareError) return NextResponse.json({ error: prepareError.message }, { status: 409 });
    const frozenBroadcast = Array.isArray(frozen) ? frozen[0] : frozen;
    if (!frozenBroadcast || frozenBroadcast.id !== broadcast.id || !['approved','sent'].includes(frozenBroadcast.status)) {
      return NextResponse.json({ error: 'The approved broadcast could not be loaded. No SMS was submitted.' }, { status: 503 });
    }
    const { data: links, error: linkError } = await collectRows((start,end)=>admin.from('tip_broadcast_recipients')
      .select('pregnant_mother_id').eq('broadcast_id', broadcast.id).order('pregnant_mother_id').range(start,end));
    if (linkError || !links?.length) return NextResponse.json({ error: linkError?.message ?? 'The broadcast has no recipients.' }, { status: 400 });
    try {
      if (frozenBroadcast.status === 'approved') for (const link of links) {
        const notice = await createMaternalNotification(admin, { pregnantMotherId: link.pregnant_mother_id,
          eventKey: `health-tip:${broadcast.id}:${link.pregnant_mother_id}`, category: 'health_tip',
          title: frozenBroadcast.title, message: frozenBroadcast.content });
        if (!notice) throw new Error('A recipient notice could not be created.');
      }
      if (frozenBroadcast.status === 'approved') {
        const { error } = await admin.rpc('complete_tip_broadcast', { broadcast_uuid: broadcast.id });
        if (error) {
          const { data: current } = await admin.from('tip_broadcasts').select('status').eq('id',broadcast.id).maybeSingle();
          if (current?.status !== 'sent') throw new Error(error.message);
        }
      }
      try {
        const sms = await dispatchSmsEvent(`broadcast:${broadcast.id}`, user.id);
        return NextResponse.json({ success: true, created: links.length, sms });
      } catch {
        return NextResponse.json({ success: true, created: links.length, smsError: 'In-app notices sent. SMS processing is unavailable; resume SMS from this broadcast.' });
      }
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Dispatch failed.' }, { status: 500 });
    }
  }

  const targets: { id: string; eventKey: string; category: 'health_tip' | 'appointment' | 'risk_alert' | 'care_message'; title: string; message: string }[] = [];

  if (body.type === 'appointment' && body.scheduleId) {
    const [{ data: schedule }, { data: links }] = await Promise.all([
      supabase.from('prenatal_schedules').select('visit_date').eq('id', body.scheduleId).maybeSingle(),
      supabase.from('prenatal_schedule_recipients').select('pregnant_mother_id').eq('schedule_id', body.scheduleId),
    ]);
    if (schedule) {
      for (const link of links ?? []) targets.push({ id: link.pregnant_mother_id, eventKey: `appointment:${body.scheduleId}:${link.pregnant_mother_id}`, category: 'appointment', title: 'Prenatal appointment scheduled', message: `Your prenatal appointment is scheduled for ${schedule.visit_date}. Please visit the Barangay Health Center on that date.` });
    }
  }


  if (body.type === 'risk_alert' && body.pregnantMotherId && body.message) {
    const title = body.title || 'Important maternal health alert';
    targets.push({ id: body.pregnantMotherId, eventKey: `risk-alert:${notificationKey(body.pregnantMotherId, title, body.message)}`, category: 'risk_alert', title, message: body.message });
  }

  if (body.type === 'care_message' && body.pregnantMotherIds?.length && body.title && body.message) {
    for (const id of body.pregnantMotherIds) targets.push({ id, eventKey: `care-message:${notificationKey(id, body.title, body.message)}`, category: 'care_message', title: body.title, message: body.message });
  }

  let created = 0;
  for (const target of targets) {
    if (await createMaternalNotification(supabase, { pregnantMotherId: target.id, eventKey: target.eventKey, category: target.category, title: target.title, message: target.message })) created++;
  }

  return NextResponse.json({ success: true, created });
}
