export const runtime = 'edge';

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

    // TODO: Update kill switch status in Supabase
    // - Upsert into `system_config` table with key = 'kill_switch'
    // - Set value to { active, updatedAt, updatedBy }
    // - If activating, optionally cancel all pending trade signals

    // TODO: If activating kill switch, handle open positions
    // - Optionally flag open positions for manual review
    // - Log kill switch activation event in `audit_log` table

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
