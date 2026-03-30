export const runtime = 'edge';

import { createServerClient } from "@/lib/supabase/client";

export async function POST(request: Request) {
  // Allow authenticated cron calls or internal dashboard calls (same origin)
  const authHeader = request.headers.get('authorization');
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const isInternalCall = origin || referer;

  if (!isInternalCall && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { active } = body as { active: boolean };

    if (typeof active !== 'boolean') {
      return Response.json(
        { error: 'Invalid request body. Expected { active: boolean }' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Upsert kill switch status into system_config
    const { error: upsertError } = await supabase
      .from('system_config')
      .upsert(
        {
          key: 'kill_switch',
          value: {
            active,
            updatedAt: new Date().toISOString(),
            updatedBy: 'dashboard',
          },
        },
        { onConflict: 'key' }
      );

    if (upsertError) {
      throw new Error(`Failed to update kill switch: ${upsertError.message}`);
    }

    // If activating, cancel all pending trade signals
    if (active) {
      await supabase
        .from('trade_signals')
        .update({ status: 'cancelled' })
        .eq('status', 'pending');
    }

    return Response.json({
      status: 'success',
      killSwitch: {
        active,
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[KillSwitch] Error:', error);
    return Response.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
