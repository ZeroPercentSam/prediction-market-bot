/**
 * Whale Scan Job — Scans top markets for whale activity
 *
 * Runs every 10 minutes. Fetches the top 50 most active markets by volume,
 * checks each for whale trades, and stores signals + individual trades.
 */

import { supabase, startPipelineRun, completePipelineRun } from "../lib/config.js";
import { getWhaleSignal, applyWhaleAdjustment } from "../lib/whale-tracker.js";

const TOP_MARKETS = 50;
const PARALLEL_BATCH = 5; // Process 5 markets at a time to avoid rate limits

export async function runWhaleScanJob(): Promise<void> {
  const runId = await startPipelineRun("whale-scan");
  const start = Date.now();

  try {
    // Fetch top 50 most active markets by volume
    const { data: markets, error: fetchError } = await supabase
      .from("markets")
      .select("id, platform_market_id, question, current_yes_price, platform")
      .eq("is_active", true)
      .eq("platform", "polymarket")
      .order("volume_24h", { ascending: false })
      .limit(TOP_MARKETS);

    if (fetchError) {
      console.error("[whale-scan] Failed to fetch markets:", fetchError.message);
      await completePipelineRun(runId, {
        status: "error",
        marketsProcessed: 0,
        durationMs: Date.now() - start,
        error: fetchError.message,
      });
      return;
    }

    if (!markets || markets.length === 0) {
      console.log("[whale-scan] No active markets to scan");
      await completePipelineRun(runId, {
        status: "success",
        marketsProcessed: 0,
        durationMs: Date.now() - start,
      });
      return;
    }

    let signalCount = 0;
    let tradeCount = 0;

    // Process markets in parallel batches
    for (let i = 0; i < markets.length; i += PARALLEL_BATCH) {
      const batch = markets.slice(i, i + PARALLEL_BATCH);
      const results = await Promise.all(
        batch.map(async (m) => {
          const signal = await getWhaleSignal(m.platform_market_id, m.id);
          if (!signal) return { signals: 0, trades: 0 };

          // Store individual whale trades
          if (signal.recentTrades.length > 0) {
            // Ensure whale wallets exist
            const walletAddresses = [...new Set(signal.recentTrades.map((t) => t.wallet))];
            for (const addr of walletAddresses) {
              if (!addr) continue;
              const { error: walletError } = await supabase
                .from("whale_wallets")
                .upsert(
                  { address: addr, label: signal.recentTrades.find((t) => t.wallet === addr)?.name || "anon", last_active_at: new Date().toISOString() },
                  { onConflict: "address" }
                );
              if (walletError) {
                console.warn(`[whale-scan] Failed to upsert wallet ${addr}:`, walletError.message);
              }
            }

            // Look up wallet IDs
            const { data: walletRows } = await supabase
              .from("whale_wallets")
              .select("id, address")
              .in("address", walletAddresses);

            const walletMap = new Map(
              (walletRows || []).map((w) => [w.address, w.id])
            );

            // Insert trades
            const tradeRows = signal.recentTrades
              .filter((t) => walletMap.has(t.wallet))
              .map((t) => ({
                wallet_id: walletMap.get(t.wallet),
                market_id: m.id,
                side: t.side === "BUY" ? "buy_yes" : "sell_yes",
                size: t.size,
                price: t.price,
                dollar_value: t.dollarValue,
                timestamp: t.timestamp ? new Date(t.timestamp * 1000).toISOString() : new Date().toISOString(),
              }));

            if (tradeRows.length > 0) {
              const { error: tradeError } = await supabase
                .from("whale_trades")
                .insert(tradeRows);
              if (tradeError) {
                console.warn(`[whale-scan] Failed to insert trades for ${m.id}:`, tradeError.message);
              }
            }

            return { signals: 1, trades: tradeRows.length };
          }

          return { signals: 1, trades: 0 };
        })
      );

      for (const r of results) {
        signalCount += r.signals;
        tradeCount += r.trades;
      }
    }

    const duration = Date.now() - start;
    await completePipelineRun(runId, {
      status: "success",
      marketsProcessed: markets.length,
      durationMs: duration,
    });

    console.log(
      `[whale-scan] Scanned ${markets.length} markets, found ${signalCount} whale signals, ${tradeCount} trades`
    );
  } catch (error) {
    await completePipelineRun(runId, {
      status: "error",
      marketsProcessed: 0,
      durationMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Unknown",
    });
    throw error;
  }
}
