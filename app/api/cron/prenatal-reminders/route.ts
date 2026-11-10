import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'node:crypto';
import { checkAndSendPrenatalReminders } from '@/utils/checkPrenatalReminders';

export const dynamic = 'force-dynamic';

/* Endpoint for an external scheduler (Supabase Cron + pg_net, Vercel Cron, or any cron-capable host) to trigger the daily reminder run. */
function isAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!provided) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json(
      { error: 'Unauthorized. Send the CRON_SECRET as a Bearer token.' },
      { status: 401 },
    );
  }

  const report = await checkAndSendPrenatalReminders();
  if (!report) {
    return NextResponse.json({ error: 'The reminder run failed.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    ...report,
    // Lets a caller confirm the run actually did something.
    fingerprint: createHash('sha256')
      .update(JSON.stringify(report.details))
      .digest('hex')
      .slice(0, 12),
  });
}

export const POST = GET;
