/**
 * Scan Job — Fetches markets from Polymarket + Kalshi in parallel
 */

import { supabase, getConfig, startPipelineRun, completePipelineRun } from "../lib/config.js";
import { findArbOpportunities } from "../lib/arbitrage.js";

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const KALSHI_BASE_URL = "https://api.elections.kalshi.com/trade-api/v2";

export async function runScanJob(): Promise<void> {
  const runId = await startPipelineRun("scan");
  const start = Date.now();

  try {
    // Load configurable thresholds
    const [
      minVolume,
      maxExpiryDays,
      priceSpikeThreshold,
      spreadWideThreshold,
    ] = await Promise.all([
      getConfig("scan_min_volume").catch(() => 200),
      getConfig("scan_max_expiry_days").catch(() => 30),
      getConfig("anomaly_price_spike_pct").catch(() => 10),
      getConfig("anomaly_spread_wide_cents").catch(() => 5),
    ]);

    const cfgMinVolume = Number(minVolume);
    const cfgMaxExpiryDays = Number(maxExpiryDays);
    const cfgPriceSpikeThreshold = Number(priceSpikeThreshold);
    const cfgSpreadWideThreshold = Number(spreadWideThreshold);

    // Fetch from both platforms in parallel
    const [polymarkets, kalshiMarkets] = await Promise.all([
      fetchPolymarkets().catch((e) => {
        console.error("[scan] Polymarket fetch failed:", e.message);
        return [];
      }),
      fetchKalshi().catch((e) => {
        console.error("[scan] Kalshi fetch failed:", e.message);
        return [];
      }),
    ]);

    // Compute Kalshi price changes from previous snapshots
    const kalshiIds = kalshiMarkets.map((m) => m.platformMarketId);
    if (kalshiIds.length > 0) {
      // Look up market UUIDs for Kalshi markets
      const { data: kalshiDbMarkets } = await supabase
        .from("markets")
        .select("id, platform_market_id")
        .eq("platform", "kalshi")
        .in("platform_market_id", kalshiIds);

      if (kalshiDbMarkets && kalshiDbMarkets.length > 0) {
        const uuidToPlat = new Map(kalshiDbMarkets.map((r) => [r.id, r.platform_market_id]));
        const platToUuid = new Map(kalshiDbMarkets.map((r) => [r.platform_market_id, r.id]));
        const uuids = kalshiDbMarkets.map((r) => r.id);

        // Fetch the most recent snapshot for each Kalshi market
        const { data: prevSnapshots } = await supabase
          .from("market_snapshots")
          .select("market_id, yes_price, timestamp")
          .in("market_id", uuids)
          .order("timestamp", { ascending: false });

        if (prevSnapshots && prevSnapshots.length > 0) {
          // Build a map of most recent snapshot per platform_market_id
          const latestSnapshot = new Map<string, number>();
          for (const snap of prevSnapshots) {
            const platId = uuidToPlat.get(snap.market_id);
            if (platId && !latestSnapshot.has(platId)) {
              latestSnapshot.set(platId, Number(snap.yes_price));
            }
          }

          for (const m of kalshiMarkets) {
            const prevPrice = latestSnapshot.get(m.platformMarketId);
            if (prevPrice !== undefined) {
              m.priceChange1h = m.yesPrice - prevPrice;
              m.priceChange24h = m.yesPrice - prevPrice; // best approximation with available data
            }
          }
        }
      }
    }

    const allMarkets = [...polymarkets, ...kalshiMarkets];

    // Filter: configurable min volume and max expiry
    const now = new Date();
    const maxExpiry = new Date(now.getTime() + cfgMaxExpiryDays * 24 * 60 * 60 * 1000);
    const filtered = allMarkets.filter((m) => {
      if (m.volume24h < cfgMinVolume) return false;
      if (m.expiryDate) {
        const exp = new Date(m.expiryDate);
        if (exp > maxExpiry || exp < now) return false;
      }
      return true;
    });

    // Deduplicate by platform + market ID (APIs can return duplicates)
    const seen = new Set<string>();
    const deduped = filtered.filter((m) => {
      const key = `${m.platform}:${m.platformMarketId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Upsert markets
    if (deduped.length > 0) {
      const rows = deduped.map((m) => ({
        platform: m.platform,
        platform_market_id: m.platformMarketId,
        question: m.question,
        description: m.description || "",
        category: m.category || "other",
        current_yes_price: m.yesPrice,
        current_no_price: m.noPrice,
        volume_24h: m.volume24h,
        total_volume: m.totalVolume,
        liquidity: m.liquidity,
        expiry_date: m.expiryDate || null,
        spread_cents: m.spread * 100,
        price_change_1h: m.priceChange1h,
        price_change_24h: m.priceChange24h,
        anomaly_flags: [] as string[],
        is_active: true,
        last_scanned: new Date().toISOString(),
      }));

      const { error: upsertError } = await supabase
        .from("markets")
        .upsert(rows, { onConflict: "platform,platform_market_id" });
      if (upsertError) {
        console.error(`[scan] Failed to upsert markets:`, upsertError.message);
      }
    }

    // Write market snapshots for price change tracking
    if (deduped.length > 0) {
      // Look up market UUIDs for snapshot foreign keys
      const platformIds = deduped.map((m) => m.platformMarketId);
      const { data: marketRows } = await supabase
        .from("markets")
        .select("id, platform_market_id")
        .in("platform_market_id", platformIds);

      if (marketRows && marketRows.length > 0) {
        const idMap = new Map(marketRows.map((r) => [r.platform_market_id, r.id]));
        const snapshotRows = filtered
          .filter((m) => idMap.has(m.platformMarketId))
            .map((m) => ({
            market_id: idMap.get(m.platformMarketId),
            yes_price: m.yesPrice,
            no_price: m.noPrice,
            volume: m.volume24h,
            liquidity: m.liquidity,
            timestamp: new Date().toISOString(),
          }));

        const { error: snapshotError } = await supabase
          .from("market_snapshots")
          .insert(snapshotRows);
        if (snapshotError) {
          console.error(`[scan] Failed to insert snapshots:`, snapshotError.message);
        }
      }
    }

    // Detect anomalies
    let anomalyCount = 0;
    const { data: upserted } = await supabase
      .from("markets")
      .select("id, platform_market_id, price_change_1h, spread_cents, volume_24h")
      .eq("is_active", true);

    if (upserted) {
      const anomalies: Array<{
        market_id: string;
        type: string;
        severity: string;
        description: string;
        value: number;
        threshold: number;
      }> = [];

      for (const m of upserted) {
        const absChange = Math.abs(Number(m.price_change_1h) * 100);
        if (absChange > cfgPriceSpikeThreshold) {
          anomalies.push({
            market_id: m.id,
            type: "price_spike",
            severity: absChange > cfgPriceSpikeThreshold * 2 ? "high" : "medium",
            description: `Price moved ${absChange.toFixed(1)}% in 1 hour`,
            value: absChange,
            threshold: cfgPriceSpikeThreshold,
          });
        }
        if (Number(m.spread_cents) > cfgSpreadWideThreshold) {
          anomalies.push({
            market_id: m.id,
            type: "spread_wide",
            severity: Number(m.spread_cents) > cfgSpreadWideThreshold * 2 ? "high" : "low",
            description: `Spread is ${Number(m.spread_cents).toFixed(1)} cents`,
            value: Number(m.spread_cents),
            threshold: cfgSpreadWideThreshold,
          });
        }
      }

      if (anomalies.length > 0) {
        const { error: anomalyError } = await supabase.from("anomalies").insert(anomalies);
        if (anomalyError) {
          console.error(`[scan] Failed to insert anomalies:`, anomalyError.message);
        }
        anomalyCount = anomalies.length;
      }
    }

    const duration = Date.now() - start;
    await completePipelineRun(runId, {
      status: "success",
      marketsProcessed: filtered.length,
      durationMs: duration,
    });

    // --- DEACTIVATE EXPIRED / RESOLVED MARKETS ---
    let deactivatedCount = 0;
    {
      // Mark markets as inactive if they've expired or resolved (price near $1 or $0)
      const { data: expiredMarkets } = await supabase
        .from("markets")
        .select("id, expiry_date, current_yes_price")
        .eq("is_active", true)
        .not("expiry_date", "is", null)
        .lt("expiry_date", now.toISOString());

      if (expiredMarkets && expiredMarkets.length > 0) {
        const expiredIds = expiredMarkets.map((m) => m.id);
        const { error: deactivateError } = await supabase
          .from("markets")
          .update({ is_active: false })
          .in("id", expiredIds);
        if (deactivateError) {
          console.error("[scan] Failed to deactivate expired markets:", deactivateError.message);
        } else {
          deactivatedCount += expiredIds.length;
        }
      }

      // Also deactivate markets whose price resolved to near $1.00 or $0.00
      const { data: resolvedMarkets } = await supabase
        .from("markets")
        .select("id")
        .eq("is_active", true)
        .or("current_yes_price.gte.0.95,current_yes_price.lte.0.05");

      if (resolvedMarkets && resolvedMarkets.length > 0) {
        // Only deactivate if the market also has an expiry date in the past or is clearly settled
        const resolvedIds = resolvedMarkets.map((m) => m.id);
        const { error: resolveError } = await supabase
          .from("markets")
          .update({ is_active: false })
          .in("id", resolvedIds)
          .not("expiry_date", "is", null)
          .lt("expiry_date", now.toISOString());
        if (resolveError) {
          console.error("[scan] Failed to deactivate resolved markets:", resolveError.message);
        }
      }
    }

    // --- ARBITRAGE SCAN ---
    const arbOpps = await findArbOpportunities().catch((e) => {
      console.error("[scan] Arbitrage scan failed:", e.message);
      return [];
    });

    console.log(
      `[scan] ${polymarkets.length} poly + ${kalshiMarkets.length} kalshi → ${filtered.length} passed filters, ${anomalyCount} anomalies, ${arbOpps.length} arb opportunities, ${deactivatedCount} deactivated`
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

// --- Polymarket ---

interface NormalizedMarket {
  platform: string;
  platformMarketId: string;
  question: string;
  description: string;
  category: string;
  yesPrice: number;
  noPrice: number;
  volume24h: number;
  totalVolume: number;
  liquidity: number;
  expiryDate: string;
  spread: number;
  priceChange1h: number;
  priceChange24h: number;
}

async function fetchPolymarkets(): Promise<NormalizedMarket[]> {
  const all: NormalizedMarket[] = [];
  for (let offset = 0; offset < 500; offset += 100) {
    const url = `${GAMMA_BASE_URL}/markets?closed=false&active=true&limit=100&offset=${offset}&order=volume24hr&ascending=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) break;
    const markets = await res.json();
    if (!Array.isArray(markets) || markets.length === 0) break;

    for (const m of markets) {
      let yesPrice = 0, noPrice = 0;
      try {
        const prices = JSON.parse(m.outcomePrices || "[]");
        yesPrice = parseFloat(prices[0] || "0");
        noPrice = parseFloat(prices[1] || "0");
      } catch { /* skip */ }

      all.push({
        platform: "polymarket",
        platformMarketId: m.conditionId,
        question: m.question,
        description: m.description || "",
        category: "other",
        yesPrice,
        noPrice,
        volume24h: m.volume24hr || 0,
        totalVolume: m.volumeNum || 0,
        liquidity: m.liquidityNum || 0,
        expiryDate: m.endDateIso || "",
        spread: m.spread || 0,
        priceChange1h: m.oneHourPriceChange || 0,
        priceChange24h: m.oneDayPriceChange || 0,
      });
    }
  }
  return all;
}

async function fetchKalshi(): Promise<NormalizedMarket[]> {
  const all: NormalizedMarket[] = [];
  let cursor: string | undefined;

  // Fetch events to build event_ticker -> category map
  const eventCategoryMap = new Map<string, string>();
  try {
    let eventCursor: string | undefined;
    for (let page = 0; page < 5; page++) {
      const eventUrl = new URL(`${KALSHI_BASE_URL}/events`);
      eventUrl.searchParams.set("status", "open");
      eventUrl.searchParams.set("limit", "100");
      if (eventCursor) eventUrl.searchParams.set("cursor", eventCursor);

      const eventRes = await fetch(eventUrl.toString(), { signal: AbortSignal.timeout(30000) });
      if (!eventRes.ok) break;
      const eventData = await eventRes.json();
      if (!eventData.events || eventData.events.length === 0) break;

      for (const ev of eventData.events) {
        if (ev.event_ticker && ev.category) {
          eventCategoryMap.set(ev.event_ticker, ev.category);
        }
      }

      eventCursor = eventData.cursor;
      if (!eventCursor) break;
    }
  } catch (e) {
    console.error("[scan] Failed to fetch Kalshi events for categories:", (e as Error).message);
  }

  for (let page = 0; page < 5; page++) {
    const url = new URL(`${KALSHI_BASE_URL}/markets`);
    url.searchParams.set("status", "open");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30000) });
    if (!res.ok) break;
    const data = await res.json();
    if (!data.markets || data.markets.length === 0) break;

    for (const m of data.markets) {
      const yesBid = parseFloat(m.yes_bid_dollars || "0");
      const yesAsk = parseFloat(m.yes_ask_dollars || "0");
      const yesPrice = yesBid && yesAsk ? (yesBid + yesAsk) / 2 : parseFloat(m.last_price_dollars || "0");
      const category = eventCategoryMap.get(m.event_ticker) || "unknown";

      all.push({
        platform: "kalshi",
        platformMarketId: m.ticker,
        question: m.title,
        description: m.rules_primary || "",
        category,
        yesPrice,
        noPrice: 1 - yesPrice,
        volume24h: parseFloat(m.volume_24h_fp || "0"),
        totalVolume: parseFloat(m.volume_fp || "0"),
        liquidity: parseFloat(m.liquidity_dollars || "0"),
        expiryDate: m.expiration_time || m.close_time || "",
        spread: Math.max(0, yesAsk - yesBid),
        priceChange1h: 0,
        priceChange24h: 0,
      });
    }

    cursor = data.cursor;
    if (!cursor) break;
  }
  return all;
}
