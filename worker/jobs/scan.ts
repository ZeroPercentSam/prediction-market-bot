/**
 * Scan Job — Fetches markets from Polymarket + Kalshi in parallel
 */

import { supabase, startPipelineRun, completePipelineRun } from "../lib/config.js";
import { findArbOpportunities } from "../lib/arbitrage.js";

const GAMMA_BASE_URL = "https://gamma-api.polymarket.com";
const KALSHI_BASE_URL = "https://api.elections.kalshi.com/trade-api/v2";

export async function runScanJob(): Promise<void> {
  const runId = await startPipelineRun("scan");
  const start = Date.now();

  try {
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

    const allMarkets = [...polymarkets, ...kalshiMarkets];

    // Filter: min volume 200, max 30 day expiry
    const now = new Date();
    const maxExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const filtered = allMarkets.filter((m) => {
      if (m.volume24h < 200) return false;
      if (m.expiryDate) {
        const exp = new Date(m.expiryDate);
        if (exp > maxExpiry || exp < now) return false;
      }
      return true;
    });

    // Upsert markets
    if (filtered.length > 0) {
      const rows = filtered.map((m) => ({
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

      await supabase
        .from("markets")
        .upsert(rows, { onConflict: "platform,platform_market_id" });
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
        if (absChange > 10) {
          anomalies.push({
            market_id: m.id,
            type: "price_spike",
            severity: absChange > 20 ? "high" : "medium",
            description: `Price moved ${absChange.toFixed(1)}% in 1 hour`,
            value: absChange,
            threshold: 10,
          });
        }
        if (Number(m.spread_cents) > 5) {
          anomalies.push({
            market_id: m.id,
            type: "spread_wide",
            severity: Number(m.spread_cents) > 10 ? "high" : "low",
            description: `Spread is ${Number(m.spread_cents).toFixed(1)} cents`,
            value: Number(m.spread_cents),
            threshold: 5,
          });
        }
      }

      if (anomalies.length > 0) {
        await supabase.from("anomalies").insert(anomalies);
        anomalyCount = anomalies.length;
      }
    }

    const duration = Date.now() - start;
    await completePipelineRun(runId, {
      status: "success",
      marketsProcessed: filtered.length,
      durationMs: duration,
    });

    // --- ARBITRAGE SCAN ---
    const arbOpps = await findArbOpportunities().catch((e) => {
      console.error("[scan] Arbitrage scan failed:", e.message);
      return [];
    });

    console.log(
      `[scan] ${polymarkets.length} poly + ${kalshiMarkets.length} kalshi → ${filtered.length} passed filters, ${anomalyCount} anomalies, ${arbOpps.length} arb opportunities`
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
    const res = await fetch(url);
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

  for (let page = 0; page < 5; page++) {
    const url = new URL(`${KALSHI_BASE_URL}/markets`);
    url.searchParams.set("status", "open");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString());
    if (!res.ok) break;
    const data = await res.json();
    if (!data.markets || data.markets.length === 0) break;

    for (const m of data.markets) {
      const yesBid = parseFloat(m.yes_bid_dollars || "0");
      const yesAsk = parseFloat(m.yes_ask_dollars || "0");
      const yesPrice = yesBid && yesAsk ? (yesBid + yesAsk) / 2 : parseFloat(m.last_price_dollars || "0");

      all.push({
        platform: "kalshi",
        platformMarketId: m.ticker,
        question: m.title,
        description: m.rules_primary || "",
        category: "",
        yesPrice,
        noPrice: 1 - yesPrice,
        volume24h: parseFloat(m.volume_24h_fp || "0"),
        totalVolume: parseFloat(m.volume_fp || "0"),
        liquidity: parseFloat(m.liquidity_dollars || "0"),
        expiryDate: m.expiration_time || m.close_time || "",
        spread: yesAsk - yesBid,
        priceChange1h: 0,
        priceChange24h: 0,
      });
    }

    cursor = data.cursor;
    if (!cursor) break;
  }
  return all;
}
